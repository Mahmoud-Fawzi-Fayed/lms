'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface PdfCanvasViewerProps {
  src: string;
  protected?: boolean;
  maxHeight?: string;
}

/**
 * PdfCanvasViewer — renders PDF pages to <canvas> via PDF.js.
 * Features: device-pixel-ratio crisp rendering, background next-page prerender,
 * keyboard navigation (← → PageUp PageDown), zoom in/out, no browser PDF plugin.
 */
export default function PdfCanvasViewer({ src, protected: isProtected = true, maxHeight = '85vh' }: PdfCanvasViewerProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement | null>(null); // off-screen pre-render
  const renderTaskRef = useRef<any>(null);
  const [loading,      setLoading]     = useState(true);
  const [pageLoading,  setPageLoading] = useState(false);
  const [error,        setError]       = useState('');
  const [currentPage,  setCurrentPage] = useState(1);
  const [totalPages,   setTotalPages]  = useState(0);
  const [scale,        setScale]       = useState(1.5);
  const pdfDocRef = useRef<any>(null);

  // ── Watermark: user email burned into every rendered canvas page ────────
  const { data: sessionData } = useSession();
  const watermarkRef = useRef('');
  useEffect(() => {
    watermarkRef.current = (sessionData?.user as any)?.email ?? (sessionData?.user as any)?.name ?? '';
  }, [sessionData]);

  // ── Load PDF document ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      setLoading(true);
      setError('');
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        let data: ArrayBuffer;
        if (isProtected) {
          const res = await fetch(src, { credentials: 'include', headers: { 'X-Content-Request': '1' } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.arrayBuffer();
        } else {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.arrayBuffer();
        }
        if (cancelled) return;
        if (!data.byteLength) throw new Error('Empty PDF');

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        if (!cancelled) { console.error('PDF load error:', err); setError('فشل تحميل الملف'); setLoading(false); }
      }
    }
    loadPdf();
    return () => { cancelled = true; };
  }, [src, isProtected]);

  // ── Render page to canvas with device-pixel-ratio support ─────────────────
  const renderPage = useCallback(async (pageNum: number, targetScale: number, canvas: HTMLCanvasElement) => {
    const pdf = pdfDocRef.current;
    if (!pdf || pageNum < 1 || pageNum > pdf.numPages) return;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const page     = await pdf.getPage(pageNum);
    const dpr      = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× to avoid memory blowout
    const viewport = page.getViewport({ scale: targetScale });

    // Physical canvas size (sharp on HiDPI)
    canvas.width  = Math.floor(viewport.width  * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    // CSS size (displayed size)
    canvas.style.width  = Math.floor(viewport.width)  + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    await task.promise;
    renderTaskRef.current = null;

    // ── Draw repeating diagonal watermark ──────────────────────────────────
    const wm = watermarkRef.current;
    if (wm) {
      const vw = viewport.width;
      const vh = viewport.height;
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#111111';
      const fontSize = Math.max(11, Math.floor(Math.min(vw, vh) * 0.022));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cols = 3, rows = 5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.save();
          ctx.translate(vw * (0.15 + c * 0.35), vh * (0.08 + r * 0.22));
          ctx.rotate(-Math.PI / 7);
          ctx.fillText(wm, 0, 0);
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }, []);

  // ── Render on page/scale change ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDocRef.current || loading) return;

    let cancelled = false;
    setPageLoading(true);

    (async () => {
      try {
        await renderPage(currentPage, scale, canvas);
        if (cancelled) return;
        setPageLoading(false);

        // Pre-render next page off-screen
        const pdf = pdfDocRef.current;
        if (currentPage < totalPages && pdf) {
          const off = document.createElement('canvas');
          nextCanvasRef.current = off;
          try { await renderPage(currentPage + 1, scale, off); } catch { /* ignore prerender error */ }
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          console.error('Page render error:', err);
          setPageLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    };
  }, [currentPage, totalPages, scale, loading, renderPage]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Block common save / print / dev-tools shortcuts at the PDF surface.
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && ['s', 'p', 'a', 'c', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentPage(p => Math.min(totalPages, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages]);

  const goPage = useCallback((delta: number) => {
    setCurrentPage(p => Math.max(1, Math.min(totalPages, p + delta)));
  }, [totalPages]);

  if (error) return <div className="text-white text-center py-12">{error}</div>;

  return (
    <div
      className="flex flex-col select-none"
      onContextMenu={e => e.preventDefault()}
      onCopy={e => e.preventDefault()}
      onCut={e => e.preventDefault()}
      onDragStart={e => e.preventDefault()}
      style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as any}
    >
      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-800 rounded-t-xl flex items-start justify-center"
        style={{ maxHeight, minHeight: '300px' }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-64 w-full">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-gray-300 text-sm">جاري تحميل الملف...</span>
            </div>
          </div>
        ) : (
          <div className="relative my-4">
            {pageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded z-10 pointer-events-none">
                <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              onContextMenu={e => e.preventDefault()}
              onDragStart={e => e.preventDefault()}
              className="block shadow-2xl rounded pointer-events-none"
              style={{ maxWidth: '100%' }}
            />
          </div>
        )}
      </div>

      {/* Control bar */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between bg-gray-900 text-white px-4 py-2 rounded-b-xl text-sm" dir="ltr">
          {/* Page navigation */}
          <div className="flex items-center gap-2">
            <button onClick={() => goPage(-1)} disabled={currentPage <= 1}
              className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base font-bold">
              ‹
            </button>
            <span className="min-w-[80px] text-center font-mono text-xs tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button onClick={() => goPage(1)} disabled={currentPage >= totalPages}
              className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base font-bold">
              ›
            </button>
          </div>

          {/* Keyboard hint */}
          <span className="text-gray-500 text-xs hidden sm:inline">← → للتنقل</span>

          {/* Zoom */}
          <div className="flex items-center gap-2">
            <button onClick={() => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))}
              className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors font-bold text-lg leading-none">
              −
            </button>
            <span className="min-w-[50px] text-center font-mono text-xs tabular-nums">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3, +(s + 0.25).toFixed(2)))}
              className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors font-bold text-lg leading-none">
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
