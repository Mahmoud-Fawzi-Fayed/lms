import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Course, Payment, Enrollment } from '@/models';
import { initiatePaymentSchema } from '@/lib/validations';
import { initiatePayment } from '@/lib/paymob';
import { isSameAcademicYear } from '@/lib/academic-year';

function buildPendingPaymentResponse(method: string, paymentToken: string, iframeId: string) {
  if (iframeId) {
    return {
      iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
    };
  }

  return {};
}

// POST /api/payments/initiate - Start payment flow
export const POST = withAuth(async (req, user) => {
  const body = await req.json();
  const parsed = initiatePaymentSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.errors[0].message);
  }

  const { courseId, method } = parsed.data;

  // Get course
  const course = await Course.findById(courseId);
  if (!course || !course.isPublished) {
    return apiError('الكورس غير موجود', 404);
  }

  if (user.role === 'student' && course.targetYear && !isSameAcademicYear(user.academicYear, course.targetYear)) {
    return apiError('هذا الكورس غير متاح لسنتك الدراسية', 403);
  }

  // Check if already enrolled
  const existingEnrollment = await Enrollment.findOne({
    user: user.id,
    course: courseId,
    status: 'active',
  });

  if (existingEnrollment) {
    return apiError('أنت مشترك بالفعل في هذا الكورس', 400);
  }

  // Check for pending payment
  const pendingPayment = await Payment.findOne({
    user: user.id,
    course: courseId,
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // Last 30 min
  });

  if (pendingPayment) {
    // If user chose a different method than the pending one, invalidate the old pending payment
    // and create a fresh payment using the newly selected method.
    if (pendingPayment.method && pendingPayment.method !== method) {
      pendingPayment.status = 'failed';
      await pendingPayment.save();
    } else {
      // If pending payment has token, return a resumable checkout link instead of blocking.
      if (pendingPayment.paymobToken) {
        const resumeMethod = (pendingPayment.method || method) as 'card' | 'wallet' | 'fawry';
        return apiSuccess({
          pending: true,
          message: 'لديك عملية دفع معلقة لهذا الكورس. سيتم فتحها الآن.',
          paymentId: pendingPayment._id,
          paymentKey: pendingPayment.paymobToken,
          ...buildPendingPaymentResponse(
            resumeMethod,
            pendingPayment.paymobToken,
            process.env.PAYMOB_IFRAME_ID || ''
          ),
        });
      }

      // Broken pending record (without token) should not block the user.
      pendingPayment.status = 'failed';
      await pendingPayment.save();
    }
  }

  const finalPrice = course.price === 0 ? 0 : (course.discountPrice ?? course.price);

  // Free course - auto-enroll
  if (finalPrice === 0) {
    const payment = await Payment.create({
      user: user.id,
      course: courseId,
      amount: 0,
      method: 'free',
      status: 'paid',
      paidAt: new Date(),
    });

    await Enrollment.create({
      user: user.id,
      course: courseId,
      payment: payment._id,
      status: 'active',
      enrolledAt: new Date(),
    });

    await Course.findByIdAndUpdate(courseId, { $inc: { enrollmentCount: 1 } });

    return apiSuccess({ enrolled: true, message: 'تم الاشتراك بنجاح (كورس مجاني)' });
  }

  // Create payment record
  const payment = await Payment.create({
    user: user.id,
    course: courseId,
    amount: finalPrice,
    method,
    status: 'pending',
  });

  // Initiate Paymob payment
  const paymobResult = await initiatePayment({
    amountEGP: finalPrice,
    method,
    orderId: payment._id.toString(),
    user: {
      email: user.email,
      name: user.name,
    },
  });

  // Update payment with Paymob data
  payment.paymobOrderId = paymobResult.paymobOrderId.toString();
  payment.paymobToken = paymobResult.paymentKey;
  await payment.save();

  return apiSuccess({
    paymentId: payment._id,
    ...paymobResult,
  });
}, ['student', 'instructor', 'admin']);
