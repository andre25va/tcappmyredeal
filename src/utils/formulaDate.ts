/**
 * formulaDate.ts
 * Parses human-readable date formulas and computes target dates.
 *
 * Supported formats:
 *   "Effective Date + 5 days"
 *   "Effective Date + 5 business days"
 *   "Closing Date - 3 days"
 *   "Closing Date - 3 business days"
 *
 * Anchors: "Effective Date" | "Closing Date"
 */

export type FormulaAnchor = 'effective_date' | 'closing_date';

export interface ParsedFormula {
  anchor: FormulaAnchor;
  operator: '+' | '-';
  days: number;
  businessDays: boolean;
}

/**
 * Parse a formula string into structured parts.
 * Returns null if the formula can't be parsed.
 */
export function parseFormula(formula: string | null | undefined): ParsedFormula | null {
  if (!formula) return null;

  const normalized = formula.trim().toLowerCase();

  // Match: "effective date + 5 business days" or "closing date - 3 days"
  const match = normalized.match(
    /^(effective date|closing date)\s*([+-])\s*(\d+)\s*(business\s+days?|days?)$/
  );

  if (!match) return null;

  const anchor: FormulaAnchor =
    match[1] === 'effective date' ? 'effective_date' : 'closing_date';
  const operator = match[2] as '+' | '-';
  const days = parseInt(match[3], 10);
  const businessDays = match[4].startsWith('business');

  return { anchor, operator, days, businessDays };
}

/**
 * Add or subtract calendar days from a date.
 */
function addCalendarDays(date: Date, delta: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + delta);
  return result;
}

/**
 * Add or subtract business days (Mon–Fri) from a date.
 */
function addBusinessDays(date: Date, delta: number): Date {
  const result = new Date(date);
  const direction = delta >= 0 ? 1 : -1;
  let remaining = Math.abs(delta);

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    const day = result.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) {
      remaining--;
    }
  }

  return result;
}

/**
 * Format a Date as YYYY-MM-DD (no timezone shift).
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD string into a local Date (no UTC shift).
 */
function fromDateString(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Compute the resulting date from a formula given anchor dates.
 *
 * @param formula  Human-readable formula string
 * @param effectiveDate  YYYY-MM-DD string
 * @param closingDate    YYYY-MM-DD string
 * @returns YYYY-MM-DD result string, or null if unparseable / anchor missing
 */
export function computeFormulaDate(
  formula: string | null | undefined,
  effectiveDate: string | null | undefined,
  closingDate: string | null | undefined
): string | null {
  const parsed = parseFormula(formula);
  if (!parsed) return null;

  const anchorStr =
    parsed.anchor === 'effective_date' ? effectiveDate : closingDate;

  if (!anchorStr) return null;

  const anchorDate = fromDateString(anchorStr);
  const delta = parsed.operator === '+' ? parsed.days : -parsed.days;

  const result = parsed.businessDays
    ? addBusinessDays(anchorDate, delta)
    : addCalendarDays(anchorDate, delta);

  return toDateString(result);
}

/**
 * Count how many formula-driven milestones would change if an anchor shifts.
 */
export interface MilestoneShift {
  id: string;
  name: string;
  formula: string;
  currentDate: string | null;
  newDate: string | null;
  changed: boolean;
}

export function computeShifts(
  milestones: Array<{
    id: string;
    milestone_name: string;
    formula: string | null;
    due_date: string | null;
  }>,
  newEffectiveDate: string | null,
  newClosingDate: string | null,
  currentEffectiveDate: string | null,
  currentClosingDate: string | null
): MilestoneShift[] {
  return milestones
    .filter((m) => !!m.formula)
    .map((m) => {
      const newDate = computeFormulaDate(m.formula, newEffectiveDate, newClosingDate);
      const oldDate = computeFormulaDate(m.formula, currentEffectiveDate, currentClosingDate);
      return {
        id: m.id,
        name: m.milestone_name,
        formula: m.formula!,
        currentDate: oldDate ?? m.due_date,
        newDate,
        changed: newDate !== (oldDate ?? m.due_date),
      };
    });
}
