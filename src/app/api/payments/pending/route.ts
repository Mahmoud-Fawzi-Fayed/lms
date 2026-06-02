import { withAuth, apiSuccess } from '@/lib/api-helpers';
import { Payment } from '@/models';
import connectDB from '@/lib/db';

// GET /api/payments/pending
// Returns the authenticated student's pending course payments from the last 24 hours.
// Used by the dashboard to prompt the user to complete an abandoned checkout.
export const GET = withAuth(async (_req, user) => {
  await connectDB();

  const payments = await Payment.find({
    user: user.id,
    status: 'pending',
    course: { $exists: true, $ne: null },
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  })
    .populate('course', 'title slug price discountPrice')
    .sort({ createdAt: -1 })
    .lean();

  return apiSuccess({ payments });
});
