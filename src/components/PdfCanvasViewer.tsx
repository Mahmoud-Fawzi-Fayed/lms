'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

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
  useLang();
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const preRenderTaskRef = useRef<any>(null);
  const loadTaskRef = useRef<any>(null);
  const [loading,      setLoading]     = useState(true);
  const [pageLoading,  setPageLoading] = useState(false);
  const [error,        setError]       = useState('');
  const [currentPage,  setCurrentPage] = useState(1);
  const [totalPages,   setTotalPages]  = useState(0);
  const [scale,        setScale]       = useState(1.25);
  const [isLowPowerDevice, setIsLowPowerDevice] = useState(false);
  const pdfDocRef = useRef<any>(null);

  // ── Watermark: user email burned into every rendered canvas page ────────
  const { data: sessionData } = useSession();
  const watermarkRef = useRef('');
  useEffect(() => {
    watermarkRef.current = (sessionData?.user as any)?.email ?? (sessionData?.user as any)?.name ?? '';
  }, [sessionData]);

  // Avoid expensive background prerendering on lower-end devices.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as any).deviceMemory || 4;
    setIsLowPowerDevice(cores <= 4 || mem <= 4);
  }, []);

  // ── Load PDF document ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      setLoading(true);
      setError('');
      try {
        const pdfjsLib = await import('pdfjs-dist');
        // BUG-FIX: PDF.js refuses to load if the API and worker versions don't
        // match. We point at the static /pdf.worker.min.mjs (kept in sync via
        // the postinstall hook), but as a runtime safety-net we also append
        // the API version so a stale CDN/edge cache invalidates and so that an
        // out-of-sync deploy fails LOUDLY in the network panel instead of the
        // viewer just showing "Failed to load".
        const workerUrl = `/pdf.worker.min.mjs?v=${(pdfjsLib as any).version || '0'}`;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

        // Protected PDFs: do a tiny HEAD-style probe (1-byte Range) so we can
        // verify the response is a real PDF and that the server supports
        // Range requests (added in the cache-key fix). If both, hand the URL
        // straight to PDF.js so it can progressively fetch with its own
        // Range-based loader — first page paints in ~200ms instead of waiting
        // for the entire 10 MB file to arrive.
        //
        // We can't do a HEAD because the content API only accepts GET (and
        // verifies our custom X-Content-Request header on each call). Instead
        // we GET bytes 0-0 — 1 byte over the wire is plenty to check headers,
        // and if Range is supported we get a 206; if not we get 200 + full
        // body and we discard it then re-fetch in full-file mode.
        let docSource: { url: string } | { data: Uint8Array };
        let useRange = false;

        if (isProtected) {
          const probe = await fetch(src, {
            credentials: 'include',
            mode: 'cors',
            cache: 'no-store',
            headers: { 'X-Content-Request': '1', Range: 'bytes=0-0' },
          });
          if (!probe.ok && probe.status !== 206) {
            console.error(
              `[PdfCanvasViewer] content fetch failed: ${probe.status} ${probe.statusText} for ${src}`
            );
            throw new Error(`HTTP ${probe.status}`);
          }
          const ct = probe.headers.get('content-type') || '';
          if (!ct.includes('application/pdf')) {
            console.error(`[PdfCanvasViewer] response is not a PDF (content-type=${ct})`);
            throw new Error('not a PDF response');
          }
          useRange = probe.status === 206 && /bytes/i.test(probe.headers.get('accept-ranges') || '');

          if (useRange) {
            // PDF.js will issue its own Range requests via the URL.
            // Discard the 1-byte probe body.
            try { await probe.body?.cancel(); } catch { /* noop */ }
            docSource = { url: src };
          } else {
            // Fallback: server didn't return Range (older deployment or proxy
            // stripped the header). Fetch the whole thing once.
            const full = await fetch(src, {
              credentials: 'include',
              mode: 'cors',
              cache: 'no-store',
              headers: { 'X-Content-Request': '1' },
            });
            if (!full.ok) throw new Error(`HTTP ${full.status}`);
            docSource = { data: new Uint8Array(await full.arrayBuffer()) };
          }
        } else {
          docSource = { url: src };
          useRange = true;
        }

        const loadingTask = pdfjsLib.getDocument({
          ...docSource,
          // Pass our custom header so PDF.js's internal Range fetches still
          // satisfy the content API's X-Content-Request guard.
          ...(useRange && isProtected ? { httpHeaders: { 'X-Content-Request': '1' }, withCredentials: true } : {}),
          // When useRange is true we let PDF.js stream chunks lazily. When
          // false we already have the whole file in memory — disable stream
          // so PDF.js doesn't try extra network requests.
          disableAutoFetch: !useRange,
          disableStream:    !useRange,
        });
        loadTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);

        // Fit first page width to container for quicker first paint and better UX.
        try {
          const firstPage = await pdf.getPage(1);
          const viewport = firstPage.getViewport({ scale: 1 });
          const containerWidth = containerRef.current?.clientWidth || viewport.width;
          const fitScale = Math.max(0.85, Math.min(1.6, containerWidth / viewport.width));
          setScale(+fitScale.toFixed(2));
        } catch {
          setScale(1.25);
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) { console.error('PDF load error:', err); setError(t('فشل تحميل الملف', 'Failed to load file')); setLoading(false); }
      }
    }
    loadPdf();
    return () => {
      cancelled = true;
      try { loadTaskRef.current?.destroy?.(); } catch {}
      loadTaskRef.current = null;
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
      if (preRenderTaskRef.current) { preRenderTaskRef.current.cancel(); preRenderTaskRef.current = null; }
      try { pdfDocRef.current?.destroy?.(); } catch {}
      pdfDocRef.current = null;
    };
  }, [src, isProtected]);

  // ── Render page to canvas with device-pixel-ratio support ─────────────────
  const renderPage = useCallback(async (
    pageNum: number,
    targetScale: number,
    canvas: HTMLCanvasElement,
    taskSlot?: { current: any }
  ) => {
    const pdf = pdfDocRef.current;
    if (!pdf || pageNum < 1 || pageNum > pdf.numPages) return;

    if (taskSlot?.current) {
      taskSlot.current.cancel();
      taskSlot.current = null;
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
    if (taskSlot) taskSlot.current = task;
    try {
      await task.promise;
    } finally {
      if (taskSlot && taskSlot.current === task) taskSlot.current = null;
    }

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
        await renderPage(currentPage, scale, canvas, renderTaskRef);
        if (cancelled) return;
        setPageLoading(false);

        // Pre-render next page off-screen only when device budget allows.
        const pdf = pdfDocRef.current;
        if (!isLowPowerDevice && currentPage < totalPages && totalPages <= 250 && pdf) {
          const off = document.createElement('canvas');
          const idle = (window as any).requestIdleCallback as ((cb: () => void) => void) | undefined;
          const run = async () => {
            try { await renderPage(currentPage + 1, scale, off, preRenderTaskRef); } catch { /* ignore prerender error */ }
          };
          if (idle) idle(() => { void run(); });
          else { void run(); }
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
      if (preRenderTaskRef.current) { preRenderTaskRef.current.cancel(); preRenderTaskRef.current = null; }
    };
  }, [currentPage, totalPages, scale, loading, renderPage, isLowPowerDevice]);

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
              <span className="text-gray-300 text-sm">{t('جاري تحميل الملف...', 'Loading file...')}</span>
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
          <span className="text-gray-500 text-xs hidden sm:inline">{t('← → للتنقل', '← → to navigate')}</span>

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
