export interface PermitTypeRow {
  code: string;
  name: string;
  baseFeeCents: number;
  rateCents: number;
  reviewBusinessDays: number;
  isActive: boolean;
}

// Mirrors legacy/db/04-reference-data.sql, in the same insert order.
export const PERMIT_TYPES: readonly PermitTypeRow[] = [
  { code: 'RENO', name: 'Home renovation', baseFeeCents: 15000, rateCents: 235, reviewBusinessDays: 10, isActive: true },
  { code: 'DECK', name: 'Deck or porch', baseFeeCents: 9500, rateCents: 180, reviewBusinessDays: 5, isActive: true },
  { code: 'SIGN', name: 'Commercial sign', baseFeeCents: 12000, rateCents: 415, reviewBusinessDays: 7, isActive: true },
  { code: 'PATIO', name: 'Sidewalk patio', baseFeeCents: 21000, rateCents: 310, reviewBusinessDays: 15, isActive: true },
  { code: 'DEMO', name: 'Demolition', baseFeeCents: 30000, rateCents: 125, reviewBusinessDays: 20, isActive: true },
  { code: 'EVENT', name: 'Special event', baseFeeCents: 7500, rateCents: 0, reviewBusinessDays: 3, isActive: true },
  { code: 'FENCE', name: 'Fence', baseFeeCents: 6000, rateCents: 90, reviewBusinessDays: 5, isActive: false },
];

export function permitType(code: string): PermitTypeRow {
  const found = PERMIT_TYPES.find((t) => t.code === code);
  if (!found) {
    throw new Error(`Unknown permit type ${code}`);
  }
  return found;
}

// Half away from zero for non-negative integers: round(n / d).
function divRound(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

// Raw fee in 1/10000 units, as held in the money variable @raw of usp_CalculateFee.
// A discount multiplies by a 2 decimal factor and the result is stored back into money (4 decimals).
export function rawUnits(type: PermitTypeRow, areaCents: number, isSenior: boolean, isNonProfit: boolean): number {
  const raw = type.baseFeeCents * 100 + type.rateCents * areaCents;
  if (isNonProfit) {
    return divRound(raw * 50, 100);
  }
  if (isSenior) {
    return divRound(raw * 75, 100);
  }
  return raw;
}

export function computeFee(
  type: PermitTypeRow,
  areaCents: number,
  isSenior: boolean,
  isNonProfit: boolean,
): { fee: string; hst: string; total: string } {
  const feeCents = divRound(rawUnits(type, areaCents, isSenior, isNonProfit), 100);
  const hstCents = divRound(feeCents * 13, 100);
  return { fee: formatCents(feeCents), hst: formatCents(hstCents), total: formatCents(feeCents + hstCents) };
}
