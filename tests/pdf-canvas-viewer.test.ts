/**
 * Static behaviour-pinning tests for src/components/PdfCanvasViewer.tsx.
 *
 * The viewer is a complex React + Canvas + Web-Worker component whose full
 * runtime is hard to exercise from Vitest (it needs a real DOM, a worker
 * channel, and a parseable PDF the size of which would slow the suite).
 * Instead these tests pin down the *contracts* the viewer must keep, so a
 * future refactor can't silently regress the bug fixes:
 *
 *   - workerSrc must include a version query string (cache-busts after a
 *     pdfjs-dist upgrade).
 *   - The fetch to the protected content API must send X-Content-Request: '1'
 *     (the API rejects the request without it).
 *   - The fetch must explicitly set credentials: 'include' (otherwise the
 *     session cookie is dropped on cross-subdomain deploys).
 *   - mode: 'cors' + cache: 'no-store' are both pinned (Sec-Fetch-* gating
 *     in the API requires deterministic Sec-Fetch headers).
 *   - The viewer probes Range support before deciding whether to use
 *     progressive streaming vs full-buffer mode (the perf fix).
 *   - The Content-Type response header is validated to be application/pdf
 *     (otherwise PDF.js shows an opaque "InvalidPDFException").
 *   - When falling back to full-buffer mode, disableAutoFetch + disableStream
 *     are both true; when streaming, both are false.
 *   - X-Content-Request is forwarded via httpHeaders so PDF.js's internal
 *     Range fetches still pass the API's request-header check.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'components', 'PdfCanvasViewer.tsx'),
  'utf8',
);

describe('PdfCanvasViewer — worker URL', () => {
  it('workerSrc includes a version query string', () => {
    // /pdf.worker.min.mjs?v=<pdfjs version>  → a stale CDN/edge cache that
    // serves the previous worker is bypassed automatically on upgrade.
    expect(SOURCE).toMatch(/\/pdf\.worker\.min\.mjs\?v=/);
    expect(SOURCE).toMatch(/pdfjsLib[^)]*\)\s*\.version/);
  });

  it('points at the static /public path (NOT a CDN)', () => {
    // Loading the worker from a CDN diverges from the API the bundle was
    // built against — the very mismatch we hit in production.
    expect(SOURCE).toContain('/pdf.worker.min.mjs');
    expect(SOURCE).not.toMatch(/cdnjs\.cloudflare\.com.*pdf\.worker/);
    expect(SOURCE).not.toMatch(/unpkg\.com.*pdf\.worker/);
  });
});

describe('PdfCanvasViewer — protected fetch contract', () => {
  it("sends X-Content-Request: '1' on the probe request", () => {
    expect(SOURCE).toMatch(/'X-Content-Request':\s*'1'/);
  });

  it("uses credentials: 'include' (session cookie required)", () => {
    expect(SOURCE).toMatch(/credentials:\s*'include'/);
  });

  it("pins mode: 'cors' and cache: 'no-store'", () => {
    expect(SOURCE).toMatch(/mode:\s*'cors'/);
    expect(SOURCE).toMatch(/cache:\s*'no-store'/);
  });

  it('verifies the response content-type is application/pdf', () => {
    expect(SOURCE).toMatch(/content-type/i);
    expect(SOURCE).toMatch(/application\/pdf/);
    // and surfaces a clearer error than the opaque InvalidPDFException.
    expect(SOURCE).toMatch(/not a PDF response/);
  });
});

describe('PdfCanvasViewer — progressive streaming logic', () => {
  it('issues a 1-byte Range probe before deciding the load mode', () => {
    expect(SOURCE).toMatch(/Range:\s*'bytes=0-0'/);
  });

  it('uses URL mode (PDF.js streams) when the server returns 206', () => {
    expect(SOURCE).toMatch(/probe\.status\s*===\s*206/);
  });

  it('forwards X-Content-Request via httpHeaders for PDF.js range fetches', () => {
    // Without this, pdf.js's internal Range fetches would lack our custom
    // header and the content API would reject them.
    expect(SOURCE).toMatch(/httpHeaders:\s*\{[^}]*'X-Content-Request':\s*'1'/);
  });

  it('disables autoFetch + stream only when serving from in-memory buffer', () => {
    // When useRange === true → both flags FALSE (let PDF.js stream).
    // When useRange === false → both flags TRUE (we already have all bytes).
    expect(SOURCE).toMatch(/disableAutoFetch:\s*!useRange/);
    expect(SOURCE).toMatch(/disableStream:\s*!useRange/);
  });
});

describe('PdfCanvasViewer — anti-piracy hooks (regression guards)', () => {
  it('blocks Save/Print/SelectAll/Copy/View-source keyboard shortcuts', () => {
    expect(SOURCE).toMatch(/'s', 'p', 'a', 'c', 'u'/);
  });

  it('blocks PrintScreen', () => {
    expect(SOURCE).toMatch(/PrintScreen/);
  });

  it('caps device-pixel-ratio at 2 to avoid memory blowout', () => {
    expect(SOURCE).toMatch(/Math\.min\(window\.devicePixelRatio\s*\|\|\s*1,\s*2\)/);
  });

  it('renders a per-user diagonal watermark on the canvas', () => {
    expect(SOURCE).toMatch(/watermarkRef/);
    expect(SOURCE).toMatch(/cols\s*=\s*3,\s*rows\s*=\s*5/);
  });
});
