import { withAuth, apiSuccess } from '@/lib/api-helpers';
import { Payment } from '@/models';

// GET /api/admin/payments - List payments for audit and debugging
export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const status = searchParams.get('status');
  const method = searchParams.get('method');
  const courseId = searchParams.get('courseId');
  const userId = searchParams.get('userId');

  const filter: Record<string, any> = {
    method: { $in: ['card', 'wallet', 'fawry'] },
  };
  if (status) filter.status = status;
  if (method && ['card', 'wallet', 'fawry'].includes(method)) {
    filter.method = method;
  }
  if (courseId) filter.course = courseId;
  if (userId) filter.user = userId;

  // Auto-expire stale pending online payments (card/wallet) when webhook is missing.
  // Fawry can remain pending for longer, so it is excluded.
  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000);
  await Payment.updateMany(
    {
      status: 'pending',
      method: { $in: ['card', 'wallet'] },
      createdAt: { $lt: staleCutoff },
    },
    {
      $set: {
        status: 'failed',
        'metadata.reconciliation': 'auto_expired_pending',
        'metadata.expiredAt': new Date().toISOString(),
      },
    }
  );

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
