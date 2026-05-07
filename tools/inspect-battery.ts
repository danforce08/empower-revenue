// Hunt for battery-only / retrofit signals across Customers + Cases + Adders.
//   npx tsx tools/inspect-battery.ts /path/to/customers.xlsx
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';

function tally(rows: unknown[][], col: number): [string, number][] {
  const m = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const v = String(rows[i]?.[col] ?? '').trim();
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx tools/inspect-battery.ts <file>');
    process.exit(1);
  }
  const buffer = fs.readFileSync(filePath);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const wb = XLSX.read(ab, { type: 'array' });

  // -------------------- Cases --------------------
  const cases = wb.Sheets['Cases'];
  const caseRows: unknown[][] = XLSX.utils.sheet_to_json(cases, { header: 1, raw: true, defval: '' });
  const caseHeader = (caseRows[0] as string[]).map((h) => String(h ?? '').toLowerCase());
  const idxName     = caseHeader.findIndex((h) => h === 'name');
  const idxClient   = caseHeader.findIndex((h) => h === 'client id');
  const idxStatus   = caseHeader.findIndex((h) => h === 'current status');
  const idxComplete = caseHeader.findIndex((h) => h === 'completed at');

  console.log('═══ CASES — Name distribution (top 60) ═══');
  tally(caseRows, idxName).slice(0, 60).forEach(([k, n]) => console.log(' ', n.toString().padStart(5), k));

  console.log('\n═══ Battery- or Retrofit-related Cases (Name contains "battery" or "retrofit") ═══');
  const matchingCases = new Map<string, Set<string>>();   // clientId → set of case names
  const completeBatteryByClient = new Set<string>();
  let total = 0, completed = 0;
  for (let i = 1; i < caseRows.length; i++) {
    const name = String(caseRows[i]?.[idxName] ?? '').toLowerCase();
    if (!name) continue;
    if (!/battery|retrofit|storage/.test(name)) continue;
    total++;
    const clientId = String(caseRows[i]?.[idxClient] ?? '');
    const completedAt = String(caseRows[i]?.[idxComplete] ?? '');
    const status = String(caseRows[i]?.[idxStatus] ?? '').toLowerCase();
    const set = matchingCases.get(clientId) ?? new Set();
    set.add(String(caseRows[i]?.[idxName] ?? ''));
    matchingCases.set(clientId, set);
    if (completedAt || status === 'complete' || status === 'completed') {
      completed++;
      completeBatteryByClient.add(clientId);
    }
  }
  console.log('  Battery/Retrofit/Storage Cases total :', total);
  console.log('  …completed                            :', completed);
  console.log('  Unique clients with such a case       :', matchingCases.size);
  console.log('  Unique clients with COMPLETED battery :', completeBatteryByClient.size);

  console.log('\n  Top case-name buckets (battery/retrofit/storage):');
  const bucket = new Map<string, number>();
  for (let i = 1; i < caseRows.length; i++) {
    const name = String(caseRows[i]?.[idxName] ?? '');
    if (!/battery|retrofit|storage/i.test(name)) continue;
    bucket.set(name, (bucket.get(name) ?? 0) + 1);
  }
  Array.from(bucket.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('   ', n.toString().padStart(5), k));

  // -------------------- Cross-reference with Customers --------------------
  const customers = wb.Sheets['Customers'];
  const custRows: unknown[][] = XLSX.utils.sheet_to_json(customers, { header: 1, raw: true, defval: '' });
  const custHeader = (custRows[0] as string[]).map((h) => String(h ?? '').toLowerCase());
  const idxCustId      = custHeader.findIndex((h) => h === 'id');
  const idxIsSolar     = custHeader.findIndex((h) => h === 'is solar');
  const idxConvAt      = custHeader.findIndex((h) => h === 'conversion at');
  const idxBranch      = custHeader.findIndex((h) => h === 'branch');
  const idxOrg         = custHeader.findIndex((h) => h === 'organization');
  const idxStatusCust  = custHeader.findIndex((h) => h === 'project status');

  console.log('\n═══ Customers WITH a battery/retrofit case ═══');
  let solarYes = 0, solarNo = 0, solarBlank = 0;
  const batterySoldByOrg = new Map<string, number>();
  const batterySoldByBranch = new Map<string, number>();
  const batteryOnlyClients: string[] = [];
  for (let i = 1; i < custRows.length; i++) {
    const id = String(custRows[i]?.[idxCustId] ?? '');
    if (!matchingCases.has(id)) continue;
    const isSolarRaw = String(custRows[i]?.[idxIsSolar] ?? '').toLowerCase();
    const isSolar = isSolarRaw === 'true' || isSolarRaw === '1';
    if (isSolar) solarYes++;
    else if (isSolarRaw === 'false' || isSolarRaw === '0') solarNo++;
    else solarBlank++;
    if (!isSolar) batteryOnlyClients.push(id);
    const org = String(custRows[i]?.[idxOrg] ?? '').trim() || '(unknown)';
    const br  = String(custRows[i]?.[idxBranch] ?? '').trim() || '(none)';
    batterySoldByOrg.set(org, (batterySoldByOrg.get(org) ?? 0) + 1);
    batterySoldByBranch.set(br, (batterySoldByBranch.get(br) ?? 0) + 1);
  }
  console.log('  Customers with battery case + Is Solar TRUE  :', solarYes);
  console.log('  Customers with battery case + Is Solar FALSE :', solarNo);
  console.log('  Customers with battery case + Is Solar blank :', solarBlank);
  console.log('  → Battery-only candidates (no solar)         :', batteryOnlyClients.length);

  console.log('\n  Battery-case customers by Organization:');
  Array.from(batterySoldByOrg.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, n]) => console.log('   ', n.toString().padStart(5), k));
  console.log('\n  Battery-case customers by Branch:');
  Array.from(batterySoldByBranch.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('   ', n.toString().padStart(5), k));

  // Weekly bucket of battery-only customers by Conversion At
  console.log('\n  Battery-only customers, weekly by Conversion At:');
  const byWeek = new Map<string, number>();
  for (const id of batteryOnlyClients) {
    const idx = custRows.findIndex((r, i) => i > 0 && String(r?.[idxCustId] ?? '') === id);
    if (idx < 0) continue;
    const convAt = String(custRows[idx]?.[idxConvAt] ?? '');
    if (!convAt) continue;
    const date = new Date(convAt);
    if (Number.isNaN(+date)) continue;
    // Monday-based week start
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const wk = new Date(date);
    wk.setDate(wk.getDate() + diff);
    const wkIso = wk.toISOString().slice(0, 10);
    byWeek.set(wkIso, (byWeek.get(wkIso) ?? 0) + 1);
  }
  Array.from(byWeek.entries()).sort().forEach(([wk, n]) => console.log('   ', wk, '·', n));
}

main().catch((e) => { console.error(e); process.exit(1); });
