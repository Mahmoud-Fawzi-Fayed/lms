import { NextRequest } from 'next/server';
import { getAuthUser, apiError, apiSuccess, rateLimit } from '@/lib/api-helpers';
import { Enrollment, Course } from '@/models';
import { generateContentToken, fingerprintFromRequest, clientIp, type TokenKind } from '@/lib/content-token';
import connectDB from '@/lib/db';
import { isSameAcademicYear } from '@/lib/academic-year';

// GET /api/courses/[id]/content-token?lessonId=xxx&kind=raw|stream
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const user = await getAuthUser(req);
    if (!user) return apiError('يجب تسجيل الدخول', 401);

    // ── Per-IP issuance flood protection ────────────────────────────────────
    // Stops a single IP (datacentre / abuse box) from burning thousands of
    // tokens to map every lesson in the catalogue.
    const ip = clientIp(req);
    if (ip && !rateLimit('token-issue-ip:' + ip, 60, 60_000)) {
      return apiError('تجاوزت عدد الطلبات المسموح بها، حاول مرة أخرى لاحقًا', 429);
    }
    // Tighter per-user issuance cap — even a legit user shouldn't need >120/hr.
    if (!rateLimit('token-issue-user:' + user.id, 120, 60 * 60_000)) {
      return apiError('تم إصدار عدد كبير من الروابط، انتظر قليلًا', 429);
    }

    const lessonId = req.nextUrl.searchParams.get('lessonId');
    if (!lessonId) return apiError('معرف الدرس مطلوب', 400);

    // Allow caller to request a stream token (long TTL) for video, otherwise
    // default to raw (short TTL).
    const kindParam = req.nextUrl.searchParams.get('kind');
    const kind: TokenKind = kindParam === 'stream' ? 'stream' : 'raw';

    const course = await Course.findById(params.id)
      .select('targetYear instructor modules.lessons._id modules.lessons.isPreview modules.lessons.type')
      .lean();
    if (!course) return apiError('الكورس غير موجود', 404);

    if (user.role === 'student' && course.targetYear && !isSameAcademicYear(user.academicYear, course.targetYear as any)) {
      return apiError('هذا المحتوى غير متاح لسنتك الدراسية', 403);
    }

    let lessonExists = false;
    let isPreviewLesson = false;
    let lessonType: string | undefined;
    for (const mod of (course as any).modules || []) {
      const lesson = (mod.lessons || []).find((l: any) => l._id?.toString() === lessonId);
      if (lesson) {
        lessonExists   = true;
        isPreviewLesson = Boolean(lesson.isPreview);
        lessonType     = lesson.type;
        break;
      }
    }

    if (!lessonExists) return apiError('الدرس غير موجود', 404);

    // Refuse to issue a raw token for a video lesson and vice-versa — narrows
    // the cross-mode attack surface at the source.
    if (kind === 'raw' && lessonType === 'video') {
      return apiError('نوع الرابط غير متطابق مع نوع الدرس', 400);
    }
    if (kind === 'stream' && lessonType === 'pdf') {
      return apiError('نوع الرابط غير متطابق مع نوع الدرس', 400);
    }

    const fp = fingerprintFromRequest(req);
    const isOwnerOrAdmin = user.role === 'admin' || (user.role === 'instructor' && String((course as any).instructor) === user.id);

    if (isOwnerOrAdmin) {
      const token = generateContentToken(user.id, params.id, lessonId, fp, kind);
      return apiSuccess({ token });
    }

    if (isPreviewLesson) {
      const token = generateContentToken(user.id, params.id, lessonId, fp, kind);
      return apiSuccess({ token });
    }

    // Verify enrollment
    const enrollment = await Enrollment.findOne({
      user: user.id,
      course: params.id,
      status: 'active',
    });

    if (!enrollment) return apiError('أنت غير مشترك في هذا الكورس', 403);

    const token = generateContentToken(user.id, params.id, lessonId, fp, kind);
    return apiSuccess({ token });
  } catch (error: any) {
    console.error("API error:", error); return apiError("Internal server error", 500);
  }
}
