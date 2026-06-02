import { withAuth, apiSuccess } from '@/lib/api-helpers';
import { Payment } from '@/models';

// GET /api/admin/payments - List payments for audit and debugging
export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
  const status = searchParams.get('status');
  const method = searchParams.get('method');
  const courseId = searchParams.get('courseId');
  const userId = searchParams.get('userId');

  // No default method filter — show all methods including 'free' so admin can
  // audit free enrollments alongside paid ones.
  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (method && ['card', 'wallet', 'fawry', 'free'].includes(method)) {
    filter.method = method;
  }
  if (courseId) filter.course = courseId;
  if (userId) filter.user = userId;

  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('user', 'name email role academicYear')
      .populate('course', 'title slug price discountPrice targetYear')
      .populate('exam', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  const normalizedPayments = payments.map((payment: any) => ({
    ...payment,
    itemTitle: payment.course?.title || payment.exam?.title || 'عنصر غير محدد',
    itemType: payment.course ? 'course' : payment.exam ? 'exam' : 'unknown',
    paymobStatus: payment.metadata?.raw_response
      ? {
          success: payment.metadata.raw_response.success,
          pending: payment.metadata.raw_response.pending,
          errorOccured: payment.metadata.raw_response.error_occured,
        }
      : null,
  }));

  return apiSuccess({
    payments: normalizedPayments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}, ['admin']);
