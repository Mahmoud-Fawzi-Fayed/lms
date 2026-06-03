/**
 * Regression test — the static PDF.js worker in /public/pdf.worker.min.mjs
 * MUST match the worker shipped by the currently-installed pdfjs-dist.
 *
 * If they drift, PDF.js refuses to load any document and the user sees
 * "فشل التحميل" / "Failed to load file" with no explanation. The fix is to
 * run `npm run sync-pdf-worker` (the `postinstall` hook does this automatically).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(__dirname, '..');
const PUB_WORKER = path.join(ROOT, 'public', 'pdf.worker.min.mjs');
const PKG_WORKER = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');

function md5(filePath: string): string {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

describe('PDF.js worker is in sync with pdfjs-dist', () => {
  it('public/pdf.worker.min.mjs exists', () => {
    expect(fs.existsSync(PUB_WORKER)).toBe(true);
  });

  it('node_modules/pdfjs-dist worker exists (deps installed)', () => {
    expect(fs.existsSync(PKG_WORKER)).toBe(true);
  });

  it('CRITICAL: public worker md5 matches the installed pdfjs-dist worker', () => {
    // If this fails, run `npm run sync-pdf-worker` (or `npm install` — the
    // postinstall hook does the same). PDF.js will not render documents at
    // all when the API and worker versions disagree.
    expect(md5(PUB_WORKER)).toBe(md5(PKG_WORKER));
  });

  it('public worker is a non-empty JavaScript module', () => {
    const stat = fs.statSync(PUB_WORKER);
    expect(stat.size).toBeGreaterThan(100_000); // worker is ~1 MiB
    const head = fs.readFileSync(PUB_WORKER, 'utf8').slice(0, 50);
    // Mozilla license header or webpack/JS module preamble
    expect(head).toMatch(/[a-zA-Z*\/\s]/);
  });
});
