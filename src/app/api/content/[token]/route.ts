import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, apiError, rateLimit } from '@/lib/api-helpers';
import { Course, Enrollment, ContentAccess, User } from '@/models';
import { verifyContentToken, fingerprintFromRequest, fingerprintMatches, clientIp } from '@/lib/content-token';
import connectDB from '@/lib/db';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { isSameAcademicYear } from '@/lib/academic-year';
import mongoose from 'mongoose';
import { watermarkPdf } from '@/lib/pdf-watermark';

// ── Per-token rate limiter (in-memory) ───────────────────────────────────────
// Caps how many times a single PDF token can be fetched as raw bytes (full file
// reads). Defeats a leaked-token script that loops the fetch to mass-download.
// Range/stream video requests are NOT counted here (a single video play issues
// dozens of Range requests); they're protected by Sec-Fetch-Dest=video instead.
const tokenHits = new Map<string, { count: number; firstSeen: number }>();
const watermarkedPdfCache = new Map<string, { bytes: Uint8Array; expiresAt: number }>();
// Small lenient cap: React strict-mode in dev double-mounts, browser back/forward
// re-renders the PDF, and pdf.js can issue a second fetch on parse errors.
// 3 hits/hour still blocks any meaningful mass-scraping (a course with 100
// PDF lessons would need 100 tokens × 1 hour to scrape — and each token is
// fingerprint+IP+user bound), while letting normal users navigate freely.
const TOKEN_RAW_LIMIT = 3;
const TOKEN_RAW_WINDOW = 60 * 60_000; // 1 hour
const WATERMARK_CACHE_TTL = 5 * 60_000; // 5 minutes
const WATERMARK_CACHE_MAX = 24;
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of tokenHits) {
      if (now - v.firstSeen > TOKEN_RAW_WINDOW) tokenHits.delete(k);
    }
    for (const [k, v] of watermarkedPdfCache) {
      if (now > v.expiresAt) watermarkedPdfCache.delete(k);
    }
  }, 10 * 60_000);
}
function bumpTokenHit(token: string): boolean {
  const now = Date.now();
  const rec = tokenHits.get(token);
  if (!rec || now - rec.firstSeen > TOKEN_RAW_WINDOW) {
    tokenHits.set(token, { count: 1, firstSeen: now });
    return true;
  }
  rec.count++;
  return rec.count <= TOKEN_RAW_LIMIT;
}

function getCachedWatermarkedPdf(key: string): Uint8Array | null {
  const hit = watermarkedPdfCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    watermarkedPdfCache.delete(key);
    return null;
  }
  return hit.bytes;
}

function setCachedWatermarkedPdf(key: string, bytes: Uint8Array) {
  if (watermarkedPdfCache.size >= WATERMARK_CACHE_MAX) {
    const oldestKey = watermarkedPdfCache.keys().next().value;
    if (oldestKey) watermarkedPdfCache.delete(oldestKey);
  }
  watermarkedPdfCache.set(key, { bytes, expiresAt: Date.now() + WATERMARK_CACHE_TTL });
}

// GET /api/content/[token]?mode=raw  → raw binary (only via JS fetch with custom header)
// GET /api/content/[token]            → redirect / deny direct browser access
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    await connectDB();

    const user = await getAuthUser(req);
    if (!user) return apiError('يجب تسجيل الدخول', 401);

    const { token } = params;
    const mode = req.nextUrl.searchParams.get('mode');

    // ── Fetch Metadata Request Headers (RFC draft) ────────────────────────
    // Browsers set these automatically and they cannot be set by fetch() in a same-origin
    // page (forbidden header names). This is our strongest defense against curl / direct
    // "Copy as cURL" / DevTools fetch download attempts by authenticated users.
    const secFetchSite = req.headers.get('sec-fetch-site'); // expected: same-origin
    const secFetchDest = req.headers.get('sec-fetch-dest'); // expected: video | empty | iframe
    const secFetchMode = req.headers.get('sec-fetch-mode'); // expected: cors | no-cors
    // Reject browser pre-fetch / prerender requests which can fire without user gesture
    // and would burn a token-hit on a leaked URL.
    if (req.headers.get('purpose') === 'prefetch' || req.headers.get('sec-purpose')?.includes('prefetch')) {
      return apiError('طلبات التحميل المسبق غير مسموح بها', 403);
    }

    // mode=raw  → JS fetch with custom header (PDFs, text) → dest must be 'empty'
    // mode=stream → browser-native <video> streaming → dest must be 'video'
    const isRawMode =
      mode === 'raw' &&
      req.headers.get('X-Content-Request') === '1' &&
      secFetchDest === 'empty' &&
      secFetchMode === 'cors' &&
      secFetchSite === 'same-origin';
    const isStreamMode =
      mode === 'stream' &&
      secFetchDest === 'video' &&
      (secFetchMode === 'no-cors' || secFetchMode === 'cors') &&
      secFetchSite === 'same-origin';

    // ── Block direct browser navigation ──────────────────────────────
    if (!isRawMode && !isStreamMode) {
      return new NextResponse(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>غير مسموح</title></head>` +
        `<body style="font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:80vh;text-align:center">` +
        `<div><h2 style="color:#dc2626">⛔ الوصول المباشر غير مسموح</h2>` +
        `<p style="color:#64748b;margin-top:1rem">الرجاء الوصول للمحتوى من صفحة الكورس</p>` +
        `<a href="/courses" style="display:inline-block;margin-top:1.5rem;padding:10px 28px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">العودة للكورسات</a>` +
        `</div></body></html>`,
        { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const decoded = verifyContentToken(token);
    if (!decoded) return apiError('رابط المحتوى غير صالح أو منتهي الصلاحية', 403);

    if (decoded.userId !== user.id) {
      return apiError('ليس لديك صلاحية الوصول', 403);
    }

    // Token kind ↔ request mode cross-check. The issuance route already binds a
    // token to a file type, but we re-check here so a `kind=stream` token cannot
    // be replayed against `?mode=raw` (or vice versa) even if a future change
    // accidentally loosens issuance.
    if (decoded.kind === 'raw' && !isRawMode) {
      return apiError('وضع الطلب لا يطابق نوع الرابط', 403);
    }
    if (decoded.kind === 'stream' && !isStreamMode) {
      return apiError('وضع الطلب لا يطابق نوع الرابط', 403);
    }

    // Session-fingerprint binding: a token leaked to another machine / browser
    // fails here even if the cookie was copied too.
    const currentFingerprint = fingerprintFromRequest(req);
    if (!fingerprintMatches(decoded, currentFingerprint)) {
      return apiError('الجلسة غير مطابقة للرابط', 403);
    }

    // Per-user global rate limit on raw fetches (defense against a user issuing
    // many tokens and scraping every lesson in a course). 60/hr is generous.
    if (isRawMode && !rateLimit('content-raw:' + user.id, 60, 60 * 60_000)) {
      return apiError('تجاوزت عدد طلبات تحميل المحتوى المسموح بها', 429);
    }

    // ── Concurrent-IP diversity check ─────────────────────────────────────
    // Account-sharing detection: if the same user has fetched content from
    // more than N distinct IP prefixes in the past hour, that's almost always
    // a single account being passed around. We auto-flag and lock further
    // raw access for the cooldown window.
    if (isRawMode) {
      try {
        const hourAgo = new Date(Date.now() - 60 * 60_000);
        const ips = await ContentAccess.distinct('ip', {
          user: new mongoose.Types.ObjectId(user.id),
          createdAt: { $gte: hourAgo },
        });
        const prefixes = new Set(
          (ips as string[])
            .map((s) => {
              if (!s) return '';
              if (s.includes(':')) return s.split(':').slice(0, 4).join(':');
              const p = s.split('.');
              return p.length === 4 ? p.slice(0, 3).join('.') : '';
            })
            .filter(Boolean),
        );
        // Add the current request's prefix.
        const cur = clientIp(req);
        const curPref = cur.includes(':')
          ? cur.split(':').slice(0, 4).join(':')
          : cur.split('.').slice(0, 3).join('.');
        if (curPref) prefixes.add(curPref);

        if (prefixes.size > 3) {
          // Auto-flag the user for review; admin dashboard can review later.
          await User.updateOne(
            { _id: user.id },
            { $set: { suspiciousFlag: 'multi-ip-content-access', suspiciousAt: new Date() } },
          ).catch(() => {});
          return apiError('تم رصد نشاط غير عادي على حسابك. تواصل مع الدعم.', 423);
        }
      } catch (err) {
        // Don't block legitimate users if the audit collection is unavailable.
        console.error('[content] IP-diversity check failed:', err);
      }
    }

    // Raw collection query — bypasses Mongoose select:false on nested filePath
    const courseDoc = await Course.collection.findOne(
      { _id: new mongoose.Types.ObjectId(decoded.courseId) },
      { projection: { instructor: 1, targetYear: 1, 'modules.lessons': 1 } }
    );
    if (!courseDoc) return apiError('الكورس غير موجود', 404);

    const isOwnerOrAdmin =
      user.role === 'admin' ||
      (user.role === 'instructor' && String(courseDoc.instructor) === user.id);

    // Find the lesson
    let lessonDoc: any = null;
    for (const mod of courseDoc.modules || []) {
      const lesson = (mod.lessons || []).find(
        (l: any) => l._id?.toString() === decoded.lessonId
      );
      if (lesson) { lessonDoc = lesson; break; }
    }

    if (!lessonDoc) return apiError('الدرس غير موجود', 404);

    const isPreviewLesson = Boolean(lessonDoc.isPreview);

    // Year access check (students only)
    if (user.role === 'student' && courseDoc.targetYear &&
        !isSameAcademicYear(user.academicYear, courseDoc.targetYear)) {
      return apiError('هذا المحتوى غير متاح لسنتك الدراسية', 403);
    }

    // Enrollment check — skip for owners/admin and free-preview lessons
    if (!isOwnerOrAdmin && !isPreviewLesson) {
      const enrollment = await Enrollment.findOne({
        user: user.id,
        course: decoded.courseId,
        status: 'active',
      });
      if (!enrollment) return apiError('أنت غير مشترك في هذا الكورس', 403);
    }

    // ── FILE LESSON (video / pdf) ─────────────────────────────────────────────
    // Check filePath FIRST — if a file was uploaded it takes priority over lesson.type.
    // This handles the case where type was 'text' before an upload and wasn't re-saved.
    const lessonFilePath: string | undefined = lessonDoc.filePath;

    // ── TEXT LESSON (no file uploaded) ───────────────────────────────────────
    if (!lessonFilePath) {
      if (lessonDoc.type === 'text') {
        const content = lessonDoc.content || '<p>لا يوجد محتوى لهذا الدرس</p>';
        return NextResponse.json(
          { success: true, data: { type: 'text', title: lessonDoc.title || 'الدرس', content } },
          { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } }
        );
      }
      console.error('[content] filePath missing. courseId:', decoded.courseId, 'lessonId:', decoded.lessonId);
      return apiError('ملف المحتوى غير موجود – يرجى رفع الملف أولاً', 404);
    }

    // Path traversal guard: ensure lessonFilePath resolves within the uploads directory.
    // Also remap legacy absolute paths (e.g. /var/www/lms/uploads/...) to the current
    // runtime uploads directory so old content remains accessible after deployment moves.
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    let resolvedFilePath = path.resolve(lessonFilePath);
    const inUploads = (p: string) => p === uploadsDir || p.startsWith(uploadsDir + path.sep);

    if (!inUploads(resolvedFilePath)) {
      const normalized = lessonFilePath.replace(/\\/g, '/');
      const marker = '/uploads/';
      const markerIndex = normalized.lastIndexOf(marker);
      if (markerIndex !== -1) {
        const relativeToUploads = normalized.slice(markerIndex + marker.length);
        const remapped = path.resolve(uploadsDir, relativeToUploads);
        if (inUploads(remapped)) {
          resolvedFilePath = remapped;
        }
      }
    }

    if (!inUploads(resolvedFilePath)) {
      console.error('[content] path traversal attempt blocked. filePath:', lessonFilePath);
      return apiError('مسار الملف غير صالح', 403);
    }

    // ── Mode/type cross-check ────────────────────────────────────────────────
    // mode=stream is for browser-native <video> only. mode=raw is for the in-browser
    // PDF.js renderer only. Cross-using them lets a student fetch the underlying video
    // bytes via a console fetch (which trivially passes the Sec-Fetch-* checks for raw).
    const ext = path.extname(resolvedFilePath).toLowerCase();
    const isVideoFile = ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.avi', '.mkv'].includes(ext);
    const isPdfFile = ext === '.pdf';
    if (isStreamMode && !isVideoFile) {
      return apiError('وضع البث غير مسموح لهذا النوع', 403);
    }
    if (isRawMode && !isPdfFile) {
      // Block: cannot fetch video bytes via raw mode from JS console.
      return apiError('الوصول المباشر للفيديو غير مسموح', 403);
    }

    // Rate-limit only full raw fetches per token. PDF.js may issue many Range
    // chunk requests for a single open; counting each chunk would break normal viewing.
    const isRangeRequest = Boolean(req.headers.get('range'));
    if (isRawMode && !isRangeRequest && !bumpTokenHit(token)) {
      return apiError('تم تجاوز الحد المسموح من الطلبات لهذا المحتوى', 429);
    }

    // Raw PDF path: watermark the bytes with the requester's email/id before serving
    // so that a Network-tab "Save response as" still produces a forensically-tagged copy.
    if (isRawMode && isPdfFile) {
      try {
        const lstat = await fs.lstat(resolvedFilePath);
        if (lstat.isSymbolicLink()) return apiError('forbidden', 403);
        if (!lstat.isFile()) return apiError('not a file', 400);
        const stamp = user.email || user.id;
        // Richer second line: IP + UTC timestamp, so a leaked PDF traces back to
        // the exact session and not just "some download by this user".
        const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
        const meta = `${clientIp(req) || 'unknown'} · ${ts}`;
        const cacheKey = `${token}:${lstat.mtimeMs}:${stamp}`;
        let stamped = getCachedWatermarkedPdf(cacheKey);
        if (!stamped) {
          const original = await fs.readFile(resolvedFilePath);
          stamped = await watermarkPdf(original, stamp, meta);
          setCachedWatermarkedPdf(cacheKey, stamped);
        }
        await logAccess(user.id, decoded.courseId, decoded.lessonId, 'raw', req, stamped.byteLength);
        return new NextResponse(Buffer.from(stamped) as any, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(stamped.byteLength),
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "frame-ancestors 'none'",
          },
        });
      } catch (err) {
        console.error('[content] watermark serve failed, falling back to raw stream:', err);
        // fall through to streaming the original file
      }
    }

    // Audit-log stream first-segment requests (no Range header == initial probe).
    if (isStreamMode && !req.headers.get('range')) {
      await logAccess(user.id, decoded.courseId, decoded.lessonId, 'stream', req);
    }
    return await serveRawFile(req, resolvedFilePath, isStreamMode);

  } catch (error: any) {
    console.error('Content serve error:', error);
    return apiError('فشل تحميل المحتوى', 500);
  }
}

// ── Audit log ────────────────────────────────────────────────────────────────
// Append-only record of every successful content access. Never blocks the user
// if the write fails (we still want them to see the lesson).
async function logAccess(
  userId: string,
  courseId: string,
  lessonId: string,
  mode: 'raw' | 'stream',
  req: NextRequest,
  bytes?: number,
) {
  try {
    await ContentAccess.create({
      user: new mongoose.Types.ObjectId(userId),
      course: new mongoose.Types.ObjectId(courseId),
      lesson: new mongoose.Types.ObjectId(lessonId),
      mode,
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent') || '',
      bytes,
    });
  } catch (err) {
    console.error('[content] audit write failed:', err);
  }
}

// ── Raw file server (stream-based, range-request aware) ──────────────────────// Uses createReadStream so large video files (up to 1.5 GB) are never loaded
// fully into RAM — each request only buffers the bytes the client asked for.
async function serveRawFile(req: NextRequest, filePath: string, streamMode = false) {
  // Use lstat to detect symlinks before opening — prevents an attacker who can write
  // a symlink under uploads/ from exfiltrating arbitrary files on disk.
  const lstat = await fs.lstat(filePath);
  if (lstat.isSymbolicLink()) {
    console.error('[content] symlink rejected:', filePath);
    return new NextResponse('forbidden', { status: 403 });
  }
  if (!lstat.isFile()) {
    return new NextResponse('not a file', { status: 400 });
  }
  const fileSize = lstat.size;
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';

  // stream mode is only valid for video — reject PDFs/etc. from browser-native requests
  if (streamMode && !contentType.startsWith('video/')) {
    return new NextResponse('streaming is only supported for video content', { status: 400 });
  }

  const rangeHeader = req.headers.get('range');

  const baseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    // Prevent embedding in iframes on external sites
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
  };

  /** Wrap a Node.js ReadStream in a Web ReadableStream */
  function buildStream(start: number, end: number): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        const nodeStream = createReadStream(filePath, { start, end });
        nodeStream.on('data', (chunk) =>
          controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        );
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
    });
  }

  if (rangeHeader && contentType.startsWith('video/')) {
    const match = rangeHeader.match(/bytes=(\d+)-?(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      if (start >= fileSize) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
      }
      const clampedEnd = Math.min(end, fileSize - 1);
      const chunkSize = clampedEnd - start + 1;
      return new NextResponse(buildStream(start, clampedEnd) as any, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Type': contentType,
          'Content-Length': chunkSize.toString(),
          'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
        },
      });
    }
  }

  return new NextResponse(buildStream(0, fileSize - 1) as any, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Type': contentType,
      'Content-Length': fileSize.toString(),
    },
  });
}
