import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  axeSummary, tabReport, type AxeViolation, type FieldFact, type FocusStyle, type LinkFact, type MarkupFacts,
  type TabReport, type TabStep,
} from './checks';

// Fact collectors that run in the page. Functions passed to page.evaluate are serialized, so
// each one is self-contained.

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function axeScan(page: Page): Promise<{ violations: AxeViolation[]; rulesRun: number }> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return {
    violations: axeSummary(results.violations),
    rulesRun: results.passes.length + results.violations.length + results.incomplete.length,
  };
}

interface TabWalkWindow {
  __tabWalkFields: Element[];
  __tabWalkStyle: (el: Element) => FocusStyle;
}

// Presses Tab from the top of the page through every focusable element and reports which form
// fields got focus, in which order, and whether each showed a focus indicator.
export async function tabWalk(page: Page): Promise<TabReport> {
  const setup = await page.evaluate(() => {
    const w = window as unknown as TabWalkWindow;
    // Start sequential focus navigation at the top of the document, whatever had focus.
    const body = document.body;
    body.tabIndex = -1;
    body.focus();
    body.removeAttribute('tabindex');

    w.__tabWalkStyle = (el: Element) => {
      const s = getComputedStyle(el);
      return {
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth,
        outlineColor: s.outlineColor,
        boxShadow: s.boxShadow,
        borderColor: s.borderColor,
        borderWidth: s.borderWidth,
        backgroundColor: s.backgroundColor,
      };
    };
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const nameOf = (el: Element): string => {
      const ids = el.getAttribute('aria-labelledby');
      if (ids) return ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      const aria = el.getAttribute('aria-label');
      if (aria) return aria;
      const labels = (el as HTMLInputElement).labels;
      const labelText = labels ? Array.from(labels).map((l) => l.innerText).join(' ') : '';
      if (labelText.trim()) return labelText;
      if (el instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(el.type)) return el.value;
      if (el instanceof HTMLButtonElement) return el.innerText;
      return el.getAttribute('title') ?? '';
    };

    const fields = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea, button'))
      .filter((el) => shown(el) && !(el as HTMLInputElement).disabled);
    w.__tabWalkFields = fields;
    const focusables = document.querySelectorAll(
      'a[href], area[href], input:not([type=hidden]), select, textarea, button, iframe, summary, [tabindex], [contenteditable]',
    ).length;
    return {
      focusables,
      fields: fields.map((el) => {
        const r = el.getBoundingClientRect();
        const kind = el.tagName.toLowerCase() + (el instanceof HTMLInputElement ? `[${el.type}]` : '');
        return {
          description: `${kind} "${nameOf(el).replace(/\s+/g, ' ').trim()}"`,
          box: { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height },
          unfocused: w.__tabWalkStyle(el),
        };
      }),
    };
  });

  const steps: TabStep[] = [];
  // One full pass plus a little: focus leaves the page after the last element and comes back.
  for (let i = 0; i < setup.focusables + 2; i++) {
    await page.keyboard.press('Tab');
    steps.push(await page.evaluate(() => {
      const w = window as unknown as TabWalkWindow;
      const el = document.activeElement;
      const index = el ? w.__tabWalkFields.indexOf(el) : -1;
      return index < 0 || !el ? { field: null } : { field: index, focused: w.__tabWalkStyle(el) };
    }));
  }
  return tabReport(setup.fields as FieldFact[], steps);
}

// Every visible link with an approximation of its accessible name (aria-labelledby, aria-label,
// then rendered text with image alt text, then title) and its resolved target.
export async function linkFacts(page: Page): Promise<LinkFact[]> {
  return page.evaluate(() => {
    const hidden = (el: Element): boolean => {
      if (el.getAttribute('aria-hidden') === 'true') return true;
      const s = getComputedStyle(el);
      return s.display === 'none' || s.visibility === 'hidden';
    };
    const textOf = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node as Element;
      if (hidden(el)) return '';
      if (el.tagName === 'IMG') return el.getAttribute('alt') ?? '';
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria;
      return Array.from(el.childNodes).map(textOf).join(' ');
    };
    const nameOf = (el: Element): string => {
      const ids = el.getAttribute('aria-labelledby');
      const labelled = ids ? ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim() : '';
      if (labelled) return labelled;
      const aria = el.getAttribute('aria-label')?.trim();
      if (aria) return aria;
      const text = Array.from(el.childNodes).map(textOf).join(' ').replace(/\s+/g, ' ').trim();
      return text || (el.getAttribute('title') ?? '').trim();
    };
    return Array.from(document.querySelectorAll('a[href], [role=link]'))
      .filter((el) => !hidden(el) && el.getClientRects().length > 0)
      .map((el) => ({
        name: nameOf(el),
        target: el instanceof HTMLAnchorElement ? el.href : '',
      }));
  });
}

export async function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

// Elements that exist only when a name was written into the page as HTML, and the stored name
// parts that are not shown as literal text. Dialogs are counted by the caller.
export async function markupFacts(page: Page, literals: string[]): Promise<Omit<MarkupFacts, 'dialogs'>> {
  return page.evaluate((parts) => {
    const text = document.body.innerText;
    return {
      boldElements: document.querySelectorAll('b').length,
      injectedImages: document.querySelectorAll('img[src="x"]').length,
      injectedScripts: Array.from(document.scripts).filter((s) => !s.src && s.text.includes('alert(')).length,
      missingLiterals: parts.filter((p) => !text.includes(p)),
    };
  }, literals);
}
