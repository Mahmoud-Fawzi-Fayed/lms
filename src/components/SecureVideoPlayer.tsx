'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export interface VideoControls {
  allowSpeed?: boolean;
  allowSkip?: boolean;
  allowFullscreen?: boolean;
  allowSeek?: boolean;
  allowVolume?: boolean;
  forceFocus?: boolean;
}

interface SecureVideoPlayerProps {
  src: string;
  title?: string;
  controls?: VideoControls;
  onProgress?: (currentTime: number, duration: number) => void;
  onComplete?: () => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export default function SecureVideoPlayer({ src, title, controls, onProgress, onComplete }: SecureVideoPlayerProps) {
  const allowSpeed      = controls?.allowSpeed      !== false;
  const allowSkip       = controls?.allowSkip       !== false;
  const allowFullscreen = controls?.allowFullscreen !== false;
  const allowSeek       = controls?.allowSeek       !== false;
  const allowVolume     = controls?.allowVolume     !== false;
  const forceFocus      = controls?.forceFocus      === true;

  // Convert mode=raw -> mode=stream so the browser can stream natively via Range requests.
  // Falls back to the original src if it doesn't contain mode=raw.
  const streamSrc = src.includes('mode=raw') ? src.replace('mode=raw', 'mode=stream') : src;

  const videoRef        = useRef<HTMLVideoElement>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const seekTooltipRef  = useRef<HTMLDivElement>(null);
  const volumeBarRef    = useRef<HTMLDivElement>(null);
  const seekBarRef      = useRef<HTMLDivElement>(null);
  const isDraggingSeek  = useRef(false);
  const [playing,       setPlaying]      = useState(false);
  const [currentTime,   setCurrentTime]  = useState(0);
  const [duration,      setDuration]     = useState(0);
  const [volume,        setVolume]       = useState(1);
  const [muted,         setMuted]        = useState(false);
  const [buffering,     setBuffering]    = useState(false);
  const [fullscreen,    setFullscreen]   = useState(false);
  const [speed,         setSpeed]        = useState(1);
  const [showSpeed,     setShowSpeed]    = useState(false);
  const [showVolume,    setShowVolume]   = useState(false);
  const [seekTooltip,   setSeekTooltip]  = useState({ visible: false, time: 0, x: 0 });
  const [skipFlash,     setSkipFlash]    = useState<'+10' | '-10' | null>(null);
  const [showControls,  setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dynamic user watermark (deters screenshot sharing) ───────────────────
  const { data: sessionData } = useSession();
  const watermarkLabel = (sessionData?.user as any)?.email ?? (sessionData?.user as any)?.name ?? '';
  const [wmPos, setWmPos] = useState({ top: 15, left: 10 });
  useEffect(() => {
    if (!watermarkLabel) return;
    const t = setInterval(() => {
      setWmPos({ top: 8 + Math.random() * 55, left: 5 + Math.random() * 60 });
    }, 6000);
    return () => clearInterval(t);
  }, [watermarkLabel]);

  // ── Force-focus: pause when user leaves the video tab/window ─────────────
  useEffect(() => {
    if (!forceFocus) return;
    const pause = () => { videoRef.current?.pause(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('blur', pause);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      window.removeEventListener('blur', pause);
    };
  }, [forceFocus]);

  // ── Single-tab playback lock ─────────────────────────────────────────────
  // Stops a user from opening the same lesson in 5 tabs and screen-recording
  // each fragment in parallel. Uses BroadcastChannel: when any tab starts
  // playing, it claims the lock; other tabs receive the claim, pause their
  // video, and surface an overlay. The claim ID is per-tab so a tab never
  // pauses itself.
  const [otherTabPlaying, setOtherTabPlaying] = useState(false);
  const tabIdRef = useRef<string>('');
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    tabIdRef.current = Math.random().toString(36).slice(2);
    const ch = new BroadcastChannel('lms-video-lock');
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.tabId === tabIdRef.current) return;
      if (msg.type === 'claim') {
        // Another tab started playing — pause ourselves and show the overlay.
        videoRef.current?.pause();
        setOtherTabPlaying(true);
      } else if (msg.type === 'release') {
        setOtherTabPlaying(false);
      }
    };
    ch.addEventListener('message', onMessage);
    return () => {
      ch.postMessage({ type: 'release', tabId: tabIdRef.current });
      ch.removeEventListener('message', onMessage);
      ch.close();
    };
  }, []);

  const broadcastPlay = useCallback(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('lms-video-lock');
    ch.postMessage({ type: 'claim', tabId: tabIdRef.current });
    ch.close();
    setOtherTabPlaying(false);
  }, []);
  const broadcastPause = useCallback(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('lms-video-lock');
    ch.postMessage({ type: 'release', tabId: tabIdRef.current });
    ch.close();
  }, []);

  // ── Auto-hide controls overlay ────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause();
          break;
        case 'ArrowRight':
          if (allowSkip) { e.preventDefault(); skip(10); }
          break;
        case 'ArrowLeft':
          if (allowSkip) { e.preventDefault(); skip(-10); }
          break;
        case 'ArrowUp':
          if (allowVolume) { e.preventDefault(); adjustVolume(0.1); }
          break;
        case 'ArrowDown':
          if (allowVolume) { e.preventDefault(); adjustVolume(-0.1); }
          break;
        case 'f':
          if (allowFullscreen) { e.preventDefault(); toggleFullscreen(); }
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowSkip, allowVolume, allowFullscreen]);

  // ── Fullscreen change sync ────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Video event handlers ─────────────────────────────────────────────────
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    onProgress?.(v.currentTime, v.duration);
  };

  const onEnded = () => {
    setPlaying(false);
    onComplete?.();
  };

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const skip = (secs: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + secs));
    setSkipFlash(secs > 0 ? '+10' : '-10');
    setTimeout(() => setSkipFlash(null), 600);
    resetHideTimer();
  };

  const adjustVolume = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(0, Math.min(1, v.volume + delta));
    v.volume = next;
    setVolume(next);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const setSpeedValue = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
    setShowSpeed(false);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen();
    else document.exitFullscreen();
  };

  // ── Seek bar (pointer capture enables dragging outside the bar) ─────────
  const computeSeek = (clientX: number) => {
    if (!allowSeek) return;
    const bar = seekBarRef.current;
    const v   = videoRef.current;
    if (!bar || !v || !v.duration) return;
    const rect  = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    setCurrentTime(v.currentTime);
  };

  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!allowSeek) return;
    isDraggingSeek.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    computeSeek(e.clientX);
  };

  const onSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Always update tooltip on hover
    if (allowSeek) {
      const bar = seekBarRef.current;
      if (bar) {
        const rect  = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setSeekTooltip({ visible: true, time: ratio * (duration || 0), x: ratio * 100 });
      }
    }
    // Seek if dragging
    if (isDraggingSeek.current) computeSeek(e.clientX);
  };

  const onSeekPointerUp = () => { isDraggingSeek.current = false; };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-xl overflow-hidden select-none group"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHideTimer}
      onClick={() => { togglePlay(); resetHideTimer(); }}
      tabIndex={0}
    >
      {/* Native <video> — hardware-accelerated streaming via Range requests */}
      <video
        ref={videoRef}
        src={streamSrc}
        preload="metadata"
        className="w-full h-full object-contain"
        playsInline
        controlsList="nodownload nofullscreen noremoteplayback"
        onContextMenu={e => e.preventDefault()}
        {...({ disablePictureInPicture: true } as any)}
        onPlay={() => { setPlaying(true); broadcastPlay(); }}
        onPause={() => { setPlaying(false); broadcastPause(); }}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={e => setDuration((e.target as HTMLVideoElement).duration)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onEnded={onEnded}
        onVolumeChange={e => { const v = e.target as HTMLVideoElement; setVolume(v.volume); setMuted(v.muted); }}
      />

      {/* Transparent overlay — blocks right-click "Save video as…" */}
      <div
        className="absolute inset-0 z-10"
        onContextMenu={e => e.preventDefault()}
        onClick={e => { e.stopPropagation(); togglePlay(); resetHideTimer(); }}
      />

      {/* Dynamic user watermark — moves every 6s so screenshots reveal user identity */}
      {watermarkLabel && (
        <div
          className="absolute z-20 pointer-events-none select-none transition-all duration-[2000ms]"
          style={{
            top: `${wmPos.top}%`,
            left: `${wmPos.left}%`,
            opacity: 0.18,
            color: '#ffffff',
            fontSize: '11px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            transform: 'rotate(-20deg)',
            letterSpacing: '0.05em',
          }}
        >
          {watermarkLabel}
        </div>
      )}

      {/* Other-tab playing lock overlay */}
      {otherTabPlaying && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 text-white text-sm md:text-base text-center px-6">
          <div>
            <div className="text-3xl mb-2">⏸</div>
            <div>تشغيل الفيديو متوقّف لأنه يتم تشغيله في علامة تبويب أخرى.</div>
            <div className="opacity-70 mt-1">أغلق علامات التبويب الأخرى ثم اضغط تشغيل من هنا.</div>
          </div>
        </div>
      )}

      {/* Skip flash indicator */}
      {skipFlash && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="bg-black/50 text-white text-2xl font-bold px-6 py-3 rounded-xl animate-ping-once">
            {skipFlash === '+10' ? '+10s ⏩' : '-10s ⏪'}
          </div>
        </div>
      )}

      {/* Buffering spinner */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Centre play button */}
      {!playing && !buffering && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center text-white text-3xl">
            ▶
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        dir="ltr"
        className={`absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Seek bar — drag supported via pointer capture */}
        <div
          ref={seekBarRef}
          className={`relative h-1.5 bg-white/20 rounded-full mb-3 ${allowSeek ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          onPointerDown={onSeekPointerDown}
          onPointerMove={onSeekPointerMove}
          onPointerUp={onSeekPointerUp}
          onPointerCancel={onSeekPointerUp}
          onMouseLeave={() => setSeekTooltip(prev => ({ ...prev, visible: false }))}
        >
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow"
            style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
          />
          {seekTooltip.visible && (
            <div
              ref={seekTooltipRef}
              className="absolute -top-8 bg-black/80 text-white text-xs px-2 py-0.5 rounded pointer-events-none"
              style={{ left: `${seekTooltip.x}%`, transform: 'translateX(-50%)' }}
            >
              {formatTime(seekTooltip.time)}
            </div>
          )}
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-3 text-white text-sm" dir="ltr">
          {/* Play/pause */}
          <button onClick={togglePlay} className="hover:text-blue-400 transition-colors text-lg leading-none">
            {playing ? '⏸' : '▶'}
          </button>

          {/* Skip back */}
          {allowSkip && (
            <button onClick={() => skip(-10)} className="hover:text-blue-400 transition-colors text-sm">⏪</button>
          )}

          {/* Skip forward */}
          {allowSkip && (
            <button onClick={() => skip(10)} className="hover:text-blue-400 transition-colors text-sm">⏩</button>
          )}

          {/* Time */}
          <span className="font-mono text-xs tabular-nums text-gray-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          {allowVolume && (
            <div
              className="relative flex items-center gap-1"
              onMouseEnter={() => setShowVolume(true)}
              onMouseLeave={() => setShowVolume(false)}
            >
              <button onClick={toggleMute} className="hover:text-blue-400 transition-colors">
                {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </button>
              {showVolume && (
                <div ref={volumeBarRef} className="absolute bottom-8 left-0 bg-gray-900 rounded-lg p-2 shadow-xl" style={{ width: '32px' }}>
                  <input
                    type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                    onChange={e => { adjustVolume(parseFloat(e.target.value) - (videoRef.current?.volume ?? volume)); }}
                    className="h-20 cursor-pointer accent-blue-500"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '100%' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Speed */}
          {allowSpeed && (
            <div className="relative">
              <button onClick={() => setShowSpeed(p => !p)} className="hover:text-blue-400 transition-colors text-xs font-mono">
                {speed}×
              </button>
              {showSpeed && (
                <div className="absolute bottom-8 right-0 bg-gray-900 rounded-lg shadow-xl overflow-hidden z-50">
                  {SPEED_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => setSpeedValue(s)}
                      className={`block w-full px-4 py-1.5 text-xs text-left hover:bg-gray-700 transition-colors ${s === speed ? 'text-blue-400 font-bold' : ''}`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fullscreen */}
          {allowFullscreen && (
            <button onClick={toggleFullscreen} className="hover:text-blue-400 transition-colors">
              {fullscreen ? '⊡' : '⛶'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
