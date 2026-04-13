import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, apiError } from '@/lib/api-helpers';
import { Course, Enrollment } from '@/models';
import { verifyContentToken } from '@/lib/content-token';
import connectDB from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';
import { isSameAcademicYear } from '@/lib/academic-year';
import mongoose from 'mongoose';

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

    // ── Block direct browser navigation ──────────────────────────────
    // Only allow ?mode=raw with our custom header (set by JS fetch in the modal).
    // If someone pastes the URL into the browser address bar, the header won't be there.
    if (mode !== 'raw' || req.headers.get('X-Content-Request') !== '1') {
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
      return NextResponse.json(
        { success: true, data: { type: 'text', title: lessonDoc.title || 'الدرس', content } },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } }
      );
    }

    // ── FILE LESSON (video / pdf) ─────────────────────────────────────────────
    const lessonFilePath: string | undefined = lessonDoc.filePath;
    if (!lessonFilePath) {
      console.error('[content] filePath missing. courseId:', decoded.courseId, 'lessonId:', decoded.lessonId);
      return apiError('ملف المحتوى غير موجود – يرجى رفع الملف أولاً', 404);
    }

    return await serveRawFile(req, lessonFilePath);

  } catch (error: any) {
    console.error('Content serve error:', error);
    return apiError('فشل تحميل المحتوى', 500);
  }
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
