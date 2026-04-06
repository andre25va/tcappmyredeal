import {
  DealStatus, PropertyType, ContactRole, DocRequestType,
  ChecklistItem, DocumentRequest
} from '../types';

export const generateId = () => crypto.randomUUID();

/** Strips non-digits and formats as +1-xxx-xxx-xxxx. Returns raw input if not 10/11 digits. */
export const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  const d = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  if (d.length === 10) return `+1-${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
};

/** Live-formats phone as user types — strips non-digits, builds partial +1-xxx-xxx-xxxx */
export const formatPhoneLive = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  // Strip leading country code '1' whenever there are more digits after it
  // (fixes re-capturing the '1' from the '+1-' prefix on each keystroke)
  const d = digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length === 0) return '';
  if (d.length <= 3) return `+1-${d}`;
  if (d.length <= 6) return `+1-${d.slice(0,3)}-${d.slice(3)}`;
  return `+1-${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6,10)}`;
};

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export const formatDate = (s: string) => {
  if (!s) return '\u2014';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatDateTime = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const daysUntil = (dateStr: string): number => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d.getTime() - now.getTime()) / 86400000);
};

export const getInitials = (name: string) =>
  name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

export const statusLabel = (s: DealStatus): string => ({
  'contract': 'Under Contract',
  'due-diligence': 'Due Diligence',
  'clear-to-close': 'Clear to Close',
  'closed': 'Closed',
  'terminated': 'Terminated',
}[s] ?? s);

export const statusColor = (s: DealStatus): string => ({
  'contract': 'badge-info',
  'due-diligence': 'badge-warning',
  'clear-to-close': 'badge-success',
  'closed': 'badge-neutral',
  'terminated': 'badge-error',
}[s] ?? 'badge-neutral');

export const statusDot = (s: DealStatus): string => ({
  'contract': 'bg-info',
  'due-diligence': 'bg-warning',
  'clear-to-close': 'bg-success',
  'closed': 'bg-neutral',
  'terminated': 'bg-error',
}[s] ?? 'bg-neutral');

export const propertyTypeLabel = (p: PropertyType): string => ({
  'single-family': 'Single Family',
  'multi-family': 'Multi-Family',
  'duplex': 'Duplex',
  'condo': 'Condo',
  'townhouse': 'Townhouse',
  'land': 'Land',
  'commercial': 'Commercial',
}[p] ?? p);

export const roleLabel = (r: ContactRole): string => ({
  'agent': 'Agent',
  'client': 'Client',
  'agent-client': 'Agent Client',
  'buyer': 'Buyer',
  'seller': 'Seller',
  'lender': 'Lender',
  'title': 'Title Company',
  'attorney': 'Attorney',
  'inspector': 'Inspector',
  'appraiser': 'Appraiser',
  'tc': 'TC',
  'online_database': 'Online Database',
  'other': 'Other',
  'staff': 'Staff',
}[r] ?? r);

export const roleBadge = (r: ContactRole): string => ({
  'agent': 'badge-primary',
  'client': 'badge-accent',
  'agent-client': 'badge-accent',
  'buyer': 'badge-info',
  'seller': 'badge-secondary',
  'lender': 'badge-warning',
  'title': 'badge-success',
  'attorney': 'badge-error',
  'inspector': 'badge-neutral',
  'appraiser': 'badge-ghost',
  'tc': 'badge-primary',
  'online_database': 'badge-secondary',
  'other': 'badge-ghost',
  'staff': 'badge-neutral',
}[r] ?? 'badge-ghost');

/**
 * Solid avatar background color for MRDChip.
 * Returns true solid bg + white text — no opacity wash.
 */
export const roleAvatarBg = (r: ContactRole): string => ({
  'agent':       'bg-blue-600 text-white',
  'client':      'bg-teal-500 text-white',
  'agent-client':'bg-teal-500 text-white',
  'buyer':       'bg-cyan-600 text-white',
  'seller':      'bg-purple-600 text-white',
  'lender':      'bg-pink-600 text-white',
  'title':       'bg-green-600 text-white',
  'attorney':    'bg-gray-600 text-white',
  'inspector':   'bg-yellow-500 text-white',
  'appraiser':   'bg-gray-500 text-white',
  'tc':              'bg-blue-600 text-white',
  'online_database': 'bg-purple-600 text-white',
  'other':           'bg-gray-500 text-white',
  'staff':           'bg-slate-600 text-white',
}[r] ?? 'bg-gray-500 text-white');

/** Solid filled chip color for selected state in MRDChip */
export const roleChipSolid = (r: ContactRole): string => ({
  'agent':       'bg-primary border-primary text-primary-content',
  'client':      'bg-teal-500 border-teal-500 text-white',
  'agent-client':'bg-accent border-accent text-accent-content',
  'buyer':       'bg-info border-info text-info-content',
  'seller':      'bg-secondary border-secondary text-secondary-content',
  'lender':      'bg-warning border-warning text-warning-content',
  'title':       'bg-success border-success text-success-content',
  'attorney':    'bg-error border-error text-error-content',
  'inspector':   'bg-gray-500 border-gray-500 text-white',
  'appraiser':   'bg-gray-400 border-gray-400 text-white',
  'tc':              'bg-primary border-primary text-primary-content',
  'online_database': 'bg-purple-600 border-purple-600 text-white',
  'other':           'bg-gray-400 border-gray-400 text-white',
  'staff':           'bg-slate-600 border-slate-600 text-white',
}[r] ?? 'bg-gray-400 border-gray-400 text-white');

export const docTypeConfig: Record<DocRequestType, { label: string; description: string; urgency: 'high' | 'medium' | 'low' }> = {
  price_amendment: { label: 'Price Amendment', description: 'Price change requires a signed price amendment addendum.', urgency: 'high' },
  mf_addendum: { label: 'Multi-Family Addendum', description: 'Required addendum for all multi-family property transactions.', urgency: 'high' },
  closing_date_extension: { label: 'Closing Date Extension', description: 'Extension of the agreed-upon closing date requires all party signatures.', urgency: 'high' },
  inspection_addendum: { label: 'Inspection Addendum', description: 'Addendum addressing inspection findings and agreed repairs.', urgency: 'medium' },
  repair_addendum: { label: 'Repair Addendum', description: 'Addendum documenting agreed-upon repairs and credits.', urgency: 'medium' },
  hoa_addendum: { label: 'HOA Addendum', description: 'HOA documents and addendum required for this property.', urgency: 'medium' },
  lead_paint_addendum: { label: 'Lead Paint Addendum', description: 'Required for all pre-1978 homes \u2014 federal law.', urgency: 'high' },
  custom: { label: 'Custom Document', description: 'Custom document request.', urgency: 'medium' },
};

export const checklistProgress = (items: ChecklistItem[]) => {
  const total = items.length;
  const completed = items.filter(i => i.completed).length;
  return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
};

export const pendingDocCount = (docs: DocumentRequest[]) =>
  docs.filter(d => d.status === 'pending' || d.status === 'in_progress').length;

export const closingCountdown = (closingDate: string): { label: string; color: string; pillBg: string; pillText: string } => {
  const days = daysUntil(closingDate);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'text-error', pillBg: 'bg-red-500', pillText: 'text-white' };
  if (days === 0) return { label: 'Closing Today!', color: 'text-error', pillBg: 'bg-red-500', pillText: 'text-white' };
  if (days <= 7) return { label: `${days}d to close`, color: 'text-warning', pillBg: 'bg-amber-400', pillText: 'text-black' };
  if (days <= 14) return { label: `${days}d to close`, color: 'text-info', pillBg: 'bg-blue-500', pillText: 'text-white' };
  return { label: `${days}d to close`, color: 'text-base-content/60', pillBg: 'bg-gray-200', pillText: 'text-black' };
};

/**
 * Calculates commission amount from price and percentage.
 * commPct is a percentage (e.g. 3 for 3%).
 */
export const calcCommissionAmount = (price: number, commPct: number): number => {
  if (!price || !commPct) return 0;
  return (commPct / 100) * price;
};

/**
 * Calculates commission percentage from price and amount.
 * Returns percentage (e.g. 3 for 3%).
 */
export const calcCommissionPct = (price: number, commAmount: number): number => {
  if (!price || !commAmount) return 0;
  return (commAmount / price) * 100;
};

/**
 * Calculates down payment details from deal financials.
 * @param purchasePrice - Total purchase price
 * @param loanAmount - Loan amount from contract line 196
 * @param earnestMoney - Earnest money deposit
 * @param downPaymentPct - Down payment % from contract line 330 (e.g. 3 for 3%)
 * @returns object with downPaymentAmount, cashAtClose, derivedPct, hasConflict, conflictMessage
 */
export const calculateDownPayment = (
  purchasePrice: number,
  loanAmount: number,
  earnestMoney: number,
  downPaymentPct: number
): {
  downPaymentAmount: number;
  cashAtClose: number;
  derivedPct: number;
  hasConflict: boolean;
  conflictMessage: string;
} => {
  const downPaymentAmount = (downPaymentPct / 100) * purchasePrice;
  const cashAtClose = downPaymentAmount - earnestMoney;
  const derivedPct = purchasePrice > 0 ? ((purchasePrice - loanAmount) / purchasePrice) * 100 : 0;
  const hasConflict = Math.abs(derivedPct - downPaymentPct) > 0.1;
  const conflictMessage = hasConflict
    ? `⚠ Ln 196 loan amount implies ${derivedPct.toFixed(1)}% — agent's ln 330 says ${downPaymentPct.toFixed(1)}% — verify line 196 is correct`
    : '';
  return { downPaymentAmount, cashAtClose, derivedPct, hasConflict, conflictMessage };
};
/** Parses a string with currency/number formatting into a float. Returns 0 if invalid. */
export const pf = (v: string): number => parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
