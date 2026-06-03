/**
 * Benchmark: time the on-the-fly PDF watermark step.
 *
 * Usage: npx tsx scripts/bench-watermark.mjs <pdf-path>
 */
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { watermarkPdf } from '../src/lib/pdf-watermark.ts';

const arg = process.argv[2];
if (!arg) { console.error('Usage: npx tsx scripts/bench-watermark.mjs <pdf-path>'); process.exit(1); }
const file = path.resolve(arg);
const bytes = fs.readFileSync(file);
const sizeMB = (bytes.byteLength / 1024 / 1024).toFixed(2);

console.log(`File: ${file}`);
console.log(`Size: ${sizeMB} MB`);

// warm-up
await watermarkPdf(bytes, 'student@example.com', '1.2.3.4 · 2026-06-03 18:00:00Z');

const N = 3;
let total = 0;
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const out = await watermarkPdf(bytes, 'student@example.com', '1.2.3.4 · 2026-06-03 18:00:00Z');
  const dt = performance.now() - t0;
  total += dt;
  console.log(`  run #${i + 1}: ${dt.toFixed(1)} ms  (out: ${(out.byteLength / 1024 / 1024).toFixed(2)} MB)`);
}
console.log(`Avg: ${(total / N).toFixed(1)} ms over ${N} runs`);
