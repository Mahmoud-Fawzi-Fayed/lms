#!/usr/bin/env node
/**
 * Scan frontend pages/components for hardcoded Arabic strings
 * that are NOT wrapped in t('ar', 'en') or already translated.
 *
 * Heuristic: line contains Arabic chars AND is not inside a t() call,
 * not inside a comment, and not in a string already paired with English.
 *
 * Output: list of files + per-file untranslated occurrences count.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOTS = ['src/app', 'src/components'];
const SKIP = new Set(['api']); // API routes don't need translation

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP.has(entry)) continue;
      walk(full, files);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const ARABIC = /[\u0600-\u06FF]/;

const report = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const raw = readFileSync(file, 'utf8');
    const lines = raw.split('\n');
    const offenders = [];
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!ARABIC.test(line)) continue;
      const trimmed = line.trim();
      // Skip pure comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) inBlockComment = false;
        continue;
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) inBlockComment = true;
        continue;
      }
      if (trimmed.startsWith('//')) continue;
      // Already translated: line contains t('...', '...') with arabic in the FIRST arg
      // Simple heuristic — if line contains `t(` AND the english arg is non-empty
      const tCalls = line.match(/\bt\(\s*['"`][^'"`]*['"`]\s*,\s*['"`][^'"`]*['"`]\s*\)/g);
      if (tCalls && tCalls.length > 0) {
        // Remove the t(...) substrings and see if any arabic remains
        let stripped = line;
        for (const c of tCalls) stripped = stripped.replace(c, '');
        if (!ARABIC.test(stripped)) continue;
      }
      // Skip if Arabic is inside an aria-label/title/placeholder for a *visual* dir hint? no — flag it.
      // Flag this line
      offenders.push({ lineNum: i + 1, text: trimmed.slice(0, 140) });
    }
    if (offenders.length > 0) {
      report.push({ file, count: offenders.length, offenders });
    }
  }
}

// Print ranked report
report.sort((a, b) => b.count - a.count);
let total = 0;
for (const r of report) {
  total += r.count;
  console.log(`\n${r.file} — ${r.count} untranslated`);
  for (const o of r.offenders.slice(0, 5)) {
    console.log(`  L${o.lineNum}: ${o.text}`);
  }
  if (r.offenders.length > 5) console.log(`  ... +${r.offenders.length - 5} more`);
}
console.log(`\n=== TOTAL: ${total} untranslated occurrences across ${report.length} files ===`);
