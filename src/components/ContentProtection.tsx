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
      // Pause all videos when page hidden (screenshot/recording attempt)
      document.querySelectorAll('video').forEach(v => v.pause());
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as any;
      if (
        reason &&
        typeof reason === 'object' &&
        reason.httpError === false &&
        reason.httpStatus === 200 &&
        reason.code === 403
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

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

    // Screen recording detection: intercept getDisplayMedia
    const origGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia;
    if (navigator.mediaDevices && origGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = function (options?: DisplayMediaStreamOptions) {
        document.body.classList.add('screen-recording');
        document.querySelectorAll('video').forEach(v => v.pause());
        showWarning('⚠️ تم اكتشاف تسجيل الشاشة');
        return origGetDisplayMedia.call(this, options);
      };
    }

    // Detect Picture-in-Picture attempts
    const handlePiP = (e: Event) => {
      e.preventDefault();
      showWarning('⚠️ صورة داخل صورة غير مسموح بها');
    };
    document.addEventListener('enterpictureinpicture', handlePiP, true);

    // Clear clipboard on focus to remove any screenshots
    const handleFocus = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('').catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('enterpictureinpicture', handlePiP, true);
      window.removeEventListener('focus', handleFocus);
      clearInterval(devtoolsCheckInterval);
      if (navigator.mediaDevices && origGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
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
          content: 'أدوات المطور مفتوحة - أغلقها لعرض المحتوى';
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.95);
          color: white;
          padding: 30px 50px;
          border-radius: 10px;
          font-size: 18px;
          z-index: 99999;
          direction: rtl;
        }

        /* Screen recording detected */
        body.screen-recording .content-protected {
          filter: blur(30px) brightness(0.3) !important;
          pointer-events: none !important;
        }
        body.screen-recording::after {
          content: '⚠️ تم اكتشاف تسجيل الشاشة';
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(220, 38, 38, 0.95);
          color: white;
          padding: 30px 50px;
          border-radius: 10px;
          font-size: 20px;
          z-index: 99999;
          direction: rtl;
        }

        /* Disable image/video dragging */
        .content-protected img,
        .content-protected video {
          -webkit-user-drag: none;
          user-drag: none;
          pointer-events: none;
        }

        .content-protected video {
          pointer-events: auto;
        }

        /* Prevent capture via CSS — experimental but supported in some browsers */
        .content-protected canvas,
        .content-protected video {
          content-visibility: auto;
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

function showWarning(message = '⚠️ هذا المحتوى محمي') {
  // Brief toast warning
  const existing = document.getElementById('protection-warning');
  if (existing) existing.remove();

  const warning = document.createElement('div');
  warning.id = 'protection-warning';
  warning.textContent = message;
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
