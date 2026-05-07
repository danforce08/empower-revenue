// Run the Jobflo parser against a real file and report what it sees.
//   npx tsx tools/inspect-jobflo.ts /path/to/customers.xlsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseJobfloFile } from '../lib/jobflo-parser';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx tools/inspect-jobflo.ts <file>');
    process.exit(1);
  }
  const buffer = fs.readFileSync(filePath);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  const parsed = await parseJobfloFile(ab, path.basename(filePath));

  console.log('---- PARSER OUTPUT ----');
  console.log('fileName:       ', parsed.fileName);
  console.log('rowCount:       ', parsed.rowCount);
  console.log('dateRange:      ', parsed.dateMin, '→', parsed.dateMax);
  console.log('warnings:       ', parsed.warnings);
  console.log('branchesSeen:   ', parsed.branchesSeen);
  console.log('buckets total:  ', parsed.buckets.length);
  console.log('classified:     ', parsed.classified);

  // Per-channel weekly totals (metrics keys differ per channel)
  const channels = new Set(parsed.buckets.map((b) => b.channelKey));
  for (const ch of channels) {
    console.log(`\n---- ${ch.toUpperCase()} weekly totals ----`);
    const byWeek = new Map<string, { metrics: Record<string, number>; branches: Set<string> }>();
    for (const b of parsed.buckets) {
      if (b.channelKey !== ch) continue;
      const cur = byWeek.get(b.weekStart) ?? { metrics: {}, branches: new Set() };
      for (const [k, v] of Object.entries(b.metrics)) {
        if (typeof v !== 'number') continue;
        cur.metrics[k] = (cur.metrics[k] ?? 0) + v;
      }
      if (b.branch) cur.branches.add(b.branch);
      byWeek.set(b.weekStart, cur);
    }
    Array.from(byWeek.entries()).sort().forEach(([wk, v]) => {
      const summary = Object.entries(v.metrics)
        .map(([k, n]) => `${k}=${n}`)
        .join(', ');
      console.log(' ', wk, '·', summary, '·', Array.from(v.branches).join(','));
    });
    const totals: Record<string, number> = {};
    for (const b of parsed.buckets) {
      if (b.channelKey !== ch) continue;
      for (const [k, v] of Object.entries(b.metrics)) {
        if (typeof v !== 'number') continue;
        totals[k] = (totals[k] ?? 0) + v;
      }
    }
    console.log(`  ${ch} totals:`, totals);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
