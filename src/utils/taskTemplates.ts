import { DealMilestone, DealTask, TaskPriority } from '../types';
import { generateId } from './helpers';

const addDaysFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

interface TaskTemplate {
  title: string;
  dueDaysFromToday: number;
  priority: TaskPriority;
  category: string;
}

const TEMPLATES: Record<DealMilestone, TaskTemplate[]> = {
  'contract-received': [
    { title: 'Send contract to lender for pre-approval review', dueDaysFromToday: 1, priority: 'high', category: 'Financial' },
    { title: 'Open title / escrow with title company', dueDaysFromToday: 2, priority: 'high', category: 'Legal' },
    { title: 'Collect Earnest Money Deposit (EMD)', dueDaysFromToday: 3, priority: 'high', category: 'Financial' },
    { title: 'Order home inspection', dueDaysFromToday: 5, priority: 'high', category: 'Inspections' },
    { title: 'Start compliance review checklist', dueDaysFromToday: 2, priority: 'medium', category: 'Compliance' },
    { title: 'Notify all parties — contract received', dueDaysFromToday: 0, priority: 'medium', category: 'Communications' },
  ],
  'emd-due': [
    { title: 'Confirm EMD receipt with title/escrow company', dueDaysFromToday: 0, priority: 'high', category: 'Financial' },
    { title: 'Upload EMD receipt to deal file', dueDaysFromToday: 1, priority: 'high', category: 'Financial' },
    { title: 'Notify buyer agent — EMD confirmed', dueDaysFromToday: 1, priority: 'medium', category: 'Communications' },
  ],
  'inspections-due': [
    { title: 'Review inspection report thoroughly', dueDaysFromToday: 1, priority: 'high', category: 'Inspections' },
    { title: 'Negotiate inspection repair requests with seller', dueDaysFromToday: 3, priority: 'high', category: 'Negotiations' },
    { title: 'Obtain repair cost estimates if needed', dueDaysFromToday: 3, priority: 'medium', category: 'Inspections' },
    { title: 'Remove inspection contingency or request credits', dueDaysFromToday: 5, priority: 'high', category: 'Legal' },
  ],
  'appraisal-ordered': [
    { title: 'Notify all parties — appraisal has been ordered', dueDaysFromToday: 0, priority: 'medium', category: 'Communications' },
    { title: 'Follow up with lender on appraisal status', dueDaysFromToday: 7, priority: 'medium', category: 'Financial' },
    { title: 'Confirm appraisal access scheduled with seller', dueDaysFromToday: 2, priority: 'medium', category: 'Inspections' },
  ],
  'appraisal-received': [
    { title: 'Review appraisal value vs. contract price', dueDaysFromToday: 0, priority: 'high', category: 'Financial' },
    { title: 'Address appraisal gap if value came in low', dueDaysFromToday: 2, priority: 'high', category: 'Negotiations' },
    { title: 'Upload appraisal report to deal file', dueDaysFromToday: 1, priority: 'medium', category: 'Financial' },
  ],
  'title-opened': [
    { title: 'Request title commitment from title company', dueDaysFromToday: 7, priority: 'high', category: 'Legal' },
    { title: 'Review title for liens, judgments, or issues', dueDaysFromToday: 10, priority: 'high', category: 'Legal' },
    { title: 'Confirm HOA documents received (if applicable)', dueDaysFromToday: 5, priority: 'medium', category: 'HOA' },
    { title: 'Order survey if required', dueDaysFromToday: 7, priority: 'low', category: 'Legal' },
  ],
  'loan-commitment': [
    { title: 'Confirm loan commitment letter received from lender', dueDaysFromToday: 0, priority: 'high', category: 'Financial' },
    { title: 'Upload loan commitment to deal file', dueDaysFromToday: 1, priority: 'high', category: 'Financial' },
    { title: 'Notify seller agent — loan commitment received', dueDaysFromToday: 1, priority: 'medium', category: 'Communications' },
    { title: 'Schedule final walkthrough with buyer', dueDaysFromToday: 3, priority: 'medium', category: 'Final Steps' },
  ],
  'closing-scheduled': [
    { title: 'Confirm closing time and location with all parties', dueDaysFromToday: 0, priority: 'high', category: 'Communications' },
    { title: 'Send closing instructions to buyer', dueDaysFromToday: 0, priority: 'high', category: 'Communications' },
    { title: 'Confirm wire instructions with title company', dueDaysFromToday: 1, priority: 'high', category: 'Financial' },
    { title: 'Request preliminary Closing Disclosure (CD) from lender', dueDaysFromToday: 2, priority: 'high', category: 'Financial' },
  ],
  'clear-to-close': [
    { title: 'Notify all parties — Clear to Close issued', dueDaysFromToday: 0, priority: 'high', category: 'Communications' },
    { title: 'Confirm final walkthrough is scheduled', dueDaysFromToday: 0, priority: 'high', category: 'Final Steps' },
    { title: 'Confirm closing docs are ready at title', dueDaysFromToday: 0, priority: 'high', category: 'Legal' },
    { title: 'Verify buyer funds wired to escrow', dueDaysFromToday: 1, priority: 'high', category: 'Financial' },
  ],
  'closed': [
    { title: 'Upload all closing documents to deal file', dueDaysFromToday: 1, priority: 'high', category: 'Compliance' },
    { title: 'Submit commission disbursement authorization (CDA)', dueDaysFromToday: 1, priority: 'high', category: 'Financial' },
    { title: 'Send post-closing thank you to client', dueDaysFromToday: 2, priority: 'medium', category: 'Communications' },
    { title: 'Archive deal file and mark complete', dueDaysFromToday: 3, priority: 'low', category: 'Compliance' },
  ],
  'archived': [
    { title: 'Document reason for transaction fallthrough', dueDaysFromToday: 0, priority: 'high', category: 'Compliance' },
    { title: 'Return earnest money if applicable', dueDaysFromToday: 2, priority: 'high', category: 'Financial' },
    { title: 'Notify all parties — transaction terminated', dueDaysFromToday: 0, priority: 'high', category: 'Communications' },
  ],
};

export const generateTasksForMilestone = (milestone: DealMilestone): DealTask[] => {
  const templates = TEMPLATES[milestone] ?? [];
  return templates.map(t => ({
    id: generateId(),
    title: t.title,
    dueDate: addDaysFromToday(t.dueDaysFromToday),
    priority: t.priority,
    category: t.category,
    milestone,
    autoGenerated: true,
  }));
};

export const MILESTONE_ORDER: DealMilestone[] = [
  'contract-received',
  'emd-due',
  'inspections-due',
  'appraisal-ordered',
  'appraisal-received',
  'title-opened',
  'loan-commitment',
  'closing-scheduled',
  'clear-to-close',
  'closed',
  'archived',
];

export const MILESTONE_LABELS: Record<DealMilestone, string> = {
  'contract-received':  'Contract Received',
  'emd-due':            'EMD Due',
  'inspections-due':    'Inspections Due',
  'appraisal-ordered':  'Appraisal Ordered',
  'appraisal-received': 'Appraisal Received',
  'title-opened':       'Title Opened',
  'loan-commitment':    'Loan Commitment',
  'closing-scheduled':  'Closing Scheduled',
  'clear-to-close':     'Clear to Close',
  'closed':             'Closed',
  'archived':           'Archived',
};

export const MILESTONE_COLORS: Record<DealMilestone, string> = {
  'contract-received':  'bg-blue-100 text-blue-700 border-blue-300',
  'emd-due':            'bg-indigo-100 text-indigo-700 border-indigo-300',
  'inspections-due':    'bg-violet-100 text-violet-700 border-violet-300',
  'appraisal-ordered':  'bg-purple-100 text-purple-700 border-purple-300',
  'appraisal-received': 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300',
  'title-opened':       'bg-sky-100 text-sky-700 border-sky-300',
  'loan-commitment':    'bg-teal-100 text-teal-700 border-teal-300',
  'closing-scheduled':  'bg-amber-100 text-amber-700 border-amber-300',
  'clear-to-close':     'bg-lime-100 text-lime-700 border-lime-300',
  'closed':             'bg-green-100 text-green-700 border-green-300',
  'archived':           'bg-red-100 text-red-700 border-red-300',
};

export const isTerminalMilestone = (m: DealMilestone) => m === 'closed' || m === 'archived';
