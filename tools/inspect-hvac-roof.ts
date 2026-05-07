// Investigate HVAC + Roofing signals in a Jobflo customer-export file.
//   npx tsx tools/inspect-hvac-roof.ts /path/to/customers.xlsx
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

function colIdx(header: string[], name: string): number {
  return header.findIndex((h) => h === name.toLowerCase());
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx tools/inspect-hvac-roof.ts <file>');
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const wb = XLSX.read(ab, { type: 'array' });

  console.log('==================================================');
  console.log('SHEETS:', wb.SheetNames);
  console.log('==================================================\n');

  // -------------------- Customers sheet --------------------
  const customers = wb.Sheets['Customers'];
  if (customers) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(customers, { header: 1, raw: true, defval: '' });
    const header = (rows[0] as string[]).map((h) => String(h ?? '').toLowerCase());

    console.log('═══ CUSTOMERS sheet ═══');
    console.log('Total rows:', rows.length - 1);

    // Roof-specific columns
    const roofCols = header
      .map((h, i) => ({ h, i }))
      .filter((x) => /roof/i.test(x.h));
    console.log('\nRoof-related columns:', roofCols.map((c) => c.h));

    // HVAC-specific columns
    const hvacCols = header
      .map((h, i) => ({ h, i }))
      .filter((x) => /hvac|service|maint|appliance/i.test(x.h));
    console.log('HVAC-/service-related columns:', hvacCols.map((c) => c.h));

    const idxIsSolar = colIdx(header, 'is solar');
    if (idxIsSolar >= 0) {
      console.log('\n--- Is Solar distribution ---');
      tally(rows, idxIsSolar).forEach(([k, n]) => console.log(' ', n.toString().padStart(5), k));
    }

    const idxStatus = colIdx(header, 'project status');
    console.log('\n--- Project Status (full distribution) ---');
    tally(rows, idxStatus).forEach(([k, n]) => console.log(' ', n.toString().padStart(5), k));

    const idxOrg = colIdx(header, 'organization');
    const idxRoofComplete = colIdx(header, 'roof install completed date');
    const idxRoofScheduled = colIdx(header, 'roof install scheduled date');

    // Count rows where roof-install fields are populated
    if (idxRoofComplete >= 0 || idxRoofScheduled >= 0) {
      let roofCompleted = 0;
      let roofScheduled = 0;
      let bothSolarAndRoof = 0;
      let roofOnly = 0;
      const roofByOrg = new Map<string, number>();
      const roofByBranch = new Map<string, number>();
      const idxBranch = colIdx(header, 'branch');

      for (let i = 1; i < rows.length; i++) {
        const isSolar = String(rows[i]?.[idxIsSolar] ?? '').toLowerCase();
        const roofC = String(rows[i]?.[idxRoofComplete] ?? '').trim();
        const roofS = String(rows[i]?.[idxRoofScheduled] ?? '').trim();
        if (roofC) roofCompleted++;
        if (roofS) roofScheduled++;
        const hasRoof = !!(roofC || roofS);
        if (hasRoof) {
          if (isSolar === 'true' || isSolar === '1') bothSolarAndRoof++;
          else roofOnly++;
          const org = String(rows[i]?.[idxOrg] ?? '').trim() || '(unknown)';
          roofByOrg.set(org, (roofByOrg.get(org) ?? 0) + 1);
          const br = String(rows[i]?.[idxBranch] ?? '').trim() || '(none)';
          roofByBranch.set(br, (roofByBranch.get(br) ?? 0) + 1);
        }
      }
      console.log('\n--- ROOF SIGNAL counts ---');
      console.log('  rows with Roof Install Completed Date  :', roofCompleted);
      console.log('  rows with Roof Install Scheduled Date  :', roofScheduled);
      console.log('  Solar+Roof (attached install)          :', bothSolarAndRoof);
      console.log('  Roof-only (no solar)                   :', roofOnly);

      console.log('\n  Roof rows by organization:');
      Array.from(roofByOrg.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([k, n]) => console.log('   ', n.toString().padStart(5), k));

      console.log('\n  Roof rows by branch:');
      Array.from(roofByBranch.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([k, n]) => console.log('   ', n.toString().padStart(5), k));
    }
  }

  // -------------------- Adders sheet --------------------
  const adders = wb.Sheets['Adders'];
  if (adders) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(adders, { header: 1, raw: true, defval: '' });
    console.log('\n\n═══ ADDERS sheet ═══');
    console.log('Total rows:', rows.length - 1);
    if (rows.length > 0) {
      console.log('Headers:', rows[0]);
      console.log('Sample row:', rows[1]);
      console.log('Sample row 50:', rows[50] ?? '(n/a)');
    }
    // The "Adders" sheet typically shows extras attached to a sale —
    // batteries, MPU, roofing, HVAC could appear here.
    const header = (rows[0] as string[]).map((h) => String(h ?? '').toLowerCase());
    const nameCols = header.map((h, i) => ({ h, i })).filter((x) => /name|type|category|product|description/.test(x.h));
    if (nameCols.length > 0) {
      console.log('\nAdder type/name distribution (top 30):');
      nameCols.forEach((nc) => {
        console.log(`  Column "${nc.h}":`);
        tally(rows, nc.i).slice(0, 30).forEach(([k, n]) => console.log('   ', n.toString().padStart(5), k));
      });
    }
  }

  // -------------------- Cases sheet --------------------
  const cases = wb.Sheets['Cases'];
  if (cases) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(cases, { header: 1, raw: true, defval: '' });
    console.log('\n\n═══ CASES sheet ═══');
    console.log('Total rows:', rows.length - 1);
    if (rows.length > 0) {
      console.log('Headers:', rows[0]);
      console.log('Sample row:', rows[1]);
    }
    const header = (rows[0] as string[]).map((h) => String(h ?? '').toLowerCase());
    const typeCols = header.map((h, i) => ({ h, i })).filter((x) => /type|category|subject|title|case|status/.test(x.h));
    typeCols.forEach((nc) => {
      console.log(`\n  Column "${nc.h}" (top 30):`);
      tally(rows, nc.i).slice(0, 30).forEach(([k, n]) => console.log('   ', n.toString().padStart(5), k));
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
