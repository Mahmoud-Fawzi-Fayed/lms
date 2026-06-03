import { NextRequest } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { Course } from '@/models';
import { registerSchema } from '@/lib/validations';
import { rateLimit, apiError, apiSuccess } from '@/lib/api-helpers';
import { validatePaymobConfig } from '@/lib/paymob';
import { getAcademicYearVariants } from '@/lib/academic-year';

export async function POST(req: NextRequest) {
  try {
    // BUG-FIX: normalize IP from X-Forwarded-For list (take first hop) and fall back
    // to X-Real-IP. Previous implementation used the raw header value, so the same
    // client behind a proxy chain could fragment into multiple rate-limit buckets.
    const xff = req.headers.get('x-forwarded-for');
    const ip =
      (xff ? xff.split(',')[0].trim() : '') ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
      return apiError('محاولات تسجيل كثيرة جداً. حاول مرة أخرى لاحقاً.', 429);
    }

    let body: any;
    try { body = await req.json(); } catch { return apiError('بيانات غير صالحة', 400); }
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    await connectDB();

    // Validate each selected course exists, is published, AND targets the
    // student's declared academic year (or has no targetYear, i.e. universal).
    // BUG-FIX: previously any published course was accepted, so a student could
    // register against courses for a different year, then immediately fail every
    // year-gated content/payment check. Catch the mismatch here.
    const courseIds = parsed.data.courseIds || [];
    if (courseIds.length > 0) {
      const yearVariants = getAcademicYearVariants(parsed.data.academicYear);
      const courses = await Course.find({
        _id: { $in: courseIds },
        isPublished: true,
        $or: [
          { targetYear: { $exists: false } },
          { targetYear: null },
          { targetYear: '' },
          { targetYear: { $in: yearVariants } },
        ],
      }).select('_id').lean();

      if (courses.length !== courseIds.length) {
        return apiError('أحد الكورسات المحددة غير موجود أو غير متاح لسنتك الدراسية', 404);
      }
    }

    // If the student selected courses, verify Paymob is properly configured
    // BEFORE creating the account — so we never end up with an orphaned account.
    if (courseIds.length > 0) {
      const paymobError = validatePaymobConfig();
      if (paymobError) {
        return apiError(`خدمة الدفع غير متاحة حالياً. تواصل مع الدعم. (${paymobError})`, 503);
      }
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: parsed.data.email });
    if (existingUser) {
      return apiError('البريد الإلكتروني مسجل بالفعل', 409);
    }

    // Create user. subscriptionStatus starts as 'none' — it is set to 'active'
    // only after Paymob confirms payment via the webhook.
    const user = await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phone: parsed.data.phone,
      academicYear: parsed.data.academicYear,
      academicTerm: parsed.data.academicTerm,
      role: 'student',
      subscriptionStatus: 'none',
      ...(parsed.data.subscriptionMethod && { subscriptionMethod: parsed.data.subscriptionMethod }),
    });

    return apiSuccess(
      {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        academicTerm: user.academicTerm,
        subscriptionStatus: user.subscriptionStatus,
        // Return the courseIds so the client can immediately initiate payments.
        courseIds: courseIds,
      },
      201
    );
  } catch (error: any) {
    console.error('Registration error:', error);
    return apiError('فشل إنشاء الحساب. حاول مرة أخرى.', 500);
  }
}
