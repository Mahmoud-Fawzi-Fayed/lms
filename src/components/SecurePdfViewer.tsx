'use client';

import PdfCanvasViewer from '@/components/PdfCanvasViewer';

interface SecurePdfViewerProps {
  src: string;
  title?: string;
}

/**
 * SecurePdfViewer - Renders PDF via PDF.js to canvas.
 * No browser PDF plugin needed. No toolbar, no download button.
 */
export default function SecurePdfViewer({ src, title }: SecurePdfViewerProps) {
  return (
    <div
      className="relative bg-gray-900 rounded-lg overflow-hidden"
      onContextMenu={e => e.preventDefault()}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
        <span className="text-white text-sm font-medium">{title || 'PDF Document'}</span>
        <span className="text-gray-400 text-xs">محتوى محمي</span>
      </div>

      <PdfCanvasViewer src={src} protected maxHeight="80vh" />

      {/* Watermark */}
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
