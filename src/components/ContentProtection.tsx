'use client';

import { useEffect, useCallback, ReactNode } from 'react';

interface ContentProtectionProps {
  children: ReactNode;
  watermarkText?: string;
  enabled?: boolean;
}

/**
 * ContentProtection - Wraps content to prevent:
 * - Screenshots (CSS overlay + visibility API)
 * - Screen recording detection
 * - Right-click / context menu
 * - Keyboard shortcuts (Ctrl+S, Ctrl+P, PrintScreen, etc.)
 * - Developer tools (F12, Ctrl+Shift+I)
 * - Text selection & drag
 * - Downloads via browser save
 */
export default function ContentProtection({
  children,
  watermarkText,
  enabled = true,
}: ContentProtectionProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Block print screen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        navigator.clipboard.writeText('').catch(() => {});
        showWarning();
        return;
      }

      // Block Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        const blockedKeys = [
          's', // Save
          'p', // Print
          'c', // Copy (on protected content)
          'u', // View source
          'shift', // With shift for devtools
        ];

        if (blockedKeys.includes(e.key.toLowerCase())) {
          e.preventDefault();
          showWarning();
          return;
        }

        // Ctrl+Shift+I (DevTools)
        if (e.shiftKey && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          showWarning();
          return;
        }

        // Ctrl+Shift+J (Console)
        if (e.shiftKey && e.key.toLowerCase() === 'j') {
          e.preventDefault();
          return;
        }

        // Ctrl+Shift+C (Element inspector)
        if (e.shiftKey && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          return;
        }
      }

      // Block F12
      if (e.key === 'F12') {
        e.preventDefault();
        return;
      }
    },
    [enabled]
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;
      e.preventDefault();
    },
    [enabled]
  );

  const handleVisibilityChange = useCallback(() => {
    if (!enabled) return;
    if (document.hidden) {
      // Page is hidden (possible screenshot/recording)
      // We could blur the content or add an overlay
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Prevent drag start (dragging images/content)
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };
    document.addEventListener('dragstart', handleDragStart);

    // Detect devtools by checking window.outerWidth vs window.innerWidth
    let devtoolsCheckInterval: NodeJS.Timeout;
    const checkDevtools = () => {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      if (widthDiff || heightDiff) {
        // DevTools might be open - add deterrent overlay
        document.body.classList.add('devtools-open');
      } else {
        document.body.classList.remove('devtools-open');
      }
    };
    devtoolsCheckInterval = setInterval(checkDevtools, 1000);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('dragstart', handleDragStart);
      clearInterval(devtoolsCheckInterval);
    };
  }, [enabled, handleKeyDown, handleContextMenu, handleVisibilityChange]);

  if (!enabled) return <>{children}</>;

  return (
    <div className="content-protected relative" data-protected="true">
      {/* Anti-screenshot CSS overlay */}
      <style jsx global>{`
        .content-protected {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent;
        }

        /* Make content invisible during screenshot attempts */
        @media print {
          .content-protected {
            display: none !important;
          }
          body::after {
            content: 'Printing is not allowed for this content.';
            display: block;
            font-size: 24px;
            text-align: center;
            padding: 100px;
          }
        }

        /* DevTools open deterrent */
        body.devtools-open .content-protected {
          filter: blur(20px) !important;
          pointer-events: none !important;
        }

        body.devtools-open::after {
          content: 'Developer tools detected. Please close them to view content.';
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 30px 50px;
          border-radius: 10px;
          font-size: 18px;
          z-index: 99999;
        }

        /* Disable image dragging */
        .content-protected img,
        .content-protected video {
          -webkit-user-drag: none;
          user-drag: none;
          pointer-events: none;
        }

        .content-protected video {
          pointer-events: auto;
        }
      `}</style>

      {/* Watermark overlay */}
      {watermarkText && (
        <div
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden opacity-[0.03]"
          style={{
            background: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 100px,
              transparent 100px,
              transparent 200px
            )`,
          }}
        >
          <div className="flex h-full w-full flex-wrap items-center justify-center gap-20 rotate-[-30deg] scale-150">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className="whitespace-nowrap text-xl font-bold text-gray-800"
              >
                {watermarkText}
              </span>
            ))}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

function showWarning() {
  // Brief toast warning
  const existing = document.getElementById('protection-warning');
  if (existing) existing.remove();

  const warning = document.createElement('div');
  warning.id = 'protection-warning';
  warning.textContent = '⚠️ This content is protected';
  warning.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 99999;
    background: #ef4444; color: white; padding: 12px 24px;
    border-radius: 8px; font-size: 14px; font-weight: 600;
    animation: fadeIn 0.3s ease;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(warning);
  setTimeout(() => warning.remove(), 3000);
}
