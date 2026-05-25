import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { watermarkPdf } from '@/lib/pdf-watermark';

async function makeRealPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  page.drawText('hello world', { x: 50, y: 200 });
  return Buffer.from(await doc.save());
}

describe('watermarkPdf', () => {
  it('stamps real PDFs and returns valid PDF bytes', async () => {
    const original = await makeRealPdf();
    const stamped = await watermarkPdf(original, 'user@example.com');
    // Must remain valid PDF
    expect(Buffer.from(stamped).slice(0, 4).toString()).toBe('%PDF');
    // pdf-lib must be able to re-load it
    const re = await PDFDocument.load(stamped);
    expect(re.getPageCount()).toBe(1);
    // Must be larger (watermark adds text operations)
    expect(stamped.byteLength).toBeGreaterThan(original.byteLength);
  });

  it('falls back to original bytes for malformed PDFs', async () => {
    const fake = Buffer.from('%PDF-1.4\nnot really a pdf\n');
    const result = await watermarkPdf(fake, 'u@x.com');
    expect(Buffer.from(result).equals(fake)).toBe(true);
  });

  it('skips watermarking when text is empty', async () => {
    const original = await makeRealPdf();
    const result = await watermarkPdf(original, '');
    expect(Buffer.from(result).equals(original)).toBe(true);
  });

  it('skips watermarking when PDF exceeds size cap', async () => {
    // 51MB buffer — exceeds 50MB cap.
    const huge = Buffer.alloc(51 * 1024 * 1024, 0x25);
    const result = await watermarkPdf(huge, 'u@x.com');
    expect(result.byteLength).toBe(huge.byteLength);
  });
});
