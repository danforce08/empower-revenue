export const STAGES = [
  { from: 'createdAt',          to: 'cleanDealAt',         label: 'Created → Clean Deal' },
  { from: 'cleanDealAt',        to: 'siteSurveyAt',        label: 'Clean Deal → Site Survey Completed' },
  { from: 'siteSurveyAt',       to: 'designAt',            label: 'Site Survey Completed → Design Completed' },
  { from: 'designAt',           to: 'permitSubmittedAt',   label: 'Design Completed → Permit Submitted' },
  { from: 'permitSubmittedAt',  to: 'permitApprovedAt',    label: 'Permit Submitted → Approved' },
  { from: 'permitApprovedAt',   to: 'installScheduledAt',  label: 'Permit Approved → Install Scheduled' },
  { from: 'installScheduledAt', to: 'installStartAt',      label: 'Install Scheduled → Install Start' },
] as const;

export type StageKey = (typeof STAGES)[number]['label'];

export const ACTIVE_STATUSES = new Set(['active', 'support', 'waiting on rep']);
export const STUCK_DAYS = 180;

export const AGE_BUCKETS: { label: string; max: number }[] = [
  { label: '0–30 days',   max: 30 },
  { label: '30–60 days',  max: 60 },
  { label: '60–90 days',  max: 90 },
  { label: '90–180 days', max: 180 },
  { label: '180+ days',   max: Infinity },
];

export const FUNNEL_STAGES: { label: string; field: string | null }[] = [
  { label: 'Total Deals (in CRM)',    field: null },
  { label: 'Clean Deal Completed',    field: 'cleanDealAt' },
  { label: 'Site Survey Completed',   field: 'siteSurveyAt' },
  { label: 'Design Completed',        field: 'designAt' },
  { label: 'Permit Submitted',        field: 'permitSubmittedAt' },
  { label: 'Permit Approved',         field: 'permitApprovedAt' },
  { label: 'Install Scheduled',       field: 'installScheduledAt' },
  { label: 'Install Started',         field: 'installStartAt' },
  { label: 'Install Completed',       field: 'installCompletedAt' },
  { label: 'PTO Received',            field: 'ptoReceivedAt' },
];

export const REQUIRED_COLUMNS = [
  'ID', 'Full Name', 'Organization', 'Customer Status', 'Project Status',
  'AHJ', 'Branch', 'Created At',
  'Clean Deal Completed Date', 'Site Survey Completed Date', 'Design Completed',
  'Permit Submitted Date', 'Permit Approved Date', 'Install Scheduled',
  'Install Start Date', 'Install Completed Date', 'PTO Received Date',
  'Days in Current Bucket', 'Project Status Updated At',
] as const;
