/* eslint-disable no-console */
/**
 * Sync the PDF.js worker file from node_modules into public/.
 *
 * The PdfCanvasViewer loads `pdfjs-dist` as a JS API and points its worker at
 * `/pdf.worker.min.mjs` (a static file in /public). PDF.js REFUSES to load any
 * document if the API version and the worker version don't match exactly — the
 * symptom is "فشل التحميل" / "Failed to load file" for every PDF.
 *
 * Bundlers (Next.js / webpack / turbopack) don't auto-copy the worker, so this
 * script runs as a `postinstall` hook to keep the file in sync with whatever
 * `pdfjs-dist` version is currently installed.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const DEST   = path.resolve(__dirname, '..', 'public', 'pdf.worker.min.mjs');

try {
  if (!fs.existsSync(SOURCE)) {
    // pdfjs-dist not installed yet — likely running before deps; skip silently.
    process.exit(0);
  }
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.copyFileSync(SOURCE, DEST);
  const pkgPath = path.resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'package.json');
  let version = 'unknown';
  try {
    version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  } catch {
    /* version is best-effort */
  }
  console.log(`[sync-pdf-worker] copied pdfjs-dist@${version} worker → public/pdf.worker.min.mjs`);
} catch (err) {
  console.error('[sync-pdf-worker] failed:', err.message);
  // Do NOT fail the install — most CI flows still want to continue.
  process.exit(0);
}
