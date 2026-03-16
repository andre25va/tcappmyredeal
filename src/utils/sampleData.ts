import { Deal, ChecklistItem, Contact, DocumentRequest, Reminder, ActivityEntry, DirectoryContact, TransactionSide, DealMilestone, DealTask } from '../types';
import { generateId } from './helpers';
import { generateTasksForMilestone } from './taskTemplates';

const now = new Date();
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10); };

const ddChecklist = (): ChecklistItem[] => [
  // ── Documents & Contracts ──────────────────────────────────────
  { id: generateId(), title: 'Did you send seller disclosure to your seller?',       completed: false, category: 'Documents & Contracts', required: true },
  { id: generateId(), title: 'Did you upload seller disclosure to MLS?',             completed: false, category: 'Documents & Contracts', required: true },
  { id: generateId(), title: 'Did Amy sign Listing Agreement? (SELLER SIDE)',        completed: false, category: 'Documents & Contracts', required: true },
  { id: generateId(), title: 'Did Amy sign Buyers Agreement? (BUY SIDE)',            completed: false, category: 'Documents & Contracts', required: true },
  { id: generateId(), title: 'Did you Download and add it into DotLoop?',            completed: false, category: 'Documents & Contracts', required: true },
  { id: generateId(), title: 'Did you Start SKYLOPE checklist?',                     completed: false, category: 'Documents & Contracts' },
  { id: generateId(), title: 'Do you Read the Seller Disclosures?',                  completed: false, category: 'Documents & Contracts', required: true },

  // ── Financial ─────────────────────────────────────────────────
  { id: generateId(), title: 'Did you start ESCROW?',                                completed: false, category: 'Financial', required: true },
  { id: generateId(), title: 'Did you check taxes?',                                 completed: false, category: 'Financial', required: true },
  { id: generateId(), title: 'Did you fill out a Buyers Expense Worksheet?',         completed: false, category: 'Financial' },
  { id: generateId(), title: 'Did you check for Special Assessments?',               completed: false, category: 'Financial' },

  // ── Inspections & Reports ──────────────────────────────────────
  { id: generateId(), title: 'Did your client request insurance Quotes?',            completed: false, category: 'Inspections & Reports' },
  { id: generateId(), title: 'Did you ask about Insurance Claims?',                  completed: false, category: 'Inspections & Reports' },
  { id: generateId(), title: 'Did you check for Structural Issues?',                 completed: false, category: 'Inspections & Reports', required: true },
  { id: generateId(), title: 'Did you ask to have all utilities turned on?',         completed: false, category: 'Inspections & Reports' },
  { id: generateId(), title: 'Did you check the washer and dryer connection?',       completed: false, category: 'Inspections & Reports' },
  { id: generateId(), title: 'Do you need an Inspection Waiver?',                    completed: false, category: 'Inspections & Reports' },
  { id: generateId(), title: 'Did you verify no solar panels are on the house?',     completed: false, category: 'Inspections & Reports' },

  // ── Title & Legal ─────────────────────────────────────────────
  { id: generateId(), title: 'Did you check Zoning?',                                completed: false, category: 'Title & Legal', required: true },

  // ── HOA & Property ────────────────────────────────────────────
  { id: generateId(), title: 'Does the property have HOA?',                          completed: false, category: 'HOA & Property' },
  { id: generateId(), title: 'If Yes — do you have all the HOA info?',               completed: false, category: 'HOA & Property' },

  // ── Final Steps ───────────────────────────────────────────────
  { id: generateId(), title: 'Did you fill out Final Walk Through Sheet?',           completed: false, category: 'Final Steps', required: true },
  { id: generateId(), title: 'Did you schedule closing date with client and escrow?',completed: false, category: 'Final Steps', required: true },
];

const complianceChecklist = (): ChecklistItem[] => [
  { id: generateId(), title: 'MLS data verified and entered', completed: true, completedAt: addDays(now, -10), completedBy: 'Maria TC' },
  { id: generateId(), title: 'Signed agency disclosure on file', completed: true, completedAt: addDays(now, -9), completedBy: 'Maria TC' },
  { id: generateId(), title: 'Lead paint disclosure (if pre-1978)', completed: false },
  { id: generateId(), title: 'Buyer representation agreement on file', completed: false, dueDate: addDays(now, 1) },
  { id: generateId(), title: 'All offer documents uploaded to broker platform', completed: false },
  { id: generateId(), title: 'Commission disbursement authorization signed', completed: false },
];

const activityLog = (extra?: ActivityEntry[]): ActivityEntry[] => [
  {
    id: generateId(), timestamp: new Date(now.getTime() - 10 * 86400000).toISOString(),
    action: 'Deal created', detail: 'Transaction opened and parties notified.', user: 'Maria TC', type: 'deal_created',
  },
  {
    id: generateId(), timestamp: new Date(now.getTime() - 8 * 86400000).toISOString(),
    action: 'Status updated', detail: 'Status changed to Due Diligence.', user: 'Maria TC', type: 'status_change',
  },
  {
    id: generateId(), timestamp: new Date(now.getTime() - 6 * 86400000).toISOString(),
    action: 'Lender contact added', detail: 'Mike Flores — First Horizon Bank added to deal.', user: 'Maria TC', type: 'contact_added',
  },
  ...(extra ?? []),
];

// IDs we can reference in both directory and deal contacts
const DIR_IDS = {
  thorntons:  'dir_001',
  rkim:       'dir_002',
  mflores:    'dir_003',
  sunshine:   'dir_004',
  homecheck:  'dir_005',
  jwatkins:   'dir_006',
  patel:      'dir_007',
  goldstein:  'dir_008',
  premier:    'dir_009',
  atlTitle:   'dir_010',
  texTitle:   'dir_011',
  chiAtty:    'dir_012',
  floAtty:    'dir_013',
  wellsFargo: 'dir_014',
  usBank:     'dir_015',
  propcheck:  'dir_016',
};

const dealContactsFL = (): Contact[] => [
  { id: generateId(), directoryId: DIR_IDS.thorntons, name: 'James & Lisa Thornton', email: 'thorntons@gmail.com', phone: '(305) 555-0191', role: 'buyer', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.mflores,   name: 'Mike Flores',           email: 'mflores@firsthorizon.com', phone: '(305) 555-0102', role: 'lender', company: 'First Horizon Bank', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.sunshine,  name: 'Sunshine Title Co.',    email: 'closings@sunshinetitle.com', phone: '(305) 555-0350', role: 'title', company: 'Sunshine Title Co.', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.floAtty,   name: 'Rachel Goldstein, Esq.',email: 'rgoldstein@goldsteinlaw.com', phone: '(305) 555-0621', role: 'attorney', company: 'Goldstein Law Group', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.homecheck, name: 'HomeCheck Inspections', email: 'book@homecheck.com', phone: '(305) 555-0477', role: 'inspector', company: 'HomeCheck Inspections', inNotificationList: false },
];

const dealContactsGA = (): Contact[] => [
  { id: generateId(), directoryId: DIR_IDS.rkim,    name: 'Robert Kim',            email: 'rkim@gmail.com', phone: '(404) 555-0244', role: 'seller', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.mflores, name: 'Mike Flores',           email: 'mflores@firsthorizon.com', phone: '(305) 555-0102', role: 'lender', company: 'First Horizon Bank', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.atlTitle,name: 'Atlanta Premier Title', email: 'closings@atlpremier.com', phone: '(404) 555-0800', role: 'title', company: 'Atlanta Premier Title', inNotificationList: true },
];

const dealContactsTX = (): Contact[] => [
  { id: generateId(), directoryId: DIR_IDS.thorntons, name: 'James & Lisa Thornton', email: 'thorntons@gmail.com', phone: '(305) 555-0191', role: 'buyer', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.patel,     name: 'Sanjay Patel',          email: 'spatel@wellsfargo.com', phone: '(713) 555-0388', role: 'lender', company: 'Wells Fargo Home Loans', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.texTitle,  name: 'Lone Star Title Group', email: 'escrow@lonestartitle.com', phone: '(713) 555-0900', role: 'title', company: 'Lone Star Title Group', inNotificationList: true },
];

const dealContactsIL = (): Contact[] => [
  { id: generateId(), directoryId: DIR_IDS.rkim,     name: 'Robert Kim',            email: 'rkim@gmail.com', phone: '(404) 555-0244', role: 'buyer', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.wellsFargo,name: 'Dana Cole',             email: 'dcole@usbank.com', phone: '(312) 555-0155', role: 'lender', company: 'US Bank Mortgage', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.chiAtty,   name: 'Marcus Webb, Esq.',     email: 'mwebb@webbandco.com', phone: '(312) 555-0740', role: 'attorney', company: 'Webb & Co. Attorneys', inNotificationList: true },
  { id: generateId(), directoryId: DIR_IDS.premier,   name: 'Premier Title Chicago', email: 'title@premierchi.com', phone: '(312) 555-0501', role: 'title', company: 'Premier Title Chicago', inNotificationList: false },
];

export const generateSampleData = (): Deal[] => [
  {
    id: generateId(),
    address: '4821 Brickell Ave', city: 'Miami', state: 'FL', zipCode: '33131',
    mlsNumber: 'MLS-A112839', listPrice: 875000, contractPrice: 862500,
    propertyType: 'condo', status: 'due-diligence', transactionSide: 'buyer' as TransactionSide,
    contractDate: addDays(now, -10), closingDate: addDays(now, 25),
    agentId: 'ag1', agentName: 'Sofia Ramirez',
    contacts: dealContactsFL(),
    dueDiligenceChecklist: ddChecklist(),
    complianceChecklist: complianceChecklist(),
    documentRequests: [
      {
        id: generateId(), type: 'price_amendment', label: 'Price Amendment',
        description: 'Buyer requested price reduction to $862,500 after inspection findings.',
        requestedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
        requestedBy: 'Sofia Ramirez', status: 'pending', urgency: 'high',
        notes: 'Inspection found HVAC issues. Buyer and seller agreed on $862,500.',
      },
      {
        id: generateId(), type: 'hoa_addendum', label: 'HOA Addendum',
        description: 'HOA documents and addendum required for this condo.',
        requestedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
        requestedBy: 'Maria TC', status: 'in_progress', urgency: 'medium',
      },
    ],
    reminders: [
      { id: generateId(), title: 'DD Period Expires', dueDate: addDays(now, 5), notes: 'All inspection contingencies must be removed.', completed: false },
      { id: generateId(), title: 'HOA Docs Deadline', dueDate: addDays(now, 3), completed: false },
    ],
    activityLog: activityLog([
      {
        id: generateId(), timestamp: new Date(now.getTime() - 2 * 86400000).toISOString(),
        action: 'Price amendment requested', detail: 'Price reduced from $875,000 to $862,500 per buyer request after inspection.',
        user: 'Sofia Ramirez', type: 'price_change',
      },
    ]),
    notes: 'Buyer very motivated. Seller flexible on repairs.',
    milestone: 'inspections-due' as DealMilestone,
    tasks: generateTasksForMilestone('inspections-due'),
    createdAt: addDays(now, -10), updatedAt: new Date().toISOString(),
  },
  {
    id: generateId(),
    address: '118 Magnolia Way', city: 'Atlanta', state: 'GA', zipCode: '30318',
    mlsNumber: 'MLS-B883740', listPrice: 525000, contractPrice: 525000,
    propertyType: 'single-family', status: 'clear-to-close', transactionSide: 'seller' as TransactionSide,
    contractDate: addDays(now, -30), closingDate: addDays(now, 5),
    agentId: 'ag2', agentName: 'Darnell Washington',
    contacts: dealContactsGA(),
    dueDiligenceChecklist: ddChecklist().map(i => ({ ...i, completed: true })),
    complianceChecklist: complianceChecklist().map(i => ({ ...i, completed: true })),
    documentRequests: [
      {
        id: generateId(), type: 'closing_date_extension', label: 'Closing Date Extension',
        description: 'Lender requested 5-day extension due to appraisal delay.',
        requestedAt: new Date(now.getTime() - 3 * 86400000).toISOString(),
        requestedBy: 'First Horizon Bank', status: 'pending', urgency: 'high',
        notes: 'Appraisal came in late. New closing date: ' + addDays(now, 5),
      },
    ],
    reminders: [
      { id: generateId(), title: 'Final Walkthrough', dueDate: addDays(now, 4), notes: '24 hrs before closing.', completed: false },
      { id: generateId(), title: 'Closing Day', dueDate: addDays(now, 5), completed: false },
    ],
    activityLog: activityLog(),
    notes: 'Wire confirmed. Awaiting final CD from title.',
    milestone: 'clear-to-close' as DealMilestone,
    tasks: generateTasksForMilestone('clear-to-close'),
    createdAt: addDays(now, -30), updatedAt: new Date().toISOString(),
  },
  {
    id: generateId(),
    address: '2204 Duplex Drive', city: 'Houston', state: 'TX', zipCode: '77003',
    mlsNumber: 'MLS-C774512', listPrice: 415000, contractPrice: 405000,
    propertyType: 'multi-family', status: 'contract', transactionSide: 'buyer' as TransactionSide,
    contractDate: addDays(now, -5), closingDate: addDays(now, 35),
    agentId: 'ag3', agentName: 'Carmen Vega',
    contacts: dealContactsTX(),
    dueDiligenceChecklist: ddChecklist().map((i, idx) => ({ ...i, completed: idx < 2 })),
    complianceChecklist: complianceChecklist().map((i, idx) => ({ ...i, completed: idx < 1 })),
    documentRequests: [
      {
        id: generateId(), type: 'mf_addendum', label: 'Multi-Family Addendum',
        description: '⚠️ Auto-detected: This is a multi-family property. Multi-Family Addendum is required.',
        requestedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
        requestedBy: 'System Auto-Detect', status: 'pending', urgency: 'high',
      },
    ],
    reminders: [
      { id: generateId(), title: 'Option Period Expires', dueDate: addDays(now, 5), notes: 'Texas option period — 10 days.', completed: false },
    ],
    activityLog: activityLog([
      {
        id: generateId(), timestamp: new Date(now.getTime() - 5 * 86400000).toISOString(),
        action: 'Multi-Family Addendum auto-flagged', detail: 'System detected multi-family property type and flagged required addendum.',
        user: 'System', type: 'document_requested',
      },
    ]),
    notes: 'Duplex — both units currently tenant-occupied. Lease review needed.',
    milestone: 'contract-received' as DealMilestone,
    tasks: generateTasksForMilestone('contract-received'),
    createdAt: addDays(now, -5), updatedAt: new Date().toISOString(),
  },
  {
    id: generateId(),
    address: '990 Lakeshore Blvd', city: 'Chicago', state: 'IL', zipCode: '60657',
    mlsNumber: 'MLS-D991023', listPrice: 699000, contractPrice: 695000,
    propertyType: 'townhouse', status: 'contract', transactionSide: 'seller' as TransactionSide,
    contractDate: addDays(now, -3), closingDate: addDays(now, 42),
    agentId: 'ag1', agentName: 'Sofia Ramirez',
    contacts: dealContactsIL(),
    dueDiligenceChecklist: ddChecklist().map((i, idx) => ({ ...i, completed: idx < 3 })),
    complianceChecklist: complianceChecklist().map((i, idx) => ({ ...i, completed: idx < 2 })),
    documentRequests: [],
    reminders: [
      { id: generateId(), title: 'Attorney Review Period', dueDate: addDays(now, 7), notes: 'IL attorney review window.', completed: false },
    ],
    activityLog: activityLog(),
    notes: 'Attorney review period in effect — IL law.',
    milestone: 'emd-due' as DealMilestone,
    tasks: generateTasksForMilestone('emd-due'),
    createdAt: addDays(now, -3), updatedAt: new Date().toISOString(),
  },
];

export const generateDirectoryContacts = (): DirectoryContact[] => [
  // Buyers / Sellers
  { id: DIR_IDS.thorntons, name: 'James & Lisa Thornton', email: 'thorntons@gmail.com', phone: '(305) 555-0191', role: 'buyer', states: ['FL','TX'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.rkim,      name: 'Robert Kim',            email: 'rkim@gmail.com',      phone: '(404) 555-0244', role: 'buyer', states: ['GA'], createdAt: new Date().toISOString() },
  // Lenders
  { id: DIR_IDS.mflores,   name: 'Mike Flores',           email: 'mflores@firsthorizon.com', phone: '(305) 555-0102', role: 'lender', company: 'First Horizon Bank', states: ['FL','GA'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.patel,     name: 'Sanjay Patel',          email: 'spatel@wellsfargo.com',    phone: '(713) 555-0388', role: 'lender', company: 'Wells Fargo Home Loans', states: ['TX'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.wellsFargo,name: 'Dana Cole',             email: 'dcole@usbank.com',         phone: '(312) 555-0155', role: 'lender', company: 'US Bank Mortgage', states: ['IL'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.usBank,    name: 'Kevin Marsh',           email: 'kmarsh@quickenloans.com',  phone: '(888) 555-0010', role: 'lender', company: 'Rocket Mortgage', states: ['FL','GA','TX','IL'], createdAt: new Date().toISOString() },
  // Title Companies
  { id: DIR_IDS.sunshine,  name: 'Sunshine Title Co.',    email: 'closings@sunshinetitle.com', phone: '(305) 555-0350', role: 'title', company: 'Sunshine Title Co.', states: ['FL'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.atlTitle,  name: 'Atlanta Premier Title', email: 'closings@atlpremier.com',    phone: '(404) 555-0800', role: 'title', company: 'Atlanta Premier Title', states: ['GA'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.texTitle,  name: 'Lone Star Title Group', email: 'escrow@lonestartitle.com',   phone: '(713) 555-0900', role: 'title', company: 'Lone Star Title Group', states: ['TX'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.premier,   name: 'Premier Title Chicago', email: 'title@premierchi.com',       phone: '(312) 555-0501', role: 'title', company: 'Premier Title Chicago', states: ['IL'], createdAt: new Date().toISOString() },
  // Attorneys
  { id: DIR_IDS.floAtty,   name: 'Rachel Goldstein, Esq.',email: 'rgoldstein@goldsteinlaw.com', phone: '(305) 555-0621', role: 'attorney', company: 'Goldstein Law Group', states: ['FL'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.chiAtty,   name: 'Marcus Webb, Esq.',     email: 'mwebb@webbandco.com',         phone: '(312) 555-0740', role: 'attorney', company: 'Webb & Co. Attorneys', states: ['IL'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.goldstein, name: 'Sandra Ruiz, Esq.',     email: 'sruiz@ruizlaw.com',           phone: '(713) 555-0310', role: 'attorney', company: 'Ruiz & Associates', states: ['TX'], createdAt: new Date().toISOString() },
  // Inspectors
  { id: DIR_IDS.homecheck, name: 'HomeCheck Inspections', email: 'book@homecheck.com',  phone: '(305) 555-0477', role: 'inspector', company: 'HomeCheck Inspections', states: ['FL'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.propcheck, name: 'PropCheck Pro',         email: 'info@propchecktx.com', phone: '(713) 555-0662', role: 'inspector', company: 'PropCheck Pro', states: ['TX','GA'], createdAt: new Date().toISOString() },
  { id: DIR_IDS.jwatkins,  name: 'Joel Watkins',          email: 'joel@chicagoinspect.com', phone: '(312) 555-0882', role: 'inspector', company: 'Chicago Home Inspectors', states: ['IL'], createdAt: new Date().toISOString() },
];
