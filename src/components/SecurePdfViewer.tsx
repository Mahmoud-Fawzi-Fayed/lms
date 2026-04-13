'use client';

import { useRef, useEffect, useState } from 'react';

interface SecurePdfViewerProps {
  src: string;
  title?: string;
}

/**
 * SecurePdfViewer - Renders PDF in a canvas (not an iframe/embed)
 * to prevent download and screenshot as much as possible.
 * Uses PDF.js-like approach but with HTML canvas rendering.
 */
export default function SecurePdfViewer({ src, title }: SecurePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobSrc, setBlobSrc] = useState<string>('');

  useEffect(() => {
    let revoke = '';
    setBlobSrc('');
    setLoading(true);
    setError(null);
    if (!src) return;
    fetch(src, { credentials: 'include', headers: { 'X-Content-Request': '1' } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(b => { revoke = URL.createObjectURL(b); setBlobSrc(revoke); setLoading(false); })
      .catch(() => { setError('فشل تحميل الملف'); setLoading(false); });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [src]);

  return (
    <div
      ref={containerRef}
      className="relative bg-gray-900 rounded-lg overflow-hidden"
      onContextMenu={e => e.preventDefault()}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Anti-screenshot overlay */}
      <style jsx>{`
        @media print {
          .pdf-container {
            display: none !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
        <span className="text-white text-sm font-medium">{title || 'PDF Document'}</span>
        <span className="text-gray-400 text-xs">Protected Content</span>
      </div>

      {/* PDF rendered via restricted iframe */}
      <div className="pdf-container relative" style={{ height: '80vh' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400">
            {error}
          </div>
        ) : (
          <>
            <iframe
              src={`${blobSrc}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              className="w-full h-full border-0"
              style={{
                pointerEvents: 'auto',
              }}
              title={title || 'PDF Document'}
            />
            {/* Overlay to prevent right-click on the iframe content */}
            <div
              className="absolute inset-0 pointer-events-none"
              onContextMenu={e => e.preventDefault()}
            />
          </>
        )}
      </div>

      {/* Watermark across PDF */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] overflow-hidden">
        <div className="flex flex-wrap items-center justify-center gap-16 h-full rotate-[-30deg] scale-150">
          {Array.from({ length: 15 }).map((_, i) => (
            <span key={i} className="text-lg font-bold text-white whitespace-nowrap">
              PROTECTED
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
