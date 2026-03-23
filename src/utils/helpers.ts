import {
  DealStatus, PropertyType, ContactRole, DocRequestType,
  ChecklistItem, DocumentRequest
} from '../types';

export const generateId = () => Math.random().toString(36).slice(2, 10);

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
  // Always strip leading country code '1' — NANP area codes never start with 1,
  // so any leading 1 is the country code. This also fixes the sticky +1- backspace bug.
  const d = digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length === 0) return '';
  if (d.length <= 3) return `+1-${d}`;
  if (d.length <= 6) return `+1-${d.slice(0,3)}-${d.slice(3)}`;
  return `+1-${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6,10)}`;
};

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export const formatDate = (s: string) => {
  if (!s) return '—';
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
  'agent-client': 'Agent Client',
  'buyer': 'Buyer',
  'seller': 'Seller',
  'lender': 'Lender',
  'title': 'Title Co.',
  'attorney': 'Attorney',
  'inspector': 'Inspector',
  'appraiser': 'Appraiser',
  'tc': 'TC',
  'other': 'Other',
}[r] ?? r);

export const roleBadge = (r: ContactRole): string => ({
  'agent': 'badge-primary',
  'agent-client': 'badge-accent',
  'buyer': 'badge-info',
  'seller': 'badge-secondary',
  'lender': 'badge-warning',
  'title': 'badge-success',
  'attorney': 'badge-error',
  'inspector': 'badge-neutral',
  'appraiser': 'badge-ghost',
  'tc': 'badge-primary',
  'other': 'badge-ghost',
}[r] ?? 'badge-ghost');

export const roleAvatarBg = (r: ContactRole): string => ({
  'agent': 'bg-primary/20 text-primary',
  'agent-client': 'bg-accent/20 text-accent',
  'buyer': 'bg-info/20 text-info',
  'seller': 'bg-secondary/20 text-secondary',
  'lender': 'bg-warning/20 text-warning',
  'title': 'bg-success/20 text-success',
  'attorney': 'bg-error/20 text-error',
  'inspector': 'bg-base-content/10 text-base-content',
  'appraiser': 'bg-base-content/10 text-base-content',
  'tc': 'bg-primary/20 text-primary',
  'other': 'bg-base-content/10 text-base-content',
}[r] ?? 'bg-base-content/10 text-base-content');

export const docTypeConfig: Record<DocRequestType, { label: string; description: string; urgency: 'high' | 'medium' | 'low' }> = {
  price_amendment: { label: 'Price Amendment', description: 'Price change requires a signed price amendment addendum.', urgency: 'high' },
  mf_addendum: { label: 'Multi-Family Addendum', description: 'Required addendum for all multi-family property transactions.', urgency: 'high' },
  closing_date_extension: { label: 'Closing Date Extension', description: 'Extension of the agreed-upon closing date requires all party signatures.', urgency: 'high' },
  inspection_addendum: { label: 'Inspection Addendum', description: 'Addendum addressing inspection findings and agreed repairs.', urgency: 'medium' },
  repair_addendum: { label: 'Repair Addendum', description: 'Addendum documenting agreed-upon repairs and credits.', urgency: 'medium' },
  hoa_addendum: { label: 'HOA Addendum', description: 'HOA documents and addendum required for this property.', urgency: 'medium' },
  lead_paint_addendum: { label: 'Lead Paint Addendum', description: 'Required for all pre-1978 homes — federal law.', urgency: 'high' },
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
