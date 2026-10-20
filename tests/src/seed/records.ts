import { computeFee, formatCents, permitType, PERMIT_TYPES, rawUnits } from './fee';
import {
  addBusinessDays,
  addDays,
  addSeconds,
  effectiveStatus,
  FIXED_TODAY,
  HOLIDAYS,
  tsToMs,
  msToTs,
} from './holidays';
import { chance, faker, int, pick } from './rng';

export const CATEGORY_NAMES = [
  'accentedNames',
  'mixedCaseNames',
  'trailingSpaceNames',
  'htmlInNames',
  'apostropheNames',
  'nullContact',
  'emptyVsNullDescription',
  'longDescription',
  'emojiDescription',
  'roundingHalfFee',
  'unroundedMoney',
  'weekendSubmission',
  'holidayAdjacentDueDate',
  'dstWeekSubmission',
  'monthEnd',
  'leapDay',
  'expiryBoundary',
  'submittedAtTies',
  'varcharAddressAccents',
  'multiStepHistory',
  'statusApproved',
  'statusUnderReview',
  'statusInfoRequested',
  'statusRejected',
  'statusSubmitted',
] as const;

export type CategoryName = (typeof CATEGORY_NAMES)[number];
export type Status = 'Submitted' | 'UnderReview' | 'InfoRequested' | 'Approved' | 'Rejected';

export interface ApplicantRow {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isSenior: boolean;
  isNonProfit: boolean;
  createdAt: string;
}

export interface ApplicationRow {
  id: number;
  referenceNumber: string;
  applicantId: number;
  permitTypeCode: string;
  siteAddress: string;
  areaCents: number;
  description: string | null;
  status: Status;
  submittedOn: string;
  submittedAt: string;
  dueDate: string;
  fee: string;
  hst: string;
  total: string;
  lastUpdatedAt: string;
}

export interface HistoryRow {
  id: number;
  applicationId: number;
  fromStatus: Status | null;
  toStatus: Status;
  changedAt: string;
  changedBy: string;
  note: string | null;
}

export interface RoundingProbe {
  permitTypeCode: string;
  areaSqM: string;
  isSenior: boolean;
  isNonProfit: boolean;
}

export interface Catalog {
  fixedToday: string;
  categories: Record<CategoryName, string[]>;
  roundingHalfAreas: RoundingProbe[];
  dueDateProbes: string[];
  searchTerms: string[];
}

export interface Dataset {
  applicants: ApplicantRow[];
  applications: ApplicationRow[];
  history: HistoryRow[];
  catalog: Catalog;
}

interface Spec {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  isSenior?: boolean;
  isNonProfit?: boolean;
  type?: string;
  areaCents?: number;
  address?: string;
  description?: string | null;
  submittedOn: string;
  time?: string;
  path?: Status[];
  lastUpdatedAt?: string;
  money?: { fee: string; hst: string; total: string };
  tags?: CategoryName[];
}

const STREETS = [
  'Maple Street', 'Queen Street', 'King Street', 'Elm Avenue', 'Lakeshore Road', 'Bank Street',
  'Rideau Street', 'Main Street', 'Oak Lane', 'Cedar Court', 'Rue Principale', 'Chemin du Lac',
];
const ACCENTED_STREETS = [
  'rue Saint-Jérôme', 'boulevard René-Lévesque', 'chemin de la Côte-des-Neiges', 'avenue Léger',
  'rue de la Fabrique', 'rue Sainte-Thérèse', "place d'Armes", 'rue Édouard-Charles',
];
const CITIES = ['Ottawa', 'Gatineau', 'Kingston', 'Hamilton', 'Toronto', 'Kanata', 'Orléans'];
const CLERKS = ['j.leblanc', 'm.cote', 'Hélène Côté', 'r.singh', 'a.murphy'];
const IR_NOTES = ['Site plan is missing', 'Please confirm the lot boundary', 'Structural drawing required', 'Proof of ownership needed'];
const REJECT_NOTES = ['Does not meet the zoning bylaw', 'Setback is under the minimum', 'Incomplete after two requests'];
const DESCRIPTIONS = [
  'Replace the front steps and railing.',
  'Interior renovation of the ground floor.',
  'New wooden deck at the rear of the house.',
  'Illuminated sign above the shop entrance.',
  'Seasonal terrace on the sidewalk.',
  'Removal of a detached garage.',
  'Street party for the neighbourhood.',
  'Repair of the retaining wall.',
];

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function referenceNumber(submittedOn: string, id: number): string {
  return `PRM-${submittedOn.slice(0, 4)}-${String(id).padStart(6, '0')}`;
}

// Areas (in cents of a square metre) whose raw fee ends in exactly x.xx50, so ROUND(raw, 2) sits on a half.
function findHalfAreas(code: string, isSenior: boolean, isNonProfit: boolean, count: number): number[] {
  const type = permitType(code);
  const found: number[] = [];
  for (let area = 500; area <= 50_000 && found.length < count; area += 1) {
    if (rawUnits(type, area, isSenior, isNonProfit) % 100 === 50) {
      found.push(area);
    }
  }
  return found;
}

// Areas where the fee is exact to the cent and ends in 50, so 13% HST sits on a half cent.
function findHstHalfAreas(code: string, count: number): number[] {
  const type = permitType(code);
  const found: number[] = [];
  for (let area = 500; area <= 50_000 && found.length < count; area += 1) {
    const raw = rawUnits(type, area, false, false);
    if (raw % 100 === 0 && (raw / 100) % 100 === 50) {
      found.push(area);
    }
  }
  return found;
}

class Builder {
  readonly applicants: ApplicantRow[] = [];
  readonly applications: ApplicationRow[] = [];
  readonly history: HistoryRow[] = [];
  readonly categories = Object.fromEntries(CATEGORY_NAMES.map((n) => [n, [] as string[]])) as Record<CategoryName, string[]>;
  private readonly reusable: ApplicantRow[] = [];

  private makeApplicant(spec: Spec, createdAt: string): ApplicantRow {
    const id = this.applicants.length + 1;
    const firstName = spec.firstName ?? faker.person.firstName();
    const lastName = spec.lastName ?? faker.person.lastName();
    const handle = `${slug(firstName) || 'x'}.${slug(lastName) || 'y'}${id}`;
    const applicant: ApplicantRow = {
      id,
      firstName,
      lastName,
      email: spec.email === undefined ? `${handle}@example.ca` : spec.email,
      phone: spec.phone === undefined ? `613-555-${String(int(0, 9999)).padStart(4, '0')}` : spec.phone,
      isSenior: spec.isSenior ?? false,
      isNonProfit: spec.isNonProfit ?? false,
      createdAt,
    };
    this.applicants.push(applicant);
    return applicant;
  }

  add(spec: Spec, existing?: ApplicantRow): ApplicationRow {
    const id = this.applications.length + 1;
    const time = spec.time ?? `${String(int(8, 16)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`;
    const submittedAt = `${spec.submittedOn} ${time}`;
    const applicant = existing ?? this.makeApplicant(spec, submittedAt);
    const typeCode = spec.type ?? 'RENO';
    const type = permitType(typeCode);
    const areaCents = spec.areaCents ?? int(100, 30_000);
    const path = spec.path ?? ['Submitted'];

    const times = this.stepTimes(submittedAt, path.length, spec.lastUpdatedAt);
    const lastUpdatedAt = times[times.length - 1] as string;
    const status = path[path.length - 1] as Status;

    const money = spec.money ?? computeFee(type, areaCents, applicant.isSenior, applicant.isNonProfit);
    const application: ApplicationRow = {
      id,
      referenceNumber: referenceNumber(spec.submittedOn, id),
      applicantId: applicant.id,
      permitTypeCode: typeCode,
      siteAddress: spec.address ?? `${int(1, 999)} ${pick(STREETS)}, ${pick(CITIES)}`,
      areaCents,
      description: spec.description === undefined ? pick(DESCRIPTIONS) : spec.description,
      status,
      submittedOn: spec.submittedOn,
      submittedAt,
      dueDate: addBusinessDays(spec.submittedOn, type.reviewBusinessDays),
      fee: money.fee,
      hst: money.hst,
      total: money.total,
      lastUpdatedAt,
    };
    this.applications.push(application);

    path.forEach((toStatus, index) => {
      this.history.push({
        id: this.history.length + 1,
        applicationId: id,
        fromStatus: index === 0 ? null : (path[index - 1] as Status),
        toStatus,
        changedAt: times[index] as string,
        changedBy: index === 0 ? 'applicant' : pick(CLERKS),
        note: this.noteFor(toStatus, index),
      });
    });

    for (const tag of spec.tags ?? []) {
      this.categories[tag].push(application.referenceNumber);
    }
    return application;
  }

  private noteFor(status: Status, index: number): string | null {
    if (index === 0) {
      return null;
    }
    if (status === 'InfoRequested') {
      return pick(IR_NOTES);
    }
    if (status === 'Rejected') {
      return pick(REJECT_NOTES);
    }
    return chance(0.3) ? 'Reviewed by the clerk' : null;
  }

  // One timestamp per path step, never decreasing. A fixed lastUpdatedAt is spread evenly across the steps.
  private stepTimes(submittedAt: string, steps: number, lastUpdatedAt?: string): string[] {
    const times = [submittedAt];
    if (steps === 1) {
      return times;
    }
    if (lastUpdatedAt !== undefined) {
      const span = Math.round((tsToMs(lastUpdatedAt) - tsToMs(submittedAt)) / 1000);
      for (let i = 1; i < steps; i += 1) {
        times.push(addSeconds(submittedAt, Math.floor((span * i) / (steps - 1))));
      }
      return times;
    }
    const cap = tsToMs(`${FIXED_TODAY} 23:59:59`);
    for (let i = 1; i < steps; i += 1) {
      const previous = tsToMs(times[i - 1] as string);
      const next = previous + int(3600, 10 * 86_400) * 1000;
      times.push(msToTs(Math.max(previous, Math.min(next, cap))));
    }
    return times;
  }

  addRandom(): void {
    const reuse = this.reusable.length > 0 && chance(0.15);
    const existing = reuse ? pick(this.reusable.slice(-50)) : undefined;
    const roll = faker.number.float({ min: 0, max: 1 });
    const path: Status[] =
      roll < 0.2
        ? ['Submitted']
        : roll < 0.4
          ? ['Submitted', 'UnderReview']
          : roll < 0.55
            ? ['Submitted', 'UnderReview', 'InfoRequested']
            : roll < 0.85
              ? ['Submitted', 'UnderReview', 'Approved']
              : ['Submitted', 'UnderReview', 'Rejected'];
    const daysBack = chance(0.5) ? int(0, 150) : int(0, 1000);
    const submittedOn = addDays(FIXED_TODAY, -daysBack);
    const senior = existing?.isSenior ?? chance(0.12);
    const nonProfit = existing?.isNonProfit ?? chance(0.06);
    const application = this.add(
      {
        email: chance(0.15) ? null : undefined,
        phone: chance(0.1) ? null : undefined,
        isSenior: senior,
        isNonProfit: nonProfit,
        type: PERMIT_TYPES[chance(0.03) ? 6 : int(0, 5)]?.code,
        description: chance(0.1) ? null : cleanText(faker.lorem.sentence({ min: 3, max: 12 })),
        submittedOn,
        path,
      },
      existing,
    );
    if (!existing) {
      this.reusable.push(this.applicants[application.applicantId - 1] as ApplicantRow);
    }
  }
}

function addCatalogRecords(b: Builder): { probes: RoundingProbe[]; dates: string[] } {
  const probes: RoundingProbe[] = [];
  const dates: string[] = [];
  const area = (cents: number) => formatCents(cents);

  // Names with accents, case variants, trailing spaces, markup and apostrophes.
  for (const [first, last] of [['François', 'Bélanger'], ['Hélène', 'Côté'], ['Zoë', 'Gagné'], ['Renée', 'Lévesque'], ['Louise', 'Tremblé']]) {
    b.add({ firstName: first, lastName: last, submittedOn: '2026-06-02', path: ['Submitted', 'UnderReview'], tags: ['accentedNames'] });
  }
  for (const last of ['MacDonald', 'macdonald', 'MACDONALD', 'McDonald']) {
    b.add({ firstName: 'Alex', lastName: last, submittedOn: '2026-05-12', path: ['Submitted', 'UnderReview', 'Approved'], tags: ['mixedCaseNames'] });
  }
  b.add({ firstName: 'Louise', lastName: 'Tremblay ', submittedOn: '2026-07-14', path: ['Submitted', 'UnderReview'], tags: ['trailingSpaceNames'] });
  b.add({ firstName: 'Marc ', lastName: 'Gagnon ', submittedOn: '2026-07-15', tags: ['trailingSpaceNames'] });
  b.add({ firstName: 'Louise', lastName: 'Tremblay', submittedOn: '2026-07-16', path: ['Submitted', 'UnderReview', 'Approved'] });
  for (const last of ['<b>Roy</b>', "<script>alert('x')</script>", 'Smith & Sons', '"><img src=x>']) {
    b.add({ firstName: 'Test', lastName: last, submittedOn: '2026-08-11', path: ['Submitted', 'UnderReview'], tags: ['htmlInNames'] });
  }
  for (const [first, last] of [['Sean', "O'Brien"], ['Fiona', "O'Connor"], ['Luca', "D'Amico"], ['Aminata', "N'Diaye"], ["D'Arcy", 'Smith']]) {
    b.add({ firstName: first, lastName: last, submittedOn: '2026-08-12', path: ['Submitted', 'UnderReview', 'Approved'], tags: ['apostropheNames'] });
  }

  // Missing contact details and descriptions.
  b.add({ email: null, phone: null, submittedOn: '2026-06-15', tags: ['nullContact'] });
  b.add({ email: null, submittedOn: '2026-06-16', tags: ['nullContact'] });
  b.add({ phone: null, submittedOn: '2026-06-17', tags: ['nullContact'] });
  b.add({ description: null, submittedOn: '2026-06-18', tags: ['emptyVsNullDescription'] });
  b.add({ description: '', submittedOn: '2026-06-18', tags: ['emptyVsNullDescription'] });
  b.add({ description: '   ', submittedOn: '2026-06-18', tags: ['emptyVsNullDescription'] });
  b.add({ description: 'x'.repeat(4000), submittedOn: '2026-06-19', tags: ['longDescription'] });
  const paragraph = 'Replace the sagging porch roof, reinforce the posts and repaint every surface. ';
  b.add({ description: paragraph.repeat(150).trim(), submittedOn: '2026-06-19', tags: ['longDescription'] });
  b.add({ description: 'First line of the request.\nSecond line, with a tab\there.\n\nFourth line.', submittedOn: '2026-06-19', tags: ['longDescription'] });
  b.add({ description: 'Roof repair 🏠🔨 near the park', submittedOn: '2026-06-22', tags: ['emojiDescription'] });
  b.add({ description: 'Étage supplémentaire ✓ 日本語 مرحبا', submittedOn: '2026-06-22', tags: ['emojiDescription'] });

  // Fee rounding: raw fee exactly on a half cent, and fees whose 13% HST sits on a half cent.
  for (const code of ['RENO', 'DECK', 'SIGN', 'PATIO', 'DEMO']) {
    for (const cents of findHalfAreas(code, false, false, 2)) {
      probes.push({ permitTypeCode: code, areaSqM: area(cents), isSenior: false, isNonProfit: false });
      b.add({ type: code, areaCents: cents, submittedOn: '2026-05-04', tags: ['roundingHalfFee'] });
    }
  }
  const discounts: [boolean, boolean][] = [[true, false], [false, true], [true, true]];
  for (const [senior, nonProfit] of discounts) {
    const [cents] = findHalfAreas('RENO', senior, nonProfit, 1);
    probes.push({ permitTypeCode: 'RENO', areaSqM: area(cents as number), isSenior: senior, isNonProfit: nonProfit });
    b.add({ type: 'RENO', areaCents: cents as number, isSenior: senior, isNonProfit: nonProfit, submittedOn: '2026-05-05', tags: ['roundingHalfFee'] });
  }
  for (const cents of findHstHalfAreas('RENO', 2)) {
    b.add({ type: 'RENO', areaCents: cents, submittedOn: '2026-05-06', tags: ['roundingHalfFee'] });
  }

  // Money stored with four decimals, as legacy code paths could leave it.
  b.add({ submittedOn: '2026-04-20', money: { fee: '88.1234', hst: '11.4560', total: '99.5794' }, tags: ['unroundedMoney'] });
  b.add({ submittedOn: '2026-04-21', type: 'DECK', money: { fee: '120.0049', hst: '15.6006', total: '135.6055' }, tags: ['unroundedMoney'] });
  b.add({ submittedOn: '2026-04-22', type: 'SIGN', money: { fee: '305.5051', hst: '39.7157', total: '345.2208' }, tags: ['unroundedMoney'] });

  // Calendar hazards.
  for (const [day, time] of [['2026-10-10', '09:15:00'], ['2026-10-11', '14:45:30'], ['2026-03-07', '10:00:00'], ['2026-03-14', '23:59:59']] as const) {
    dates.push(day);
    b.add({ submittedOn: day, time, type: 'DECK', path: ['Submitted', 'UnderReview'], tags: ['weekendSubmission'] });
  }
  for (const [day, type] of [
    ['2026-10-09', 'EVENT'], ['2026-10-09', 'DECK'], ['2026-04-02', 'EVENT'], ['2026-06-30', 'EVENT'],
    ['2025-12-24', 'EVENT'], ['2026-09-04', 'EVENT'], ['2026-05-15', 'EVENT'], ['2025-12-23', 'DECK'],
  ] as const) {
    dates.push(day);
    b.add({ submittedOn: day, type, path: ['Submitted', 'UnderReview'], tags: ['holidayAdjacentDueDate'] });
  }
  for (const [day, time] of [
    ['2026-03-06', '12:00:00'], ['2026-03-07', '23:30:00'], ['2026-03-08', '01:59:59'], ['2026-03-08', '02:30:00'],
    ['2026-03-08', '03:00:00'], ['2026-03-09', '00:15:00'], ['2026-03-10', '08:00:00'],
    ['2025-03-09', '02:30:00'], ['2025-11-02', '01:30:00'],
    ['2026-10-30', '12:00:00'], ['2026-10-31', '23:30:00'], ['2026-11-01', '00:30:00'], ['2026-11-01', '01:30:00'],
    ['2026-11-01', '02:30:00'], ['2026-11-02', '08:00:00'], ['2026-11-03', '08:00:00'],
  ] as const) {
    dates.push(day);
    b.add({ submittedOn: day, time, type: 'EVENT', tags: ['dstWeekSubmission'] });
  }
  for (const [day, time] of [
    ['2026-01-31', '16:30:00'], ['2026-02-28', '23:59:59'], ['2025-04-30', '00:00:00'], ['2026-09-30', '12:00:00'],
    ['2024-12-31', '23:00:00'], ['2025-02-28', '09:00:00'], ['2024-02-29', '10:30:00'], ['2026-07-31', '17:00:00'],
  ] as const) {
    dates.push(day);
    b.add({ submittedOn: day, time, type: 'EVENT', path: ['Submitted', 'UnderReview', 'Approved'], tags: ['monthEnd'] });
  }
  for (const type of ['EVENT', 'DECK', 'RENO']) {
    dates.push('2024-02-29');
    b.add({ submittedOn: '2024-02-29', type, path: ['Submitted', 'UnderReview', 'Approved'], tags: ['leapDay'] });
  }

  // Records one second either side of the 180 day expiry boundary (today is 2026-10-15).
  b.add({ submittedOn: '2026-04-17', time: '23:30:00', lastUpdatedAt: '2026-04-17 23:30:00', tags: ['expiryBoundary'] });
  b.add({ submittedOn: '2026-04-18', time: '00:00:00', lastUpdatedAt: '2026-04-18 00:00:00', tags: ['expiryBoundary'] });
  b.add({ submittedOn: '2026-03-20', time: '10:00:00', path: ['Submitted', 'UnderReview', 'InfoRequested'], lastUpdatedAt: '2026-04-17 23:30:00', tags: ['expiryBoundary'] });
  b.add({ submittedOn: '2026-03-20', time: '10:05:00', path: ['Submitted', 'UnderReview', 'InfoRequested'], lastUpdatedAt: '2026-04-18 00:00:00', tags: ['expiryBoundary'] });
  b.add({ submittedOn: '2025-01-10', path: ['Submitted', 'UnderReview', 'Approved'], lastUpdatedAt: '2025-02-01 09:00:00', tags: ['expiryBoundary'] });

  // Five applications sharing one SubmittedAt.
  const tieStatuses: Status[][] = [['Submitted'], ['Submitted', 'UnderReview'], ['Submitted'], ['Submitted', 'UnderReview', 'Approved'], ['Submitted']];
  tieStatuses.forEach((path, index) => {
    b.add({ submittedOn: '2026-09-14', time: '10:00:00', type: PERMIT_TYPES[index]?.code, path, tags: ['submittedAtTies'] });
  });

  // Addresses with accents (plain varchar column).
  ACCENTED_STREETS.slice(0, 5).forEach((street, index) => {
    b.add({ address: `${100 + index} ${street}, Gatineau`, submittedOn: '2026-06-23', tags: ['varcharAddressAccents'] });
  });

  // Longer status paths ending in each stored status.
  const paths: Status[][] = [
    ['Submitted', 'UnderReview', 'InfoRequested', 'UnderReview', 'Approved'],
    ['Submitted', 'UnderReview', 'InfoRequested', 'UnderReview'],
    ['Submitted', 'UnderReview', 'InfoRequested', 'UnderReview', 'InfoRequested'],
    ['Submitted', 'UnderReview', 'InfoRequested', 'UnderReview', 'Rejected'],
    ['Submitted', 'UnderReview', 'InfoRequested', 'UnderReview', 'InfoRequested', 'UnderReview', 'Approved'],
  ];
  paths.forEach((path, index) => {
    b.add({ submittedOn: addDays('2026-09-01', index), path, lastUpdatedAt: `2026-10-0${index + 1} 15:00:00`, tags: ['multiStepHistory'] });
  });

  return { probes, dates };
}

function dueDateProbes(extra: string[]): string[] {
  const days = new Set<string>(['2026-10-09', '2026-10-15', '2026-12-24', '2026-12-31', '2027-12-23', '2024-02-29', ...extra]);
  for (const holiday of HOLIDAYS) {
    days.add(addDays(holiday, -1));
    days.add(addDays(holiday, 1));
  }
  return [...days].sort();
}

const STATUS_CATEGORIES: [Status, CategoryName][] = [
  ['Approved', 'statusApproved'],
  ['UnderReview', 'statusUnderReview'],
  ['InfoRequested', 'statusInfoRequested'],
  ['Rejected', 'statusRejected'],
  ['Submitted', 'statusSubmitted'],
];
const STATUS_CATEGORY_LIMIT = 50;

export function buildDataset(applicationCount: number): Dataset {
  const builder = new Builder();
  const { probes, dates } = addCatalogRecords(builder);
  for (let i = 0; i < applicationCount; i += 1) {
    builder.addRandom();
  }

  for (const [status, category] of STATUS_CATEGORIES) {
    const boundary = new Set(builder.categories.expiryBoundary);
    builder.categories[category] = builder.applications
      .filter(
        (a) =>
          a.status === status &&
          a.submittedOn <= FIXED_TODAY &&
          !boundary.has(a.referenceNumber) &&
          effectiveStatus(a.status, a.lastUpdatedAt, FIXED_TODAY) === status,
      )
      .slice(0, STATUS_CATEGORY_LIMIT)
      .map((a) => a.referenceNumber);
  }

  return {
    applicants: builder.applicants,
    applications: builder.applications,
    history: builder.history,
    catalog: {
      fixedToday: FIXED_TODAY,
      categories: builder.categories,
      roundingHalfAreas: probes,
      dueDateProbes: dueDateProbes(dates),
      searchTerms: ['tremblay', 'TREMBLAY', 'Tremblay ', 'Tremblé', 'macdonald', "O'B", 'PRM-2026', '', 'zzz-no-match'],
    },
  };
}

