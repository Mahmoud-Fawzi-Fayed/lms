'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

export default function SecureVideoPlayer({
  src,
  title,
  controls,
  onProgress,
  onComplete,
}: SecureVideoPlayerProps) {
  // Defaults: all features enabled unless explicitly disabled
  const allowSpeed      = controls?.allowSpeed      !== false;
  const allowSkip       = controls?.allowSkip       !== false;
  const allowFullscreen = controls?.allowFullscreen !== false;
  const allowSeek       = controls?.allowSeek       !== false;
  const allowVolume     = controls?.allowVolume     !== false;
  const forceFocus      = controls?.forceFocus      === true;

  // Keep a ref so the always-mounted visibilitychange/blur handlers see the latest value
  const forceFocusRef = useRef(forceFocus);
  useEffect(() => { forceFocusRef.current = forceFocus; }, [forceFocus]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  const animFrameRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [blobSrc, setBlobSrc] = useState<string>('');
  const [loadError, setLoadError] = useState(false);
  const [seekTooltip, setSeekTooltip] = useState({ visible: false, x: 0, time: 0 });
  const [skipFlash, setSkipFlash] = useState<'back' | 'forward' | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onProgress?.(video.currentTime, video.duration);
      if (video.duration && video.currentTime / video.duration >= 0.9) onComplete?.();
    };
    const onLoaded = () => setDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onBuf = () => {
      if (video.buffered.length > 0)
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
    };
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('progress', onBuf);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('progress', onBuf);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [onProgress, onComplete]);

  // Fetch video as blob to hide raw URL; revoke immediately after load starts
  useEffect(() => {
    setBlobSrc('');
    setLoadError(false);
    if (!src) return;
    const video = videoRef.current;
    fetch(src, { credentials: 'include', headers: { 'X-Content-Request': '1' } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(b => {
        const url = URL.createObjectURL(b);
        setBlobSrc(url);
        // Revoke blob URL immediately after the video element grabs it
        // The video keeps playing from memory but the URL becomes useless
        if (video) {
          const revokeOnce = () => { URL.revokeObjectURL(url); video.removeEventListener('loadeddata', revokeOnce); };
          video.addEventListener('loadeddata', revokeOnce);
        }
      })
      .catch(() => setLoadError(true));
    // no cleanup revoke needed — we revoke above on loadeddata
  }, [src]);

  // Force-focus: pause when tab is hidden or window loses focus
  // Registered once on mount using a ref so it always reads the latest value
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && forceFocusRef.current) videoRef.current?.pause();
    };
    const handleBlur = () => {
      if (forceFocusRef.current) videoRef.current?.pause();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
    };
  }, []); // intentionally empty — ref keeps value current

  // Canvas rendering loop — paints video frames to <canvas> so no <video> is visible
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (video.readyState >= 2) {
        // Match canvas size to video intrinsic size
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [blobSrc]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft':  if (allowSkip)       { e.preventDefault(); skip(-10); } break;
        case 'ArrowRight': if (allowSkip)       { e.preventDefault(); skip(10);  } break;
        case 'ArrowUp':    if (allowVolume)     { e.preventDefault(); adjustVolume(0.1);  } break;
        case 'ArrowDown':  if (allowVolume)     { e.preventDefault(); adjustVolume(-0.1); } break;
        case 'f': case 'F': if (allowFullscreen){ e.preventDefault(); toggleFullscreen(); } break;
        case 'm': case 'M': if (allowVolume)    { e.preventDefault(); toggleMute();       } break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [allowSkip, allowVolume, allowFullscreen]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setIsPlaying(p => { if (p) setShowControls(false); return p; });
    }, 3000);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const skip = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    // Guard: if duration is NaN or 0 (metadata not ready) use Infinity so browser clamps naturally
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
    v.currentTime = Math.max(0, Math.min(dur, v.currentTime + seconds));
    setSkipFlash(seconds > 0 ? 'forward' : 'back');
    setTimeout(() => setSkipFlash(null), 600);
  };

  const adjustVolume = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const vol = Math.max(0, Math.min(1, v.volume + delta));
    v.volume = vol; v.muted = vol === 0;
    setVolume(vol); setIsMuted(vol === 0);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const vol = parseFloat(e.target.value);
    v.volume = vol; v.muted = vol === 0;
    setVolume(vol); setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    if (!v.muted && volume === 0) { v.volume = 0.5; setVolume(0.5); }
  };

  const changeSpeed = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    document.fullscreenElement ? document.exitFullscreen() : c.requestFullscreen();
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v || !duration) return;
    const rect = bar.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const handleSeekMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekTooltip({ visible: true, x: e.clientX - rect.left, time: ratio * duration });
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  const fmt = (s: number) => {
    if (isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  };

  const VolumeIcon = () => {
    if (isMuted || volume === 0) return (
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    );
    if (volume < 0.5) return (
      <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
    );
    return (
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    );
  };

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="relative bg-black rounded-xl overflow-hidden select-none"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Hidden video element — never visible to user, used as source for canvas */}
      <video
        ref={videoRef}
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}
      >
        {blobSrc && <source src={blobSrc} type="video/mp4" />}
      </video>

      {/* Canvas — renders video frames, right-click shows "Save Image As" not "Save Video As" */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        onContextMenu={e => e.preventDefault()}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        style={{ display: 'block', background: '#000' }}
      />

      {/* Loading / error overlay */}
      {!blobSrc && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black" style={{ zIndex: 5 }}>
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white" style={{ zIndex: 5 }}>
          فشل تحميل الفيديو
        </div>
      )}

      {/* Buffering spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 4 }}>
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Skip flash */}
      {skipFlash && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-1 ${skipFlash === 'back' ? 'left-16' : 'right-16'}`}
          style={{ zIndex: 5 }}
        >
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            {skipFlash === 'back' ? (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              </svg>
            ) : (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
              </svg>
            )}
          </div>
          <span className="text-white text-xs font-bold drop-shadow">{skipFlash === 'back' ? '-10s' : '+10s'}</span>
        </div>
      )}

      {/* Center play overlay */}
      {!isPlaying && !isBuffering && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          style={{ zIndex: 2 }}
          onClick={togglePlay}
        >
          <div className="w-20 h-20 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/60 transition-colors">
            <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 6, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)' }}
      >
        {/* Progress bar */}
        <div className="px-3 pb-1 pt-8">
          <div
            ref={progressRef}
            className={`relative w-full h-1 transition-all duration-150 group/prog ${allowSeek ? 'hover:h-3 cursor-pointer' : 'cursor-default'}`}
            onClick={allowSeek ? handleSeekClick : undefined}
            onMouseMove={allowSeek ? handleSeekMouseMove : undefined}
            onMouseLeave={() => setSeekTooltip(t => ({ ...t, visible: false }))}
          >
            <div className="absolute inset-0 bg-white/20 rounded-full" />
            <div className="absolute top-0 left-0 h-full bg-white/30 rounded-full pointer-events-none" style={{ width: `${buffered}%` }} />
            <div className="absolute top-0 left-0 h-full bg-blue-500 rounded-full pointer-events-none" style={{ width: `${progressPercent}%` }} />
            {allowSeek && (
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover/prog:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${progressPercent}%` }}
              />
            )}
            {allowSeek && seekTooltip.visible && (
              <div
                className="absolute -top-8 -translate-x-1/2 bg-black/90 text-white text-xs px-2 py-0.5 rounded pointer-events-none font-mono whitespace-nowrap"
                style={{ left: seekTooltip.x }}
              >
                {fmt(seekTooltip.time)}
              </div>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between px-3 pb-3 pt-1 gap-2">
          {/* Left */}
          <div className="flex items-center gap-0.5">
            {allowSkip && (
              <button onClick={() => skip(-10)} title="رجوع 10 ثوانٍ" className="flex items-center text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                <span className="text-[10px] font-bold ml-0.5">10</span>
              </button>
            )}

            <button onClick={togglePlay} title="تشغيل/إيقاف (Space)" className="text-white hover:text-blue-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            {allowSkip && (
              <button onClick={() => skip(10)} title="تقديم 10 ثوانٍ" className="flex items-center text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <span className="text-[10px] font-bold mr-0.5">10</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
              </button>
            )}

            {allowVolume && (
              <div className="flex items-center gap-1 group/vol ml-1">
                <button onClick={toggleMute} title="كتم (M)" className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><VolumeIcon /></svg>
                </button>
                <input
                  type="range" min={0} max={1} step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover/vol:w-20 transition-all duration-200 h-1 rounded-lg appearance-none cursor-pointer accent-blue-400"
                  style={{ background: `linear-gradient(to right, #60a5fa ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) ${(isMuted ? 0 : volume) * 100}%)` }}
                />
              </div>
            )}

            <span className="text-white/70 text-xs font-mono whitespace-nowrap px-2">
              {fmt(currentTime)} <span className="text-white/30">/</span> {fmt(duration)}
            </span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-1">
            {title && <span className="text-white/40 text-xs max-w-36 truncate hidden sm:block">{title}</span>}

            {allowSpeed && (
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(v => !v)}
                  className="text-white/80 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-white/10 border border-white/20 hover:border-white/40 transition-colors min-w-[44px] text-center"
                >
                  {playbackRate === 1 ? '1x' : `${playbackRate}x`}
                </button>
                {showSpeedMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-[#1a1a2e]/95 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden shadow-2xl min-w-[100px]">
                    <div className="px-3 py-2 text-white/40 text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">السرعة</div>
                    {SPEED_OPTIONS.map(rate => (
                      <button
                        key={rate}
                        onClick={() => changeSpeed(rate)}
                        className={`w-full px-4 py-2 text-xs text-left flex items-center justify-between transition-colors ${playbackRate === rate ? 'bg-blue-600 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                      >
                        <span>{rate === 1 ? 'عادي' : `${rate}x`}</span>
                        {playbackRate === rate && <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {allowFullscreen && (
              <button onClick={toggleFullscreen} title="ملء الشاشة (F)" className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  {isFullscreen
                    ? <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                    : <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />}
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
