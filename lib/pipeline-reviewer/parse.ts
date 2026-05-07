import * as XLSX from 'xlsx';
import { parseDateLike } from '../jobflo-parser';
import { ACTIVE_STATUSES, REQUIRED_COLUMNS, STAGES, STUCK_DAYS } from './constants';
import type { Deal, ParseResult } from './types';

const cleanHeader = (h: unknown): string => String(h ?? '').toLowerCase().trim();

function asNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function asOfFromFilename(fileName: string): Date | null {
  const m = fileName.match(/customers_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}T${m[2].replace(/-/g, ':')}`;
  const d = new Date(iso);
  return Number.isNaN(+d) ? null : d;
}

function detectPartner(orgs: string[]): string {
  const counts = new Map<string, number>();
  for (const o of orgs) counts.set(o, (counts.get(o) ?? 0) + 1);
  let best = '', bestN = 0;
  for (const [o, n] of counts) {
    if (n > bestN) { best = o; bestN = n; }
  }
  return best || 'Pipeline';
}

export async function parsePipelineXlsx(
  buffer: ArrayBuffer,
  fileName: string,
  fileLastModified: number,
): Promise<ParseResult> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames.includes('Customers') ? 'Customers' : wb.SheetNames[0];
  if (!sheetName) throw new Error('No sheets found in the file.');

  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (rows.length < 2) throw new Error('File has no data rows.');

  const header = (rows[0] as unknown[]).map(cleanHeader);
  const idx = (name: string): number => header.findIndex((h) => h === name.toLowerCase());

  const missing = REQUIRED_COLUMNS.filter((c) => idx(c) < 0);
  if (missing.length) {
    throw new Error(
      `This doesn't look like a Jobflo customer export — missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
    );
  }

  const cols = {
    id:                idx('ID'),
    fullName:          idx('Full Name'),
    organization:      idx('Organization'),
    customerStatus:    idx('Customer Status'),
    projectStatus:     idx('Project Status'),
    ahj:               idx('AHJ'),
    branch:            idx('Branch'),
    utility:           idx('Utility Partner'),
    city:              idx('City'),
    state:             idx('State'),
    createdAt:         idx('Created At'),
    cleanDealAt:       idx('Clean Deal Completed Date'),
    siteSurveyAt:      idx('Site Survey Completed Date'),
    designAt:          idx('Design Completed'),
    permitSubmittedAt: idx('Permit Submitted Date'),
    permitApprovedAt:  idx('Permit Approved Date'),
    installScheduledAt: idx('Install Scheduled'),
    installStartAt:    idx('Install Start Date'),
    installCompletedAt: idx('Install Completed Date'),
    ptoReceivedAt:     idx('PTO Received Date'),
    statusUpdatedAt:   idx('Project Status Updated At'),
    daysInBucket:      idx('Days in Current Bucket'),
    soldSize:          idx('Sold System Size'),
    soldPpw:           idx('Sold Ppw'),
  };

  const asOf = asOfFromFilename(fileName) ?? new Date(fileLastModified || Date.now());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== '' && c != null));

  const deals: Deal[] = dataRows.map((r): Deal => {
    const get = (i: number) => (i >= 0 ? r[i] : '');
    const customerStatus = asString(get(cols.customerStatus)).toLowerCase();
    const isActive = ACTIVE_STATUSES.has(customerStatus);
    const isCancelled = customerStatus === 'cancelled';
    const isCompleted = customerStatus === 'completed';

    const createdAt = parseDateLike(get(cols.createdAt));
    const cleanDealAt = parseDateLike(get(cols.cleanDealAt));
    const siteSurveyAt = parseDateLike(get(cols.siteSurveyAt));
    const designAt = parseDateLike(get(cols.designAt));
    const permitSubmittedAt = parseDateLike(get(cols.permitSubmittedAt));
    const permitApprovedAt = parseDateLike(get(cols.permitApprovedAt));
    const installScheduledAt = parseDateLike(get(cols.installScheduledAt));
    const installStartAt = parseDateLike(get(cols.installStartAt));
    const installCompletedAt = parseDateLike(get(cols.installCompletedAt));
    const ptoReceivedAt = parseDateLike(get(cols.ptoReceivedAt));
    const statusUpdatedAt = parseDateLike(get(cols.statusUpdatedAt));

    const milestones: Record<string, Date | null> = {
      createdAt, cleanDealAt, siteSurveyAt, designAt,
      permitSubmittedAt, permitApprovedAt, installScheduledAt,
      installStartAt, installCompletedAt, ptoReceivedAt,
    };

    const stageDurations: Deal['stageDurations'] = {};
    for (const s of STAGES) {
      const d = daysBetween(milestones[s.from], milestones[s.to]);
      if (d != null && d >= 0) stageDurations[s.label] = d;
    }

    const daysSinceCreated = createdAt ? daysBetween(createdAt, asOf) : null;
    const daysSinceCleanDeal = cleanDealAt ? daysBetween(cleanDealAt, asOf) : null;
    const daysInBucketRaw = get(cols.daysInBucket);
    const daysInBucket = daysInBucketRaw === '' || daysInBucketRaw == null
      ? null
      : (Number.isFinite(Number(daysInBucketRaw)) ? Number(daysInBucketRaw) : null);
    const daysInStatus = daysInBucket ?? (statusUpdatedAt ? daysBetween(statusUpdatedAt, asOf) : null);

    return {
      id:                asString(get(cols.id)),
      fullName:          asString(get(cols.fullName)),
      organization:      asString(get(cols.organization)),
      customerStatus,
      projectStatus:     asString(get(cols.projectStatus)),
      ahj:               asString(get(cols.ahj)),
      branch:            asString(get(cols.branch)),
      utility:           asString(get(cols.utility)),
      city:              asString(get(cols.city)),
      state:             asString(get(cols.state)),
      createdAt, cleanDealAt, siteSurveyAt, designAt,
      permitSubmittedAt, permitApprovedAt, installScheduledAt,
      installStartAt, installCompletedAt, ptoReceivedAt,
      statusUpdatedAt,
      daysInCurrentBucket: daysInBucket,
      soldSize:           asNumber(get(cols.soldSize)),
      soldPpw:            asNumber(get(cols.soldPpw)),
      stageDurations,
      daysSinceCreated,
      daysSinceCleanDeal,
      daysInStatus,
      isActive, isCancelled, isCompleted,
      isStuck: isActive && daysSinceCreated != null && daysSinceCreated >= STUCK_DAYS,
    };
  });

  const distinct = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();

  return {
    deals,
    asOf,
    partnerName: detectPartner(deals.map((d) => d.organization).filter(Boolean)),
    organizations: distinct(deals.map((d) => d.organization)),
    branches:      distinct(deals.map((d) => d.branch)),
    utilities:     distinct(deals.map((d) => d.utility)),
    ahjs:          distinct(deals.map((d) => d.ahj)),
  };
}
