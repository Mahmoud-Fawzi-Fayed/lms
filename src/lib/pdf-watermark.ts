// Server-side PDF watermarking.
//
// The /api/content/[token] route returns the original PDF bytes to PDF.js.
// Without this, a user could open DevTools → Network → "Save response as" and
// extract a clean, unwatermarked copy of the source PDF.
//
// We open the PDF with pdf-lib, overlay a repeating diagonal watermark of the
// user's email/id on every page, and return the new bytes. The watermark is
// drawn at a low opacity (so it doesn't ruin readability) but is rasterized
// into each page's content stream — anyone who saves the raw response gets
// a copy that still identifies the leaker.
//
// Cost: ~30-80ms for a typical 20-page PDF. PDF is loaded into memory; do NOT
// use this for PDFs > 50MB. We cap large files and fall through to no-watermark
// rather than hang the server.

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

// 50 MB hard cap — anything bigger is streamed as-is (better to serve than to OOM)
const MAX_WATERMARK_BYTES = 50 * 1024 * 1024;

/**
 * Apply a repeating diagonal email watermark to every page of a PDF.
 * @param pdfBytes  Original PDF buffer
 * @param text      Watermark string (typically user email)
 * @param meta      Optional second line printed under the email (e.g. "IP · time")
 * @returns         Watermarked PDF bytes (or original if watermarking failed / file too large)
 */
export async function watermarkPdf(
  pdfBytes: Buffer | Uint8Array,
  text: string,
  meta?: string,
): Promise<Uint8Array> {
  if (!text || pdfBytes.byteLength > MAX_WATERMARK_BYTES) {
    return pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  }

  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      const fontSize = Math.max(10, Math.min(width, height) * 0.022);
      const subSize  = Math.max(7,  fontSize * 0.7);

      // 3 cols × 5 rows of rotated watermark stamps
      const cols = 3, rows = 5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = width  * (0.15 + c * 0.35);
          const y = height * (0.92 - r * 0.22); // PDF origin is bottom-left
          page.drawText(text, {
            x, y,
            size: fontSize,
            font,
            color: rgb(0.067, 0.067, 0.067),
            opacity: 0.08,
            rotate: degrees(25),
          });
          if (meta) {
            page.drawText(meta, {
              x, y: y - fontSize - 2,
              size: subSize,
              font,
              color: rgb(0.067, 0.067, 0.067),
              opacity: 0.08,
              rotate: degrees(25),
            });
          }
        }
      }

      // Footer line — large, clear, hard to crop out without re-encoding the PDF
      if (meta) {
        page.drawText(`${text} · ${meta}`, {
          x: 18, y: 8,
          size: 7,
          font,
          color: rgb(0.2, 0.2, 0.2),
          opacity: 0.55,
        });
      }
    }

    return await pdfDoc.save({ useObjectStreams: false });
  } catch (err) {
    // Encrypted PDFs and a few malformed files will throw — fall back to the
    // original bytes rather than block the user from seeing their content.
    console.error('[content] watermark skipped:', (err as Error).message);
    return pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  }
}
