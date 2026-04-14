'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface PdfCanvasViewerProps {
  /** Either a URL to fetch (with X-Content-Request header) or a blob URL */
  src: string;
  /** If true, fetch with custom header (protected API). If false, use src directly */
  protected?: boolean;
  /** Max height CSS value */
  maxHeight?: string;
}

/**
 * Renders PDF pages to <canvas> elements using PDF.js.
 * No browser PDF plugin needed — works everywhere.
 * Better for content protection: no toolbar, no "Save As", no download button.
 */
export default function PdfCanvasViewer({ src, protected: isProtected = true, maxHeight = '85vh' }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError('');
      try {
        // Dynamic import to avoid SSR issues
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        let data: ArrayBuffer;
        if (isProtected) {
          const res = await fetch(src, { credentials: 'include', headers: { 'X-Content-Request': '1' } });
          if (!res.ok) throw new Error('Failed to fetch');
          data = await res.arrayBuffer();
        } else {
          const res = await fetch(src);
          if (!res.ok) throw new Error('Failed to fetch');
          data = await res.arrayBuffer();
        }

        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('PDF load error:', err);
          setError('فشل تحميل الملف');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [src, isProtected]);

  // Render current page to canvas
  useEffect(() => {
    const pdf = pdfDocRef.current;
    const container = containerRef.current;
    if (!pdf || !container || currentPage < 1 || currentPage > totalPages) return;

    let cancelled = false;

    async function renderPage() {
      try {
        const page = await pdf.getPage(currentPage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });

        // Reuse or create canvas
        let canvas = container!.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.oncontextmenu = (e) => e.preventDefault();
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto';
          canvas.style.maxWidth = '100%';
          container!.innerHTML = '';
          container!.appendChild(canvas);
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        if (!cancelled) console.error('Page render error:', err);
      }
    }

    renderPage();
    return () => { cancelled = true; };
  }, [currentPage, totalPages, scale]);

  const goPage = useCallback((delta: number) => {
    setCurrentPage(p => Math.max(1, Math.min(totalPages, p + delta)));
  }, [totalPages]);

  if (error) return <div className="text-white text-center py-12">{error}</div>;

  return (
    <div className="flex flex-col select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-200 rounded-t-xl"
        style={{ maxHeight, minHeight: '300px' }}
      >
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Controls bar */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between bg-gray-800 text-white px-4 py-2 rounded-b-xl text-sm" dir="ltr">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goPage(-1)}
              disabled={currentPage <= 1}
              className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ◀
            </button>
            <span className="min-w-[80px] text-center font-mono">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goPage(1)}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ▶
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
              className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            >
              −
            </button>
            <span className="min-w-[50px] text-center font-mono text-xs">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(s => Math.min(3, s + 0.25))}
              className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
