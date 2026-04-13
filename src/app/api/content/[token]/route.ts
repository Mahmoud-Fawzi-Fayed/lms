import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, apiError } from '@/lib/api-helpers';
import { Course, Enrollment } from '@/models';
import { verifyContentToken } from '@/lib/content-token';
import connectDB from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';
import { isSameAcademicYear } from '@/lib/academic-year';
import mongoose from 'mongoose';

// GET /api/content/[token]         → HTML wrapper player page (video/pdf) or HTML text page
// GET /api/content/[token]?mode=raw → raw binary (consumed by the HTML page only)
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

    const decoded = verifyContentToken(token);
    if (!decoded) return apiError('رابط المحتوى غير صالح أو منتهي الصلاحية', 403);

    if (decoded.userId !== user.id) {
      return apiError('ليس لديك صلاحية الوصول', 403);
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

    // ── TEXT LESSON ──────────────────────────────────────────────────────────
    if (lessonDoc.type === 'text') {
      const content = lessonDoc.content || '<p>لا يوجد محتوى لهذا الدرس</p>';
      return new NextResponse(buildTextHtml(lessonDoc.title || 'الدرس', content), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'X-Frame-Options': 'SAMEORIGIN',
        },
      });
    }

    // ── FILE LESSON (video / pdf) ─────────────────────────────────────────────
    const lessonFilePath: string | undefined = lessonDoc.filePath;
    if (!lessonFilePath) {
      console.error('[content] filePath missing. courseId:', decoded.courseId, 'lessonId:', decoded.lessonId);
      return apiError('ملف المحتوى غير موجود – يرجى رفع الملف أولاً', 404);
    }

    // mode=raw → serve actual binary (called by the HTML wrapper page internally)
    if (mode === 'raw') {
      return await serveRawFile(req, lessonFilePath);
    }

    // Default → serve protected HTML wrapper with embedded player
    const rawUrl = `/api/content/${token}?mode=raw`;
    return new NextResponse(buildPlayerHtml(lessonDoc.type, rawUrl, lessonDoc.title || ''), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });

  } catch (error: any) {
    console.error('Content serve error:', error);
    return apiError('فشل تحميل المحتوى', 500);
  }
}

// ── HTML Builders ─────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildTextHtml(title: string, content: string) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 2rem; max-width: 900px; margin: 0 auto; background: #f9fafb; color: #111; line-height: 1.8; }
    h1 { font-size: 1.4rem; margin-bottom: 1.5rem; padding-bottom: .5rem; border-bottom: 2px solid #3b82f6; color: #1e40af; }
    .content { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div class="content">${content}</div>
</body>
</html>`;
}

function buildPlayerHtml(type: string, rawUrl: string, title: string) {
  if (type === 'video') {
    return `<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    video { width: 100%; max-height: 100vh; outline: none; }
    #msg { color: #fff; font-family: Arial; padding: 2rem; }
  </style>
</head>
<body>
  <video id="v"
    controls
    autoplay
    controlsList="nodownload noremoteplayback"
    disablePictureInPicture
    oncontextmenu="return false"
  ></video>
  <div id="msg" style="display:none">جاري التحميل...</div>
  <script>
    /* Fetch as blob so the raw URL never appears as a playable link in DevTools Elements */
    const v = document.getElementById('v');
    const msg = document.getElementById('msg');
    msg.style.display = 'block';
    fetch('${rawUrl}', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => { v.src = URL.createObjectURL(b); msg.style.display = 'none'; })
      .catch(() => { msg.textContent = 'فشل تحميل الفيديو – حاول مجدداً'; });
  </script>
</body>
</html>`;
  }

  if (type === 'pdf') {
    return `<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    * { margin: 0; padding: 0; }
    body { background: #525659; display: flex; align-items: center; justify-content: center; height: 100vh; }
    #wrap { width: 100vw; height: 100vh; }
    iframe { width: 100%; height: 100%; border: none; }
    #msg { color: #fff; font-family: Arial; padding: 2rem; }
  </style>
</head>
<body>
  <div id="wrap"><div id="msg">جاري التحميل...</div></div>
  <script>
    fetch('${rawUrl}', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => {
        const blobUrl = URL.createObjectURL(b);
        const iframe = document.createElement('iframe');
        /* #toolbar=0 hides Chrome/Edge PDF toolbar (download button) */
        iframe.src = blobUrl + '#toolbar=0&navpanes=0&scrollbar=1';
        document.getElementById('wrap').replaceWith(iframe);
      })
      .catch(() => { document.getElementById('msg').textContent = 'فشل تحميل الملف – حاول مجدداً'; });
  </script>
</body>
</html>`;
  }

  return `<!DOCTYPE html><html><body style="font-family:Arial;padding:2rem"><p>نوع المحتوى غير مدعوم</p></body></html>`;
}

// ── Raw file server (range-request aware) ────────────────────────────────────

async function serveRawFile(req: NextRequest, filePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  const fileSize = fileBuffer.length;
  const rangeHeader = req.headers.get('range');

  const baseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
  };

  if (rangeHeader && contentType.startsWith('video/')) {
    const match = rangeHeader.match(/bytes=(\d+)-?(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      if (start >= fileSize) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
      }
      const clampedEnd = Math.min(end, fileSize - 1);
      const chunk = fileBuffer.slice(start, clampedEnd + 1);
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Type': contentType,
          'Content-Length': chunk.length.toString(),
          'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }
  }

  return new NextResponse(fileBuffer, {
    headers: {
      ...baseHeaders,
      'Content-Type': contentType,
      'Content-Length': fileSize.toString(),
      'Accept-Ranges': 'bytes',
    },
  });
}
