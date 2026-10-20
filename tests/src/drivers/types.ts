// One interface for both apps. Specs talk to pages only through it, so the same test runs
// against Web Forms and Blazor. Every value is the string a user sees, never a parsed number,
// because the rendering itself (currency, dates, spacing) is part of what parity compares.

export interface SearchRow {
  reference: string;
  applicant: string;
  permitType: string;
  status: string;
  submitted: string;
  due: string;
  total: string;
}

export interface SearchPage {
  open(): Promise<void>;
  // `status` is a status filter option as shown or as its value; omitted means all statuses.
  search(text: string, status?: string): Promise<void>;
  // Data rows of the current results page, in display order.
  rows(): Promise<SearchRow[]>;
  countText(): Promise<string>;
  statusOptions(): Promise<string[]>;
  // Shows results page n (1 based). Does nothing when page n is already shown.
  goToPage(n: number): Promise<void>;
}

export interface ApplyForm {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  isSenior?: boolean;
  isNonProfit?: boolean;
  // A permit type option as shown (`Home renovation`) or its code (`RENO`).
  permitType: string;
  siteAddress: string;
  areaSqM: string;
  description?: string;
}

export interface FeePreview {
  fee: string;
  hst: string;
  total: string;
  dueDate: string;
}

export interface ApplyPage {
  open(): Promise<void>;
  permitTypeOptions(): Promise<string[]>;
  fill(f: ApplyForm): Promise<void>;
  // Empty strings when the page shows no estimate (validation failed).
  preview(): Promise<FeePreview>;
  // The reference shown after submitting, or an empty string when the page shows none.
  submit(): Promise<string>;
  // Validation and business rule messages currently shown, in display order.
  validationMessages(): Promise<string[]>;
}

export interface DetailPage {
  open(ref: string): Promise<void>;
  // Field label as shown -> value as shown.
  values(): Promise<Record<string, string>>;
  // One record per history row: column heading as shown -> cell as shown.
  history(): Promise<Record<string, string>[]>;
  isNotFound(): Promise<boolean>;
}

export interface ReviewPage {
  open(ref: string): Promise<void>;
  // `newStatus` is a status option as shown or as its value.
  change(newStatus: string, changedBy: string, note?: string): Promise<{ error?: string; success?: string }>;
}

export interface AppDriver {
  search: SearchPage;
  apply: ApplyPage;
  detail: DetailPage;
  review: ReviewPage;
  // Every page of the app with a stable kebab case name (used in baseline case IDs).
  pages: { name: string; path: string }[];
  // URLs that make the app fail (bad query string values, unknown pages).
  errorProbes: string[];
}
