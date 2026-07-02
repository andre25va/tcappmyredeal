// src/utils/contractValidation.ts
// Contract validation rules — runs at StepExtractedData confirm time.
// Returns a list of violations that need to be flagged before submission.

export interface ValidationViolation {
  fieldKey: string;
  label: string;
  message: string;
  severity: 'error' | 'warning';
}

// ── Required individual fields (must have a non-empty value) ─────────────────
const REQUIRED_FIELDS: Array<{ key: string; label: string; severity: 'error' | 'warning' }> = [
  { key: 'contractPrice',       label: 'Purchase Price',          severity: 'error' },
  { key: 'closingDate',         label: 'Closing Date',            severity: 'error' },
  { key: 'earnestMoney',        label: 'Earnest Money Amount',    severity: 'error' },
  { key: 'buyerNames',          label: 'Buyer Name(s)',           severity: 'error' },
  { key: 'sellerNames',         label: 'Seller Name(s)',          severity: 'error' },
  { key: 'titleCompany',        label: 'Title / Closing Company', severity: 'warning' },
  { key: 'inspectionDate',      label: 'Inspection Period',       severity: 'warning' },
];

// ── Choice groups — at least one must be selected ────────────────────────────
const CHOICE_GROUPS: Array<{
  keys: string[];
  label: string;
  message: string;
  severity: 'error' | 'warning';
}> = [
  {
    keys: ['earnestMoneyForm'],
    label: 'EM Payment Form',
    message: 'No payment method selected (check, wire, electronic, or other)',
    severity: 'error',
  },
  {
    keys: ['earnestMoneyRefundable'],
    label: 'EM Refundable Status',
    message: 'Neither "Refundable" nor "Non-refundable" was checked',
    severity: 'error',
  },
  {
    keys: ['saleType'],
    label: 'Sale Type',
    message: 'No sale type selected (Cash or Financed)',
    severity: 'error',
  },
];

export function validateContract(values: Record<string, string>): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  // Required individual fields
  for (const { key, label, severity } of REQUIRED_FIELDS) {
    const val = values[key];
    if (!val || val.trim() === '') {
      violations.push({
        fieldKey: key,
        label,
        message: `${label} is required but not filled in`,
        severity,
      });
    }
  }

  // Choice groups
  for (const group of CHOICE_GROUPS) {
    const anyFilled = group.keys.some(k => {
      const v = values[k];
      return v && v.trim() !== '';
    });
    if (!anyFilled) {
      violations.push({
        fieldKey: group.keys[0],
        label: group.label,
        message: group.message,
        severity: group.severity,
      });
    }
  }

  // Conditional: if financed, loan type required
  if (
    values.saleType === 'Financed' &&
    (!values.loanType || values.loanType.trim() === '')
  ) {
    violations.push({
      fieldKey: 'loanType',
      label: 'Loan Type',
      message: 'Sale is "Financed" but no loan type selected (Conventional, FHA, VA, etc.)',
      severity: 'error',
    });
  }

  return violations;
}

export function buildViolationEmailBody(
  address: string,
  violations: ValidationViolation[]
): string {
  const errorItems = violations
    .filter(v => v.severity === 'error')
    .map(v => `  • ${v.label} — ${v.message}`)
    .join('\n');
  const warnItems = violations
    .filter(v => v.severity === 'warning')
    .map(v => `  • ${v.label} — ${v.message}`)
    .join('\n');

  const lines: string[] = [];
  lines.push(`Hi,`);
  lines.push('');
  lines.push(
    `We are reviewing the contract for ${address} and noticed the following items need attention before we can move forward:`
  );
  lines.push('');

  if (errorItems) {
    lines.push('Items that need to be corrected:');
    lines.push(errorItems);
  }

  if (warnItems) {
    lines.push('');
    lines.push('Items to verify:');
    lines.push(warnItems);
  }

  lines.push('');
  lines.push(
    'Please review and let us know how to proceed. We want to make sure everything is accurate before moving forward.'
  );
  lines.push('');
  lines.push('Thank you,');

  return lines.join('\n');
}
