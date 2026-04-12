import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Exam, Payment, ExamEnrollment } from '@/models';
import { initiateExamPaymentSchema } from '@/lib/validations';
import { initiatePayment } from '@/lib/paymob';

function buildPendingPaymentResponse(paymentToken: string, iframeId: string) {
  if (!iframeId) return {};
  return {
    iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
  };
}

// POST /api/payments/exams/initiate - Start standalone exam payment flow
export const POST = withAuth(async (req, user) => {
  const body = await req.json();
  const parsed = initiateExamPaymentSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.errors[0].message);
  }

  const { examId, method } = parsed.data;

  const exam = await Exam.findById(examId);
  if (!exam || !exam.isPublished) {
    return apiError('الاختبار غير موجود', 404);
  }

  if (exam.course) {
    return apiError('الدفع المستقل متاح فقط للاختبارات غير المرتبطة بكورس', 400);
  }

  if (user.role === 'student' && exam.targetYear && user.academicYear !== exam.targetYear) {
    return apiError('هذا الاختبار غير متاح لسنتك الدراسية', 403);
  }

  const finalPrice = exam.accessType === 'free' ? 0 : (exam.discountPrice ?? exam.price ?? 0);

  if (finalPrice === 0 || exam.accessType === 'free') {
    const payment = await Payment.create({
      user: user.id,
      exam: examId,
      amount: 0,
      method: 'free',
      status: 'paid',
      paidAt: new Date(),
      metadata: { type: 'standalone_exam' },
    });

    await ExamEnrollment.findOneAndUpdate(
      { user: user.id, exam: examId },
      {
        user: user.id,
        exam: examId,
        payment: payment._id,
        status: 'active',
        enrolledAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return apiSuccess({ enrolled: true, message: 'تم تفعيل الاختبار المجاني بنجاح' });
  }

  const existingAccess = await ExamEnrollment.findOne({ user: user.id, exam: examId, status: 'active' });
  if (existingAccess) {
    return apiError('أنت مشترك بالفعل في هذا الاختبار', 400);
  }

  const pendingPayment = await Payment.findOne({
    user: user.id,
    exam: examId,
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
  });

  if (pendingPayment) {
    if (pendingPayment.method && pendingPayment.method !== method) {
      pendingPayment.status = 'failed';
      await pendingPayment.save();
    } else if (pendingPayment.paymobToken) {
      return apiSuccess({
        pending: true,
        message: 'لديك عملية دفع معلقة لهذا الاختبار. سيتم فتحها الآن.',
        paymentId: pendingPayment._id,
        paymentKey: pendingPayment.paymobToken,
        ...buildPendingPaymentResponse(
          pendingPayment.paymobToken,
          process.env.PAYMOB_IFRAME_ID || ''
        ),
      });
    } else {
      pendingPayment.status = 'failed';
      await pendingPayment.save();
    }
  }

  const payment = await Payment.create({
    user: user.id,
    exam: examId,
    amount: finalPrice,
    method,
    status: 'pending',
    metadata: { type: 'standalone_exam' },
  });

  const paymobResult = await initiatePayment({
    amountEGP: finalPrice,
    method,
    orderId: payment._id.toString(),
    user: {
      email: user.email,
      name: user.name,
    },
  });

  payment.paymobOrderId = paymobResult.paymobOrderId.toString();
  payment.paymobToken = paymobResult.paymentKey;
  await payment.save();

  await ExamEnrollment.findOneAndUpdate(
    { user: user.id, exam: examId },
    {
      user: user.id,
      exam: examId,
      payment: payment._id,
      status: 'pending',
    },
    { upsert: true, new: true }
  );

  return apiSuccess({
    paymentId: payment._id,
    ...paymobResult,
  });
}, ['student', 'admin']);
