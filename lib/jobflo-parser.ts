import * as XLSX from 'xlsx';
import { isoDate, weekStart } from './periods';

const HEADER_ALIASES = {
  rep:        ['sales rep', 'rep name', 'salesperson', 'sales person', 'owner'],
  branch:     ['branch', 'office', 'location', 'market', 'region'],
  saleDate:   ['conversion at', 'sale date', 'deal date', 'contract date', 'signed date', 'sold date', 'date sold', 'created date'],
  installDate:['install completed date', 'install date', 'installed date', 'installation date', 'pto date', 'completed date'],
  status:     ['project status', 'status', 'stage', 'deal stage', 'pipeline'],
  isSolar:    ['is solar'],
  roofScheduled: ['roof install scheduled date'],
  roofCompleted: ['roof install completed date'],
  customerId: ['id', 'customer id', 'client id'],
  organization: ['organization', 'org'],
  source:     ['source'],
  fundingPartner: ['funding partner'],
  soldSystemSize: ['sold system size'],
  battery:    ['battery'],
  cleanDeal:  ['clean deal completed date', 'clean deal completed', 'clean deal date'],
} as const;

type AliasKey = keyof typeof HEADER_ALIASES;

export type ChannelKey = 'total_sales' | 'roof' | 'battery_only' | 'internal' | 'dealer' | 'hvac';

export type WeeklyBucket = {
  channelKey: ChannelKey;
  weekStart: string;
  weekEnd: string;
  branch: string | null;
  metrics: Record<string, number | string[]>;
};

export type ParseResult = {
  fileName: string;
  rowCount: number;
  buckets: WeeklyBucket[];
  /**
   * Per-day per-rep activity emitted alongside the weekly buckets. Lets the
   * Dashboard count distinct reps for any window without the boundary
   * over-counting that comes from weekly-bucket unique_reps unions.
   */
  dailyRepActivity: Array<{
    rep_name: string;
    activity_date: string;
    dealer_org: string | null;
    branch: string | null;
    /**
     * 'sale' = rep had at least one qualifying sale on `activity_date`.
     * 'install' = rep had at least one completed install on `activity_date`
     * (the row's Install Completed Date column). Both are written by the
     * same upload pass; the dashboard filters by `kind` to render the two
     * Active Reps charts independently.
     */
    kind: 'sale' | 'install';
  }>;
  classified: { solar: number; roof: number; battery: number; internal: number; both: number; unclassified: number };
  dateMin: string | null;
  dateMax: string | null;
  branchesSeen: string[];
  warnings: string[];
};

const indexFor = (header: string[], key: AliasKey): number => {
  for (const a of HEADER_ALIASES[key]) {
    const i = header.findIndex((h) => h === a || h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
};

const cleanHeader = (h: unknown): string =>
  String(h ?? '').toLowerCase().trim();

export function parseDateLike(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + v * 86_400_000);
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(+d)) return d;
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3]);
    if (yr < 100) yr += 2000;
    return new Date(yr, parseInt(m[1]) - 1, parseInt(m[2]));
  }
  return null;
}

const isTrueish = (v: unknown): boolean => {
  if (v === true) return true;
  const s = String(v ?? '').toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes';
};

/** Organizations that count as Empower's in-footprint Internal channel. */
const INTERNAL_ORGS = new Set(['empowerx', 'empower x']);

/**
 * Organizations that are NOT outside dealers (so excluded from the Dealer
 * channel rollup). Per Dan: Labor Only, Empower Home Services, Call Center,
 * and EmpowerX itself.
 */
const NON_DEALER_ORGS = new Set([
  'empowerx',
  'empower x',
  'empower home services',
  'empower services',
  'labor only',
  'call center',
]);

/**
 * Normalize org name variants to a single canonical label so the Sales Team
 * Mix leaderboard collapses synonyms instead of showing multiple rows for
 * the same actual org.
 *
 * NOTE: 'Call Center' is intentionally NOT collapsed into 'Empower X'.
 * Call Center is the Jobflo organization for Inside Sales (Jon Shields'
 * phone-based team running out of Mexico). Collapsing it into Empower X
 * obscures channel-level visibility into Inside Sales contribution and
 * makes Total Sales attribution wrong for the GTM plan. Keep them split.
 */
const ORG_LABEL_OVERRIDES: Record<string, string> = {
  'empowerx': 'Empower X',
  'empower x': 'Empower X',
  'empower home services': 'Empower X',
  'empower services': 'Empower X',
  'call center': 'Call Center',
};

/**
 * Title-case a multi-word org name (`ion solar` → `Ion Solar`) but pass
 * through known overrides untouched. Also normalizes whitespace.
 */
function titleCaseOrg(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function canonicalOrgLabel(orgNorm: string): string {
  if (ORG_LABEL_OVERRIDES[orgNorm]) return ORG_LABEL_OVERRIDES[orgNorm];
  return titleCaseOrg(orgNorm);
}

/**
 * Reject obviously-malformed org strings before they hit the leaderboard.
 * Examples seen in the wild: `ar distribution`, single-letter values, all-
 * digits values, empty/whitespace.
 */
function isValidOrgName(orgNorm: string): boolean {
  const s = orgNorm.trim();
  if (s.length < 3) return false;
  if (/^\d+$/.test(s)) return false;
  // "ar distribution" was a real garbage value in the data — nothing legit
  // looks like a 2-char prefix + space + word.
  if (/^[a-z]{1,2}\s+\w/.test(s) && s.split(/\s+/).length === 2) {
    // allow if it's a common short legit org abbreviation list — none right
    // now, so just reject. Override here if a real one shows up later.
    return false;
  }
  return true;
}

/**
 * Funding partners that only lend on solar systems. When a row's Is Solar
 * flag is blank but the funding partner is in this set, we treat the
 * deal as solar — fixes Empower X's internal data-hygiene gap where the
 * Is Solar toggle frequently doesn't get set in Jobflo even though the
 * deal is unambiguously solar (financing, pipeline status, branch, and
 * rep all align with solar).
 *
 * Excludes Participate Energy, which is the explicit battery-retrofit
 * marker handled separately.
 */
const SOLAR_FUNDING_PARTNERS = new Set([
  'goodleap', 'good leap', 'loanpal',
  'mosaic',
  'sunlight', 'sunlight financial',
  'sungage', 'sungage financial',
  'dividend', 'dividend finance', 'fifth third dividend',
  'iccu', 'idaho central credit union',
  'credit human',
  'renew financial',
  'lightreach', 'light reach',
  'sunrun',
  'sunnova',
  'service finance', 'service finance company',
  'enerbank',
  'ygrene',
  'everbright',
  'enphase',
  'home run financing', 'hfs financial',
  'ca first', 'california first', 'califirst',
  'pace funding', 'pace funding group',
  'counterpointe',
  'petros pace',
  'powerfin', 'powerfin partners',
  'swell', 'swell energy',
]);

/**
 * Source values that indicate an IP channel deal, which should not roll up
 * into Dealer (IP is its own channel owned by Brad Morris).
 */
const IP_SOURCES = new Set(['ip takeover']);

/** Sales reps whose deals are NOT attributed to Dealer (IP channel owner). */
const IP_REPS = new Set(['brad morris']);

/** Branch label → state, used to derive AZ/CA breakdown for the Internal channel. */
const BRANCH_STATE: Record<string, 'CA' | 'AZ' | 'TX'> = {
  arizona: 'AZ',
  phoenix: 'AZ',
  stockton: 'CA',
  fresno: 'CA',
  valencia: 'CA',
  riverside: 'CA',
  houston: 'TX',
};

function isSolarRow(row: unknown[], idxIsSolar: number): boolean {
  if (idxIsSolar < 0) return true;
  return isTrueish(row[idxIsSolar]);
}

function isRoofRow(
  row: unknown[],
  cols: { status: number; roofScheduled: number; roofCompleted: number },
): boolean {
  if (cols.status >= 0) {
    const status = String(row[cols.status] ?? '').toLowerCase();
    if (status.includes('roof')) return true;
  }
  if (cols.roofScheduled >= 0 && parseDateLike(row[cols.roofScheduled])) return true;
  if (cols.roofCompleted >= 0 && parseDateLike(row[cols.roofCompleted])) return true;
  return false;
}

function isInternalRow(row: unknown[], idxOrg: number): boolean {
  if (idxOrg < 0) return false;
  const org = String(row[idxOrg] ?? '').toLowerCase().trim();
  return INTERNAL_ORGS.has(org);
}

function isDealerRow(
  row: unknown[],
  cols: { organization: number; rep: number; source: number },
): boolean {
  if (cols.organization < 0) return false;
  const org = String(row[cols.organization] ?? '').toLowerCase().trim();
  if (!org) return false;
  if (NON_DEALER_ORGS.has(org)) return false;
  if (cols.rep >= 0) {
    const rep = String(row[cols.rep] ?? '').toLowerCase().trim();
    if (IP_REPS.has(rep)) return false;
  }
  if (cols.source >= 0) {
    const src = String(row[cols.source] ?? '').toLowerCase().trim();
    if (IP_SOURCES.has(src)) return false;
  }
  return true;
}

/**
 * Build a map of customerId → has-HVAC-adder from the "Adders" sheet. The
 * adder Name column contains entries like "HVAC - Full System (4 Ton)" and
 * "HVAC - Tune-up Package (600)" — any customer with at least one HVAC
 * adder is treated as an HVAC sale, since Jobflo doesn't track HVAC sold
 * status anywhere else for non-Inside-Sales channels.
 */
function buildHvacCustomerMap(wb: XLSX.WorkBook): Set<string> {
  const adders = wb.Sheets['Adders'];
  if (!adders) return new Set();
  const rows: unknown[][] = XLSX.utils.sheet_to_json(adders, { header: 1, raw: true, defval: '' });
  if (rows.length < 2) return new Set();
  const header = (rows[0] as string[]).map(cleanHeader);
  const idxName = header.findIndex((h) => h === 'name');
  const idxClient = header.findIndex((h) => h === 'client id');
  if (idxName < 0 || idxClient < 0) return new Set();

  const set = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i]?.[idxName] ?? '').toLowerCase();
    if (!name) continue;
    if (name.includes('hvac')) {
      const id = String(rows[i]?.[idxClient] ?? '');
      if (id) set.add(id);
    }
  }
  return set;
}

/**
 * Build a map of customerId → has-retrofit-case from the "Cases" sheet.
 * "Battery Retrofit (RDX)" is the canonical RDX Power retrofit marker.
 */
function buildBatteryRetrofitMap(wb: XLSX.WorkBook): Set<string> {
  const cases = wb.Sheets['Cases'];
  if (!cases) return new Set();
  const rows: unknown[][] = XLSX.utils.sheet_to_json(cases, { header: 1, raw: true, defval: '' });
  if (rows.length < 2) return new Set();
  const header = (rows[0] as string[]).map(cleanHeader);
  const idxName     = header.findIndex((h) => h === 'name');
  const idxClient   = header.findIndex((h) => h === 'client id');
  if (idxName < 0 || idxClient < 0) return new Set();

  const set = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i]?.[idxName] ?? '').toLowerCase();
    if (!name) continue;
    if (/retrofit/.test(name)) {
      const id = String(rows[i]?.[idxClient] ?? '');
      if (id) set.add(id);
    }
  }
  return set;
}

export async function parseJobfloFile(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<ParseResult> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames.includes('Customers')
    ? 'Customers'
    : wb.SheetNames[0];
  if (!sheetName) {
    return {
      fileName, rowCount: 0, buckets: [], dailyRepActivity: [],
      classified: { solar: 0, roof: 0, battery: 0, internal: 0, both: 0, unclassified: 0 },
      dateMin: null, dateMax: null, branchesSeen: [], warnings: ['No sheets found'],
    };
  }
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (rows.length < 2) {
    return {
      fileName, rowCount: 0, buckets: [], dailyRepActivity: [],
      classified: { solar: 0, roof: 0, battery: 0, internal: 0, both: 0, unclassified: 0 },
      dateMin: null, dateMax: null, branchesSeen: [], warnings: ['File has no data rows'],
    };
  }

  const header = rows[0].map(cleanHeader);
  const cols = {
    rep:           indexFor(header, 'rep'),
    branch:        indexFor(header, 'branch'),
    saleDate:      indexFor(header, 'saleDate'),
    installDate:   indexFor(header, 'installDate'),
    status:        indexFor(header, 'status'),
    isSolar:       indexFor(header, 'isSolar'),
    roofScheduled: indexFor(header, 'roofScheduled'),
    roofCompleted: indexFor(header, 'roofCompleted'),
    customerId:    indexFor(header, 'customerId'),
    organization:  indexFor(header, 'organization'),
    source:        indexFor(header, 'source'),
    fundingPartner: indexFor(header, 'fundingPartner'),
    soldSystemSize: indexFor(header, 'soldSystemSize'),
    battery:        indexFor(header, 'battery'),
    cleanDeal:      indexFor(header, 'cleanDeal'),
  };

  const warnings: string[] = [];
  if (cols.saleDate < 0) warnings.push('No sale-date column found — cannot bucket by week');
  if (cols.branch < 0)   warnings.push('No branch column found — branch will be null');
  if (cols.isSolar < 0)  warnings.push('No "Is Solar" column — assuming every row is a solar deal');
  if (cols.organization < 0) {
    warnings.push('No Organization column — Internal channel volume will not be detected');
  }
  if (cols.status < 0 && cols.roofScheduled < 0 && cols.roofCompleted < 0) {
    warnings.push('No roof-related columns found — roof channel will not receive uploads');
  }

  const retrofitClients = buildBatteryRetrofitMap(wb);
  if (retrofitClients.size === 0 && wb.SheetNames.includes('Cases')) {
    warnings.push('Cases sheet present but no retrofit cases found — Battery Only will be empty');
  }
  const hvacClients = buildHvacCustomerMap(wb);
  if (hvacClients.size === 0 && wb.SheetNames.includes('Adders')) {
    warnings.push('Adders sheet present but no HVAC adders found — HVAC channel from Jobflo will be empty');
  }

  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== '' && c != null));

  const bucketKey = (channel: ChannelKey, weekStartIso: string, branch: string | null) =>
    `${channel}|${weekStartIso}|${branch ?? ''}`;
  const buckets = new Map<string, WeeklyBucket>();
  // Per-bucket Set tracking for distinct-string fields. Serialized into bucket
  // metrics as sorted arrays at the end.
  const bucketSets = new Map<string, Map<string, Set<string>>>();
  const addToBucketSet = (bKey: string, field: string, value: string): void => {
    if (!value) return;
    let m = bucketSets.get(bKey);
    if (!m) { m = new Map(); bucketSets.set(bKey, m); }
    let s = m.get(field);
    if (!s) { s = new Set(); m.set(field, s); }
    s.add(value);
  };
  const branchesSeen = new Set<string>();
  // Daily rep activity — one entry per (rep, date, kind). Lets the
  // Dashboard count distinct reps for any window without weekly-bucket
  // overcount, separately for "active by sale" vs "active by install".
  const dailyRepKey = (rep: string, dateIso: string, kind: 'sale' | 'install'): string =>
    `${rep}|${dateIso}|${kind}`;
  const dailyRepRows = new Map<
    string,
    { rep_name: string; activity_date: string; dealer_org: string | null; branch: string | null; kind: 'sale' | 'install' }
  >();

  // Global "first appearance" sets used to derive recruitment markers.
  // Population is order-dependent — rows must be sorted by sale date ASC
  // before this loop so the first sighting of each rep/org is the actual
  // earliest one in the dataset.
  const seenReps = new Set<string>();
  const seenOrgs = new Set<string>();

  let dateMin: Date | null = null;
  let dateMax: Date | null = null;
  const classified = { solar: 0, roof: 0, battery: 0, internal: 0, dealer: 0, both: 0, unclassified: 0 };

  // Sort by sale date so first-appearance recruitment markers land on the
  // correct (earliest) bucket per rep/org.
  const sortedRows = dataRows.slice().sort((a, b) => {
    const da = cols.saleDate >= 0 ? parseDateLike(a[cols.saleDate]) : null;
    const db = cols.saleDate >= 0 ? parseDateLike(b[cols.saleDate]) : null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  // Future-dated install rows (e.g. an install scheduled for 2026-05-25)
  // shouldn't affect "actual installs" counts. Cutoff is today; install
  // events past this are dropped from emission. Sale dates are unaffected.
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const isFutureInstall = (d: Date | null): boolean => !!d && d > today;

  for (const r of sortedRows) {
    const sale = cols.saleDate >= 0 ? parseDateLike(r[cols.saleDate]) : null;
    if (!sale) continue;

    if (!dateMin || sale < dateMin) dateMin = sale;
    if (!dateMax || sale > dateMax) dateMax = sale;

    const wkStart = weekStart(sale);
    const wkStartIso = isoDate(wkStart);
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkEnd.getDate() + 6);
    const wkEndIso = isoDate(wkEnd);

    const branchRaw = cols.branch >= 0 ? String(r[cols.branch] ?? '').trim() : '';
    const branch = branchRaw ? branchRaw : null;
    if (branch) branchesSeen.add(branch);

    const customerId = cols.customerId >= 0 ? String(r[cols.customerId] ?? '') : '';
    const isSolarFlag = isSolarRow(r, cols.isSolar);
    const roof = isRoofRow(r, cols);
    // Battery retrofit detection — Participate Energy systematically marks
    // these rows as `Is Solar = TRUE` even though they're battery-only deals,
    // so we run the retrofit check FIRST and let it shadow the solar flag.
    // Per Dan: required signals are Funding Partner = "Participate Energy",
    // Sold System Size = 0 (or empty), AND a non-empty Battery equipment
    // field. The Cases-sheet RDX retrofit marker is a tertiary fallback.
    const fundingPartner = cols.fundingPartner >= 0
      ? String(r[cols.fundingPartner] ?? '').trim().toLowerCase()
      : '';
    const soldSizeRaw = cols.soldSystemSize >= 0 ? r[cols.soldSystemSize] : '';
    const soldSize = soldSizeRaw === '' || soldSizeRaw == null
      ? 0
      : Number(soldSizeRaw);
    const batteryEquipment = cols.battery >= 0
      ? String(r[cols.battery] ?? '').trim()
      : '';
    const isParticipateRetrofit =
      fundingPartner === 'participate energy'
      && soldSize === 0
      && batteryEquipment.length > 0;
    const batteryOnly = isParticipateRetrofit
      || (!!customerId && retrofitClients.has(customerId));
    // Solar inference fallback. The Is Solar flag is frequently blank on
    // Empower X internal entries even though the deal is plainly solar
    // (solar lender, solar-pipeline status, internal rep). If the column
    // says nothing but the funding partner only ever lends on solar
    // systems, treat as solar. Explicitly excludes the Participate
    // Energy retrofit path which the battery_only branch owns.
    const isSolarByFinancing =
      !isSolarFlag
      && fundingPartner !== 'participate energy'
      && SOLAR_FUNDING_PARTNERS.has(fundingPartner);
    const isSolarEffective = isSolarFlag || isSolarByFinancing;
    // A row classified as battery_only is NOT also counted toward solar, even
    // when Jobflo's Is Solar flag is TRUE (it lies for retrofits).
    const solar = isSolarEffective && !batteryOnly;
    const internal = isInternalRow(r, cols.organization);
    const dealer = isDealerRow(r, cols);
    // HVAC sold via Adders sheet: any customer with an "HVAC" adder name
    // (Tune-up Package, Full System, Extra HVAC Cost, etc.) counts as an
    // HVAC sale on this row's sale-week bucket. Co-occurs with solar / roof
    // when the customer bought both — both channels get the row, matching
    // the "All Products Combined Volume" framing on the Dashboard.
    const hvac = !!customerId && hvacClients.has(customerId);

    let kinds = 0;
    if (solar) { classified.solar++; kinds++; }
    if (roof)  { classified.roof++; kinds++; }
    if (batteryOnly) { classified.battery++; kinds++; }
    if (hvac) { kinds++; }
    if (internal) { classified.internal++; }
    if (dealer) { classified.dealer++; }
    if (kinds > 1) classified.both++;
    if (kinds === 0 && !internal && !dealer) {
      classified.unclassified++;
      continue;
    }

    // Clean Deal % counters — every classified row counts as an account
    // created. A row is "clean" when its Clean Deal Completed Date is
    // populated, OR when its Funding Partner is Participate Energy
    // (Participate never backfills Clean Deal, so without this override
    // their deals would tank the percentage). Emitted on the `total_sales`
    // bucket for the sale week so the Dashboard can roll it up the same
    // way it rolls up other total_sales metrics.
    const cleanDealDate = cols.cleanDeal >= 0 ? parseDateLike(r[cols.cleanDeal]) : null;
    const isParticipate = fundingPartner === 'participate energy';
    const isCleanDeal = !!cleanDealDate || isParticipate;
    const cdKey = bucketKey('total_sales', wkStartIso, branch);
    const cdDelta: Record<string, number> = {
      accounts_created: 1,
      clean_deal_completed: isCleanDeal ? 1 : 0,
    };
    if (isCleanDeal && isParticipate && !cleanDealDate) {
      cdDelta.clean_deal_participate_override = 1;
    }
    addToBucket(buckets, cdKey, {
      channelKey: 'total_sales',
      weekStart: wkStartIso, weekEnd: wkEndIso, branch,
      delta: cdDelta,
    });

    // Active reps + recruitment tracking. Attached to the `total_sales` bucket
    // for the week so it's a single global rollup target. The eligibility
    // filter is broader than the dealer-channel one: any qualifying deal
    // counts the rep, not just solar.
    const repNorm = cols.rep >= 0
      ? String(r[cols.rep] ?? '').toLowerCase().trim()
      : '';
    const orgNorm = cols.organization >= 0
      ? String(r[cols.organization] ?? '').toLowerCase().trim()
      : '';
    const sourceNorm = cols.source >= 0
      ? String(r[cols.source] ?? '').toLowerCase().trim()
      : '';
    const isIPTakeover = IP_SOURCES.has(sourceNorm) || IP_REPS.has(repNorm);
    const isLaborOnly = orgNorm === 'labor only';
    const qualifiesForActive = !isIPTakeover && !isLaborOnly && !!repNorm;
    if (qualifiesForActive) {
      const tsKey = bucketKey('total_sales', wkStartIso, branch);
      // Ensure the total_sales bucket exists even for non-solar rows so the
      // unique_reps array attaches somewhere.
      // Per-org deal count emitted as `org__<org>` numeric metric so the
      // existing rollup (sum across rows) works without type changes. The
      // Dashboard filters keys by the `org__` prefix to render a leaderboard.
      // Internal/Empower orgs collapse to a single canonical label so they
      // appear on the leaderboard instead of being scattered or excluded.
      const orgDelta: Record<string, number> = {};
      if (orgNorm && isValidOrgName(orgNorm)) {
        orgDelta[`org__${canonicalOrgLabel(orgNorm)}`] = 1;
      }
      addToBucket(buckets, tsKey, {
        channelKey: 'total_sales',
        weekStart: wkStartIso, weekEnd: wkEndIso, branch,
        delta: orgDelta,
      });
      addToBucketSet(tsKey, 'unique_reps', repNorm);
      // Record per-day rep activity for boundary-accurate distinct-rep
      // counts on the Dashboard. Keyed by (rep, date, kind) so multi-deal
      // days collapse to one row per kind.
      const saleDateIso = isoDate(sale);
      const repOrgLabel = orgNorm && isValidOrgName(orgNorm)
        ? canonicalOrgLabel(orgNorm)
        : null;
      const saleKey = dailyRepKey(repNorm, saleDateIso, 'sale');
      if (!dailyRepRows.has(saleKey)) {
        dailyRepRows.set(saleKey, {
          rep_name: repNorm,
          activity_date: saleDateIso,
          dealer_org: repOrgLabel,
          branch,
          kind: 'sale',
        });
      }
      // Mirror emission keyed by the install-completed date when present
      // and not future-dated. Drives the "Active Reps by Install" chart.
      const repInstallDate = cols.installDate >= 0
        ? parseDateLike(r[cols.installDate])
        : null;
      if (repInstallDate && !isFutureInstall(repInstallDate)) {
        const installIso = isoDate(repInstallDate);
        const installKey = dailyRepKey(repNorm, installIso, 'install');
        if (!dailyRepRows.has(installKey)) {
          dailyRepRows.set(installKey, {
            rep_name: repNorm,
            activity_date: installIso,
            dealer_org: repOrgLabel,
            branch,
            kind: 'install',
          });
        }
      }
      if (!seenReps.has(repNorm)) {
        seenReps.add(repNorm);
        addToBucketSet(tsKey, 'recruited_reps', repNorm);
      }
      // Dealer-org recruitment — only count orgs that are actual outside
      // dealers (not internal Empower entities, not labor-only).
      if (orgNorm && !NON_DEALER_ORGS.has(orgNorm) && !seenOrgs.has(orgNorm)) {
        seenOrgs.add(orgNorm);
        addToBucketSet(tsKey, 'recruited_orgs', orgNorm);
      }
    }

    if (solar) {
      // Sale bucket — `accounts: 1` keyed by the SALE week.
      addToBucket(buckets, bucketKey('total_sales', wkStartIso, branch), {
        channelKey: 'total_sales',
        weekStart: wkStartIso, weekEnd: wkEndIso, branch,
        delta: { accounts: 1 },
      });
      // Install bucket — `installs: 1` keyed by the INSTALL completed week, so
      // "installs this week" on the dashboard truly means "completed this
      // week" instead of "deals sold this week that have been installed at
      // some point." Sales-week vs install-week buckets coexist in the same
      // table and rollupMetrics sums them naturally.
      const installDate = cols.installDate >= 0
        ? parseDateLike(r[cols.installDate])
        : null;
      if (installDate && !isFutureInstall(installDate)) {
        const iwkStart = weekStart(installDate);
        const iwkEnd = new Date(iwkStart);
        iwkEnd.setDate(iwkEnd.getDate() + 6);
        addToBucket(buckets, bucketKey('total_sales', isoDate(iwkStart), branch), {
          channelKey: 'total_sales',
          weekStart: isoDate(iwkStart), weekEnd: isoDate(iwkEnd), branch,
          delta: { installs: 1 },
        });
      }
    }
    if (roof) {
      addToBucket(buckets, bucketKey('roof', wkStartIso, branch), {
        channelKey: 'roof',
        weekStart: wkStartIso, weekEnd: wkEndIso, branch,
        delta: { accounts: 1 },
      });
      const roofInstallDate = cols.roofCompleted >= 0
        ? parseDateLike(r[cols.roofCompleted])
        : null;
      if (roofInstallDate && !isFutureInstall(roofInstallDate)) {
        const iwkStart = weekStart(roofInstallDate);
        const iwkEnd = new Date(iwkStart);
        iwkEnd.setDate(iwkEnd.getDate() + 6);
        addToBucket(buckets, bucketKey('roof', isoDate(iwkStart), branch), {
          channelKey: 'roof',
          weekStart: isoDate(iwkStart), weekEnd: isoDate(iwkEnd), branch,
          delta: { installs: 1 },
        });
      }
    }
    if (batteryOnly) {
      // Sale-week bucket
      addToBucket(buckets, bucketKey('battery_only', wkStartIso, branch), {
        channelKey: 'battery_only',
        weekStart: wkStartIso, weekEnd: wkEndIso, branch,
        delta: { accounts: 1 },
      });
      // Install-week bucket — battery retrofits DO get installed (Participate
      // ships hardware and someone bolts it on). The old code hard-coded
      // `installs: 0` here, which silently dropped every battery install
      // from /dashboard's MTD/QTD/YTD installs totals. Mirror the solar
      // pattern: separate bucket keyed by install-completed week.
      const installDate = cols.installDate >= 0
        ? parseDateLike(r[cols.installDate])
        : null;
      if (installDate && !isFutureInstall(installDate)) {
        const iwkStart = weekStart(installDate);
        const iwkEnd = new Date(iwkStart);
        iwkEnd.setDate(iwkEnd.getDate() + 6);
        addToBucket(buckets, bucketKey('battery_only', isoDate(iwkStart), branch), {
          channelKey: 'battery_only',
          weekStart: isoDate(iwkStart), weekEnd: isoDate(iwkEnd), branch,
          delta: { installs: 1 },
        });
      }
    }
    if (hvac) {
      // HVAC sale lands in the customer's sale-week bucket. Install date
      // (when present) goes to the install-week bucket as a separate row,
      // mirroring how solar splits sale vs install.
      addToBucket(buckets, bucketKey('hvac', wkStartIso, branch), {
        channelKey: 'hvac',
        weekStart: wkStartIso, weekEnd: wkEndIso, branch,
        delta: { accounts: 1 },
      });
      const installDate = cols.installDate >= 0 ? parseDateLike(r[cols.installDate]) : null;
      if (installDate && !isFutureInstall(installDate)) {
        const iwkStart = weekStart(installDate);
        const iwkEnd = new Date(iwkStart);
        iwkEnd.setDate(iwkEnd.getDate() + 6);
        addToBucket(buckets, bucketKey('hvac', isoDate(iwkStart), branch), {
          channelKey: 'hvac',
          weekStart: isoDate(iwkStart), weekEnd: isoDate(iwkEnd), branch,
          delta: { install: 1 },
        });
      }
    }
    if (internal) {
      const branchKey = (branch ?? '').toLowerCase().trim();
      const state = BRANCH_STATE[branchKey];
      addToBucket(buckets, bucketKey('internal', wkStartIso, branch), {
        channelKey: 'internal',
        weekStart: wkStartIso, weekEnd: wkEndIso, branch,
        delta: {
          in_footprint: 1,
          out_footprint: 0,
          az_accounts: state === 'AZ' ? 1 : 0,
          ca_accounts: state === 'CA' ? 1 : 0,
        },
      });
    }
    if (dealer) {
      addToBucket(buckets, bucketKey('dealer', wkStartIso, branch), {
        channelKey: 'dealer',
        weekStart: wkStartIso, weekEnd: wkEndIso, branch,
        delta: { accounts: 1 },
      });
    }
  }

  // Serialize the per-bucket distinct-string Sets into sorted arrays under
  // their bucket's `metrics` map.
  for (const [bKey, fieldMap] of bucketSets) {
    const bucket = buckets.get(bKey);
    if (!bucket) continue;
    for (const [field, set] of fieldMap) {
      bucket.metrics[field] = Array.from(set).sort();
    }
  }

  return {
    fileName,
    rowCount: dataRows.length,
    buckets: Array.from(buckets.values()).sort((a, b) => {
      if (a.channelKey !== b.channelKey) return a.channelKey.localeCompare(b.channelKey);
      if (a.weekStart !== b.weekStart) return a.weekStart.localeCompare(b.weekStart);
      return (a.branch ?? '').localeCompare(b.branch ?? '');
    }),
    dailyRepActivity: Array.from(dailyRepRows.values()),
    classified,
    dateMin: dateMin ? isoDate(dateMin) : null,
    dateMax: dateMax ? isoDate(dateMax) : null,
    branchesSeen: Array.from(branchesSeen).sort(),
    warnings,
  };
}

function addToBucket(
  map: Map<string, WeeklyBucket>,
  key: string,
  init: Omit<WeeklyBucket, 'metrics'> & { delta: Record<string, number> },
): void {
  const existing = map.get(key);
  if (existing) {
    for (const k of Object.keys(init.delta)) {
      const cur = existing.metrics[k];
      const curNum = typeof cur === 'number' ? cur : 0;
      existing.metrics[k] = curNum + init.delta[k];
    }
  } else {
    map.set(key, {
      channelKey: init.channelKey,
      weekStart: init.weekStart,
      weekEnd: init.weekEnd,
      branch: init.branch,
      metrics: { ...init.delta },
    });
  }
}

/**
 * DIAGNOSTIC ONLY — find rows that PASS the parser's "classified" gate
 * (so they count toward `accounts_created`) but have NO product flag
 * (no solar, no roof, no battery, no hvac). These are rows attributed
 * only via internal-org or dealer-org. Used to investigate the gap
 * between /dashboard's 4-product sum and the all-classified count.
 */
export type UnattributedDiagnosticRow = {
  customerId: string;
  fullName: string;
  organization: string;
  fundingPartner: string;
  rep: string;
  branch: string | null;
  source: string;
  saleDate: string;       // ISO
  isSolarRaw: string;     // raw value from Is Solar column
  status: string;
  internal: boolean;
  dealer: boolean;
};

/**
 * DIAGNOSTIC — broad scan of every install-related date column in the
 * Customers sheet, plus a sniff of other sheets that might contain
 * install events. Used to locate the gap when Jobflo's reported
 * install count exceeds what the parser sees in Customers.
 */
export async function scanInstallSources(
  buffer: ArrayBuffer,
  startIso: string,
  endIso: string,
): Promise<{
  sheets: string[];
  customer_install_dates: Record<string, number>;  // column -> count of rows in range
  project_statuses_in_range: Record<string, number>;  // status -> count among rows with Install Completed in range
  future_install_completed: number;
  same_day_install_pto: number;
  adders_sheet_summary?: { rows: number; hvac_keywords: number; install_columns: string[] };
  cases_sheet_summary?: { rows: number; install_columns: string[] };
  service_sheet_summary?: { rows: number; install_columns: string[] };
}> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheets = wb.SheetNames;
  const customers = wb.Sheets['Customers'];
  if (!customers) {
    return { sheets, customer_install_dates: {}, project_statuses_in_range: {}, future_install_completed: 0, same_day_install_pto: 0 };
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(customers, { header: 1, raw: true, defval: '' });
  if (rows.length < 2) {
    return { sheets, customer_install_dates: {}, project_statuses_in_range: {}, future_install_completed: 0, same_day_install_pto: 0 };
  }
  const header = (rows[0] as unknown[]).map(cleanHeader);

  // Every column that looks install-related. Catch-all so we surface
  // anything we haven't been tracking.
  const installRelated = header
    .map((h, idx) => ({ h, idx }))
    .filter(({ h }) =>
      h.includes('install')
      || h.includes('pto')
      || h.includes('inspection')
      || h.includes('mpu')
      || h.includes('meter set')
      || h.includes('placard')
      || h.includes('interconnection'),
    );

  const counts: Record<string, number> = {};
  const today = isoDate(new Date());
  let futureInstallCompleted = 0;
  let sameDayInstallPto = 0;

  const installCompletedIdx = header.findIndex((h) => h === 'install completed date');
  const ptoReceivedIdx = header.findIndex((h) => h === 'pto received date');
  const statusIdx = header.findIndex((h) => h === 'project status');
  const statusCounts: Record<string, number> = {};

  for (const r of rows.slice(1)) {
    if (!r.some((c) => c !== '' && c != null)) continue;
    for (const { h, idx } of installRelated) {
      const d = parseDateLike(r[idx]);
      if (!d) continue;
      const iso = isoDate(d);
      if (iso >= startIso && iso <= endIso) {
        counts[h] = (counts[h] ?? 0) + 1;
      }
    }
    // Future-dated Install Completed: rows the parser drops via isFutureInstall.
    if (installCompletedIdx >= 0) {
      const d = parseDateLike(r[installCompletedIdx]);
      if (d) {
        const iso = isoDate(d);
        if (iso > today) futureInstallCompleted++;
        if (iso >= startIso && iso <= endIso && statusIdx >= 0) {
          const s = String(r[statusIdx] ?? '').trim() || '(blank)';
          statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        }
      }
    }
    // Same-day install + PTO (parser would count this once on install
    // bucket; Jobflo might count it twice or under a different metric).
    if (installCompletedIdx >= 0 && ptoReceivedIdx >= 0) {
      const di = parseDateLike(r[installCompletedIdx]);
      const dp = parseDateLike(r[ptoReceivedIdx]);
      if (di && dp && isoDate(di) === isoDate(dp)
          && isoDate(di) >= startIso && isoDate(di) <= endIso) {
        sameDayInstallPto++;
      }
    }
  }

  // Other sheets — see if they have install-related columns we're not reading.
  function sniffSheet(name: string): { rows: number; install_columns: string[] } | undefined {
    const ws = wb.Sheets[name];
    if (!ws) return undefined;
    const r2: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (r2.length < 1) return { rows: 0, install_columns: [] };
    const h2 = (r2[0] as unknown[]).map(cleanHeader);
    return {
      rows: r2.length - 1,
      install_columns: h2.filter((h) => h.includes('install') || h.includes('pto') || h.includes('completed')),
    };
  }
  const adders = sniffSheet('Adders');
  const cases = sniffSheet('Cases');
  const service = sniffSheet('Service') ?? sniffSheet('Services') ?? sniffSheet('Maintenance');

  // Bonus: count HVAC keyword hits in the Adders Name column, for May range.
  let addersHvacInRange = 0;
  const addersWs = wb.Sheets['Adders'];
  if (addersWs) {
    const ar: unknown[][] = XLSX.utils.sheet_to_json(addersWs, { header: 1, raw: true, defval: '' });
    if (ar.length >= 2) {
      const ah = (ar[0] as unknown[]).map(cleanHeader);
      const nameIdx = ah.findIndex((h) => h === 'name');
      const dateCandidates = ah
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => h.includes('install') || h.includes('completed') || h === 'created at' || h.includes('date'));
      for (let i = 1; i < ar.length; i++) {
        const name = String(ar[i]?.[nameIdx] ?? '').toLowerCase();
        if (!name.includes('hvac')) continue;
        // Any install/date column with a date in range
        for (const { i: di } of dateCandidates) {
          const d = parseDateLike(ar[i]?.[di]);
          if (d) {
            const iso = isoDate(d);
            if (iso >= startIso && iso <= endIso) { addersHvacInRange++; break; }
          }
        }
      }
    }
  }

  return {
    sheets,
    customer_install_dates: counts,
    project_statuses_in_range: statusCounts,
    future_install_completed: futureInstallCompleted,
    same_day_install_pto: sameDayInstallPto,
    adders_sheet_summary: adders ? { ...adders, hvac_keywords: addersHvacInRange } : undefined,
    cases_sheet_summary: cases,
    service_sheet_summary: service,
  };
}

/**
 * DIAGNOSTIC — count rows whose Install Completed Date falls in
 * [startIso, endIso], broken out by classification. Helps pinpoint
 * which install categories the dashboard is or isn't counting.
 */
export async function countInstallsByCategory(
  buffer: ArrayBuffer,
  startIso: string,
  endIso: string,
): Promise<{
  total_install_completed: number;
  solar: number;
  battery_only: number;
  roof: number;
  hvac: number;
  multi_product: number;
  uncategorized: number;
  // Bonus: rows with PTO Received Date in range, in case Jobflo's count
  // is anchored on PTO rather than Install Completed.
  total_pto_received: number;
  sample: Array<{ id: string; fullName: string; org: string; installDate: string; isSolar: string; classification: string[] }>;
}> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames.includes('Customers') ? 'Customers' : wb.SheetNames[0];
  if (!sheetName) {
    return {
      total_install_completed: 0, solar: 0, battery_only: 0, roof: 0, hvac: 0,
      multi_product: 0, uncategorized: 0, total_pto_received: 0, sample: [],
    };
  }
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (rows.length < 2) {
    return {
      total_install_completed: 0, solar: 0, battery_only: 0, roof: 0, hvac: 0,
      multi_product: 0, uncategorized: 0, total_pto_received: 0, sample: [],
    };
  }
  const header = rows[0].map(cleanHeader);
  const cols = {
    rep:           indexFor(header, 'rep'),
    branch:        indexFor(header, 'branch'),
    saleDate:      indexFor(header, 'saleDate'),
    installDate:   indexFor(header, 'installDate'),
    status:        indexFor(header, 'status'),
    isSolar:       indexFor(header, 'isSolar'),
    roofScheduled: indexFor(header, 'roofScheduled'),
    roofCompleted: indexFor(header, 'roofCompleted'),
    customerId:    indexFor(header, 'customerId'),
    organization:  indexFor(header, 'organization'),
    source:        indexFor(header, 'source'),
    fundingPartner: indexFor(header, 'fundingPartner'),
    soldSystemSize: indexFor(header, 'soldSystemSize'),
    battery:        indexFor(header, 'battery'),
    fullName:       header.findIndex((h) => h === 'full name'),
    ptoReceived:    header.findIndex((h) => h === 'pto received date'),
  };

  const retrofitClients = buildBatteryRetrofitMap(wb);
  const hvacClients = buildHvacCustomerMap(wb);

  let total = 0;
  let solarCount = 0;
  let batteryOnlyCount = 0;
  let roofCount = 0;
  let hvacCount = 0;
  let multi = 0;
  let uncategorized = 0;
  let ptoTotal = 0;
  const sample: Array<{ id: string; fullName: string; org: string; installDate: string; isSolar: string; classification: string[] }> = [];

  for (const r of rows.slice(1)) {
    if (!r.some((c) => c !== '' && c != null)) continue;
    const installDate = cols.installDate >= 0 ? parseDateLike(r[cols.installDate]) : null;
    if (installDate) {
      const installIso = isoDate(installDate);
      if (installIso >= startIso && installIso <= endIso) {
        total++;

        const customerId = cols.customerId >= 0 ? String(r[cols.customerId] ?? '') : '';
        const isSolarFlag = isSolarRow(r, cols.isSolar);
        const roof = isRoofRow(r, cols);
        const fundingPartner = cols.fundingPartner >= 0
          ? String(r[cols.fundingPartner] ?? '').trim().toLowerCase()
          : '';
        const soldSizeRaw = cols.soldSystemSize >= 0 ? r[cols.soldSystemSize] : '';
        const soldSize = soldSizeRaw === '' || soldSizeRaw == null ? 0 : Number(soldSizeRaw);
        const batteryEquipment = cols.battery >= 0 ? String(r[cols.battery] ?? '').trim() : '';
        const isParticipateRetrofit =
          fundingPartner === 'participate energy'
          && soldSize === 0
          && batteryEquipment.length > 0;
        const batteryOnly = isParticipateRetrofit
          || (!!customerId && retrofitClients.has(customerId));
        const isSolarByFinancing =
          !isSolarFlag
          && fundingPartner !== 'participate energy'
          && SOLAR_FUNDING_PARTNERS.has(fundingPartner);
        const solar = (isSolarFlag || isSolarByFinancing) && !batteryOnly;
        const hvac = !!customerId && hvacClients.has(customerId);

        const tags: string[] = [];
        if (solar) tags.push('solar');
        if (roof) tags.push('roof');
        if (batteryOnly) tags.push('battery_only');
        if (hvac) tags.push('hvac');

        if (solar) solarCount++;
        if (batteryOnly) batteryOnlyCount++;
        if (roof) roofCount++;
        if (hvac) hvacCount++;
        if (tags.length > 1) multi++;
        if (tags.length === 0) uncategorized++;

        if (sample.length < 25) {
          sample.push({
            id: customerId,
            fullName: cols.fullName >= 0 ? String(r[cols.fullName] ?? '') : '',
            org: cols.organization >= 0 ? String(r[cols.organization] ?? '') : '',
            installDate: installIso,
            isSolar: cols.isSolar >= 0 ? String(r[cols.isSolar] ?? '') : '',
            classification: tags.length ? tags : ['UNCATEGORIZED'],
          });
        }
      }
    }
    const pto = cols.ptoReceived >= 0 ? parseDateLike(r[cols.ptoReceived]) : null;
    if (pto) {
      const ptoIso = isoDate(pto);
      if (ptoIso >= startIso && ptoIso <= endIso) ptoTotal++;
    }
  }

  return {
    total_install_completed: total,
    solar: solarCount,
    battery_only: batteryOnlyCount,
    roof: roofCount,
    hvac: hvacCount,
    multi_product: multi,
    uncategorized,
    total_pto_received: ptoTotal,
    sample,
  };
}

export async function findUnattributedRows(
  buffer: ArrayBuffer,
  startIso: string,
  endIso: string,
): Promise<UnattributedDiagnosticRow[]> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames.includes('Customers') ? 'Customers' : wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (rows.length < 2) return [];

  const header = rows[0].map(cleanHeader);
  const cols = {
    rep:           indexFor(header, 'rep'),
    branch:        indexFor(header, 'branch'),
    saleDate:      indexFor(header, 'saleDate'),
    status:        indexFor(header, 'status'),
    isSolar:       indexFor(header, 'isSolar'),
    roofScheduled: indexFor(header, 'roofScheduled'),
    roofCompleted: indexFor(header, 'roofCompleted'),
    customerId:    indexFor(header, 'customerId'),
    organization:  indexFor(header, 'organization'),
    source:        indexFor(header, 'source'),
    fundingPartner: indexFor(header, 'fundingPartner'),
    soldSystemSize: indexFor(header, 'soldSystemSize'),
    battery:        indexFor(header, 'battery'),
    fullName:       header.findIndex((h) => h === 'full name'),
  };

  const retrofitClients = buildBatteryRetrofitMap(wb);
  const hvacClients = buildHvacCustomerMap(wb);

  const out: UnattributedDiagnosticRow[] = [];
  for (const r of rows.slice(1)) {
    if (!r.some((c) => c !== '' && c != null)) continue;
    const sale = cols.saleDate >= 0 ? parseDateLike(r[cols.saleDate]) : null;
    if (!sale) continue;
    const saleIso = isoDate(sale);
    if (saleIso < startIso || saleIso > endIso) continue;

    const customerId = cols.customerId >= 0 ? String(r[cols.customerId] ?? '') : '';
    const isSolarFlag = isSolarRow(r, cols.isSolar);
    const roof = isRoofRow(r, cols);
    const fundingPartner = cols.fundingPartner >= 0
      ? String(r[cols.fundingPartner] ?? '').trim().toLowerCase()
      : '';
    const soldSizeRaw = cols.soldSystemSize >= 0 ? r[cols.soldSystemSize] : '';
    const soldSize = soldSizeRaw === '' || soldSizeRaw == null ? 0 : Number(soldSizeRaw);
    const batteryEquipment = cols.battery >= 0 ? String(r[cols.battery] ?? '').trim() : '';
    const isParticipateRetrofit =
      fundingPartner === 'participate energy'
      && soldSize === 0
      && batteryEquipment.length > 0;
    const batteryOnly = isParticipateRetrofit
      || (!!customerId && retrofitClients.has(customerId));
    const solar = isSolarFlag && !batteryOnly;
    const internal = isInternalRow(r, cols.organization);
    const dealer = isDealerRow(r, cols);
    const hvac = !!customerId && hvacClients.has(customerId);

    const kinds = (solar ? 1 : 0) + (roof ? 1 : 0) + (batteryOnly ? 1 : 0) + (hvac ? 1 : 0);
    // We want rows that are NOT unclassified (so they're in the parser's
    // total counts) AND have no product flag (so they're invisible to
    // the 4-product sum).
    if (kinds > 0) continue;
    if (!internal && !dealer) continue;

    out.push({
      customerId,
      fullName: cols.fullName >= 0 ? String(r[cols.fullName] ?? '') : '',
      organization: cols.organization >= 0 ? String(r[cols.organization] ?? '') : '',
      fundingPartner: cols.fundingPartner >= 0 ? String(r[cols.fundingPartner] ?? '') : '',
      rep: cols.rep >= 0 ? String(r[cols.rep] ?? '') : '',
      branch: cols.branch >= 0 ? String(r[cols.branch] ?? '').trim() || null : null,
      source: cols.source >= 0 ? String(r[cols.source] ?? '') : '',
      saleDate: saleIso,
      isSolarRaw: cols.isSolar >= 0 ? String(r[cols.isSolar] ?? '') : '',
      status: cols.status >= 0 ? String(r[cols.status] ?? '') : '',
      internal,
      dealer,
    });
  }
  return out;
}
