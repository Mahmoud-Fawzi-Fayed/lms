import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, apiError } from '@/lib/api-helpers';
import { Course, Enrollment } from '@/models';
import { verifyContentToken } from '@/lib/content-token';
import connectDB from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';
import { isSameAcademicYear } from '@/lib/academic-year';

// GET /api/content/[token] - Serve protected content with signed token
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    await connectDB();

    const user = await getAuthUser(req);
    if (!user) return apiError('يجب تسجيل الدخول', 401);

    const { token } = params;

    // Decode and verify the content token
    const decoded = verifyContentToken(token);
    if (!decoded) return apiError('رابط المحتوى غير صالح أو منتهي الصلاحية', 403);

    // Verify user has access
    if (decoded.userId !== user.id) {
      return apiError('ليس لديك صلاحية الوصول', 403);
    }

    // Check enrollment
    const enrollment = await Enrollment.findOne({
      user: user.id,
      course: decoded.courseId,
      status: 'active',
    });

    if (!enrollment) return apiError('أنت غير مشترك في هذا الكورس', 403);

    // Get the lesson file path
    const course = await Course.findById(decoded.courseId).select('targetYear modules.lessons._id +modules.lessons.filePath');
    if (!course) return apiError('الكورس غير موجود', 404);

    if (user.role === 'student' && course.targetYear && !isSameAcademicYear(user.academicYear, course.targetYear)) {
      return apiError('هذا المحتوى غير متاح لسنتك الدراسية', 403);
    }

    let lessonFilePath: string | undefined;
    for (const mod of course.modules) {
      const lesson = mod.lessons.find(
        (l: any) => l._id?.toString() === decoded.lessonId
      );
      if (lesson) {
        lessonFilePath = lesson.filePath;
        break;
      }
    }

    if (!lessonFilePath) return apiError('المحتوى غير موجود', 404);

    // Serve the file
    const fileBuffer = await fs.readFile(lessonFilePath);
    const ext = path.extname(lessonFilePath).toLowerCase();

    const contentTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    const fileSize = fileBuffer.length;
    const rangeHeader = req.headers.get('range');

    // Support byte-range requests — required for browser video seeking
    if (rangeHeader && contentType.startsWith('video/')) {
      const match = rangeHeader.match(/bytes=(\d+)-?(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end   = match[2] ? parseInt(match[2], 10) : fileSize - 1;

        if (start >= fileSize) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` },
          });
        }

        const clampedEnd = Math.min(end, fileSize - 1);
        const chunk = fileBuffer.slice(start, clampedEnd + 1);

        return new NextResponse(chunk, {
          status: 206,
          headers: {
            'Content-Type':        contentType,
            'Content-Length':      chunk.length.toString(),
            'Content-Range':       `bytes ${start}-${clampedEnd}/${fileSize}`,
            'Accept-Ranges':       'bytes',
            'Cache-Control':       'no-store, no-cache, must-revalidate, private',
            'Pragma':              'no-cache',
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type':        contentType,
        'Content-Length':      fileSize.toString(),
        'Accept-Ranges':       'bytes',
        'Cache-Control':       'no-store, no-cache, must-revalidate, private',
        'Pragma':              'no-cache',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Content serve error:', error);
    return apiError('فشل تحميل المحتوى', 500);
  }
}
