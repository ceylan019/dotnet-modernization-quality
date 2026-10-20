// Decisions behind the accessibility and security gates. The browser side only collects facts
// (boxes, styles, names, headers, text); the rules live here, so unit tests can show that each
// gate fails when it should.

// ---- Error responses (RISK-SEC-02) ----

export const LEAK_MARKERS = ['Stack Trace', '   at ', 'System.', 'Exception'] as const;

export function leakMarkers(text: string): string[] {
  return LEAK_MARKERS.filter((m) => text.includes(m));
}

// ---- Response headers (RISK-SEC-03) ----

export const REQUIRED_HEADERS = ['x-content-type-options', 'content-security-policy', 'referrer-policy'] as const;
export const FORBIDDEN_HEADERS = ['x-aspnet-version', 'x-powered-by'] as const;

// Header name (lower case) -> value, or null when the response does not send it.
export type HeaderFindings = Record<string, string | null>;

export function headerFindings(headers: Record<string, string>): HeaderFindings {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return Object.fromEntries(
    [...REQUIRED_HEADERS, ...FORBIDDEN_HEADERS].map((name) => [name, lower.get(name) ?? null]),
  );
}

export function headerProblems(f: HeaderFindings): string[] {
  const problems: string[] = [];
  const nosniff = f['x-content-type-options'] ?? null;
  if (nosniff?.trim().toLowerCase() !== 'nosniff') {
    problems.push(`x-content-type-options is ${nosniff === null ? 'missing' : JSON.stringify(nosniff)}, expected "nosniff"`);
  }
  for (const name of ['content-security-policy', 'referrer-policy']) {
    if (!f[name]?.trim()) problems.push(`${name} is missing`);
  }
  for (const name of FORBIDDEN_HEADERS) {
    if (f[name] !== null && f[name] !== undefined) problems.push(`${name} is present (${JSON.stringify(f[name])})`);
  }
  return problems;
}

// ---- Link names (RISK-A11Y-04) ----

export interface LinkFact {
  name: string;
  target: string;
}

// Links that sound the same to a screen reader user must lead to the same place. Names are
// compared with whitespace collapsed and case ignored.
export function ambiguousLinks(links: LinkFact[]): { name: string; targets: string[] }[] {
  const byName = new Map<string, { name: string; targets: Set<string> }>();
  for (const link of links) {
    const name = link.name.replace(/\s+/g, ' ').trim();
    const key = name.toLowerCase();
    const entry = byName.get(key) ?? { name, targets: new Set<string>() };
    entry.targets.add(link.target);
    byName.set(key, entry);
  }
  return [...byName.values()]
    .filter((e) => e.targets.size > 1)
    .map((e) => ({ name: e.name, targets: [...e.targets].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Keyboard order and focus (RISK-A11Y-02) ----

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Two boxes are on one line when their vertical extents overlap by at least half the smaller height.
function sameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= Math.min(a.height, b.height) / 2;
}

// Reading order: top to bottom, left to right within a line. Returns indexes into `boxes`.
export function visualOrder(boxes: Box[]): number[] {
  return boxes
    .map((_, i) => i)
    .sort((i, j) => {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const d = sameLine(a, b) ? a.x - b.x : a.y - b.y;
      return d !== 0 ? d : i - j;
    });
}

export interface FocusStyle {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
  borderColor: string;
  borderWidth: string;
  backgroundColor: string;
}

function transparent(color: string): boolean {
  if (color === 'transparent') return true;
  const m = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(color);
  return m !== null && Number(m[1]) === 0;
}

// A focused control shows an indicator when it has a visible outline, or when its shadow,
// border or background differ from the unfocused control.
export function focusIndicatorVisible(unfocused: FocusStyle, focused: FocusStyle): boolean {
  const outline = focused.outlineStyle !== 'none'
    && Number.parseFloat(focused.outlineWidth) > 0
    && !transparent(focused.outlineColor);
  const shadow = focused.boxShadow !== 'none' && focused.boxShadow !== unfocused.boxShadow;
  const border = focused.borderColor !== unfocused.borderColor || focused.borderWidth !== unfocused.borderWidth;
  const background = focused.backgroundColor !== unfocused.backgroundColor;
  return outline || shadow || border || background;
}

export interface FieldFact {
  // A readable description such as `input[text] "First name"`.
  description: string;
  box: Box;
  unfocused: FocusStyle;
}

// One Tab press: the field that got focus (index into the fields) or null for anything else.
export interface TabStep {
  field: number | null;
  focused?: FocusStyle;
}

export type TabReport = {
  // Every field, in visual order.
  fields: string[];
  // Fields in the order Tab first reached them.
  reached: string[];
  // Reached fields that showed no focus indicator.
  withoutFocusIndicator: string[];
};

// Descriptions are made unique (a second `input[text] ""` becomes `input[text] "" (2)`), so the
// lists can be compared by description.
export function tabReport(fields: FieldFact[], steps: TabStep[]): TabReport {
  const seen = new Map<string, number>();
  const names = fields.map((f) => {
    const n = (seen.get(f.description) ?? 0) + 1;
    seen.set(f.description, n);
    return n === 1 ? f.description : `${f.description} (${n})`;
  });
  const order = visualOrder(fields.map((f) => f.box));
  const firstVisit = new Map<number, FocusStyle | undefined>();
  for (const step of steps) {
    if (step.field !== null && !firstVisit.has(step.field)) firstVisit.set(step.field, step.focused);
  }
  const reached = [...firstVisit.keys()];
  return {
    fields: order.map((i) => names[i]!),
    reached: reached.map((i) => names[i]!),
    withoutFocusIndicator: reached
      .filter((i) => {
        const focused = firstVisit.get(i);
        return !focused || !focusIndicatorVisible(fields[i]!.unfocused, focused);
      })
      .map((i) => names[i]!),
  };
}

export function tabOrderProblems(r: TabReport): string[] {
  if (r.fields.length === 0) return ['no form fields found'];
  const problems: string[] = [];
  const missed = r.fields.filter((f) => !r.reached.includes(f));
  if (missed.length > 0) problems.push(`not reached with Tab: ${missed.join(', ')}`);
  const expected = r.fields.filter((f) => r.reached.includes(f));
  if (expected.join('\n') !== r.reached.join('\n')) {
    problems.push(`Tab order differs from visual order:\n  tab:    ${r.reached.join(', ')}\n  visual: ${expected.join(', ')}`);
  }
  if (r.withoutFocusIndicator.length > 0) problems.push(`no visible focus indicator: ${r.withoutFocusIndicator.join(', ')}`);
  return problems;
}

// ---- axe results (RISK-A11Y-01) ----

export type AxeViolation = {
  id: string;
  impact: string | null;
  nodes: number;
  // CSS selectors of the first affected elements, to find them.
  targets: string[];
};

const SHOWN_TARGETS = 5;

// axe gives each node's target as a selector list (nested for frames and shadow roots).
function targetText(target: unknown): string {
  return Array.isArray(target) ? target.flat(Infinity).map(String).join(' >> ') : String(target);
}

export function axeSummary(violations: { id: string; impact?: string | null; nodes: { target?: unknown }[] }[]): AxeViolation[] {
  return violations
    .map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, SHOWN_TARGETS).map((n) => targetText(n.target)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function seriousOrCritical(violations: AxeViolation[]): AxeViolation[] {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

// ---- Markup in names (RISK-SEC-01) ----

export type MarkupFacts = {
  // Elements that only exist when a name was written into the page as HTML.
  boldElements: number;
  injectedImages: number;
  injectedScripts: number;
  dialogs: string[];
  // Stored name parts that do not appear as literal text.
  missingLiterals: string[];
};

export function markupProblems(f: MarkupFacts): string[] {
  const problems: string[] = [];
  if (f.boldElements > 0) problems.push(`${f.boldElements} <b> element(s)`);
  if (f.injectedImages > 0) problems.push(`${f.injectedImages} injected <img> element(s)`);
  if (f.injectedScripts > 0) problems.push(`${f.injectedScripts} injected <script> element(s)`);
  if (f.dialogs.length > 0) problems.push(`dialog(s) opened: ${f.dialogs.join(', ')}`);
  if (f.missingLiterals.length > 0) problems.push(`not shown as literal text: ${f.missingLiterals.join(', ')}`);
  return problems;
}
