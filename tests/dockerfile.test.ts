/**
 * Static regression tests for the Dockerfile.
 *
 * The PDF-worker fix (commit ad20871) introduced a `postinstall` hook that
 * needs `scripts/sync-pdf-worker.js`. The previous Dockerfile ran `npm ci`
 * BEFORE copying scripts/, so the build silently broke. This test guards
 * against that whole class of regression: it parses the Dockerfile and
 * pins down the structure so future edits can't reintroduce the bug.
 *
 * What we assert:
 *   1) `npm ci` in the deps stage uses `--ignore-scripts`     (avoids the
 *      "Cannot find module scripts/sync-pdf-worker.js" failure).
 *   2) `node scripts/sync-pdf-worker.js` runs in the builder stage AFTER
 *      `COPY . .`                                              (so the public
 *      worker file always matches the installed pdfjs-dist version).
 *   3) The image copies `public/` and `.next/` from the builder so the
 *      worker is actually shipped.
 *   4) The container runs as a non-root user.
 *   5) `package.json` declares the postinstall hook + the sync-pdf-worker
 *      script that the Dockerfile relies on.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DOCKERFILE = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SYNC_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-pdf-worker.js'), 'utf8');

describe('Dockerfile — PDF worker build correctness', () => {
  it('deps stage runs `npm ci --ignore-scripts`', () => {
    // Without --ignore-scripts the postinstall hook fires before scripts/ is
    // copied → build crashes with "Cannot find module scripts/sync-pdf-worker.js".
    expect(DOCKERFILE).toMatch(/npm ci\s+--ignore-scripts/);
  });

  it('builder stage explicitly runs the worker sync after COPY . .', () => {
    // The COPY-then-sync ordering is what makes the build reproducible: the
    // host's potentially-stale public/pdf.worker.min.mjs is overwritten with
    // the worker that matches the installed pdfjs-dist version inside the image.
    const builderStart = DOCKERFILE.indexOf('AS builder');
    expect(builderStart).toBeGreaterThan(-1);
    const builderBlock = DOCKERFILE.slice(builderStart);
    const copyAt = builderBlock.indexOf('COPY . .');
    const syncAt = builderBlock.indexOf('node scripts/sync-pdf-worker.js');
    expect(copyAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(copyAt);
  });

  it('builder npm prune also uses --ignore-scripts', () => {
    // `npm prune` would otherwise re-run lifecycle scripts on the pruned tree.
    expect(DOCKERFILE).toMatch(/npm prune\s+--omit=dev\s+--ignore-scripts/);
  });

  it('runner stage copies public/ from the builder', () => {
    expect(DOCKERFILE).toMatch(/COPY --from=builder \/app\/public\s+\.\/public/);
  });

  it('runner stage copies .next/ from the builder', () => {
    expect(DOCKERFILE).toMatch(/COPY --from=builder \/app\/\.next\s+\.\/\.next/);
  });

  it('container runs as a non-root user (USER nextjs)', () => {
    expect(DOCKERFILE).toMatch(/^USER nextjs/m);
    // and the user is explicitly created in the image
    expect(DOCKERFILE).toMatch(/useradd\s+--system\s+--uid 1001/);
  });
});

describe('package.json — sync-pdf-worker script wiring', () => {
  it('declares the postinstall hook calling the sync script', () => {
    expect(PACKAGE.scripts.postinstall).toBeDefined();
    expect(PACKAGE.scripts.postinstall).toContain('scripts/sync-pdf-worker.js');
  });

  it('declares an explicit `sync-pdf-worker` script (so dev / Docker can call it)', () => {
    expect(PACKAGE.scripts['sync-pdf-worker']).toBeDefined();
    expect(PACKAGE.scripts['sync-pdf-worker']).toContain('scripts/sync-pdf-worker.js');
  });

  it('has pdfjs-dist as a dependency (the worker source)', () => {
    expect(PACKAGE.dependencies['pdfjs-dist'] || PACKAGE.devDependencies?.['pdfjs-dist']).toBeDefined();
  });
});

describe('scripts/sync-pdf-worker.js — fail-soft contract', () => {
  it('does NOT fail the install when pdfjs-dist is missing', () => {
    // Otherwise an in-progress `npm ci` would abort if the postinstall hook
    // ran in the wrong order. We rely on the script exit-0'ing.
    expect(SYNC_SCRIPT).toMatch(/process\.exit\(0\)/);
    expect(SYNC_SCRIPT).toMatch(/fs\.existsSync\(SOURCE\)/);
  });

  it('targets public/pdf.worker.min.mjs (the URL the viewer references)', () => {
    expect(SYNC_SCRIPT).toContain("'public', 'pdf.worker.min.mjs'");
  });

  it('reads from node_modules/pdfjs-dist/build/pdf.worker.min.mjs', () => {
    expect(SYNC_SCRIPT).toContain("'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'");
  });
});
