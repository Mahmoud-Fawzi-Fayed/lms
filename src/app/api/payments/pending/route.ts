import { withAuth, apiSuccess } from '@/lib/api-helpers';
import { Payment, Enrollment } from '@/models';
import connectDB from '@/lib/db';
import mongoose from 'mongoose';

// GET /api/payments/pending
// Returns course payments that are pending or failed AND the user is not yet enrolled.
// No time restriction — a failed/abandoned payment should always prompt the user to retry.
// Fawry "pending" payments that already have a fawryReferenceNumber are shown differently
// (the user just needs to pay at the store) vs card/wallet failures.
export const GET = withAuth(async (_req, user) => {
  await connectDB();

  // Fetch all unresolved course payments (pending or failed, no enrollment yet)
  const candidatePayments = await Payment.find({
    user: user.id,
    status: { $in: ['pending', 'failed'] },
    course: { $exists: true, $ne: null },
  })
    .populate('course', 'title slug price discountPrice')
    .sort({ createdAt: -1 })
    .lean();

  if (candidatePayments.length === 0) return apiSuccess({ payments: [] });

  // Filter out any course where the user already has an active enrollment —
  // this handles the race-condition where webhook arrived after this query.
  const courseIds = candidatePayments
    .map((p: any) => p.course?._id)
    .filter(Boolean);

  const enrollments = await Enrollment.find({
    user: new mongoose.Types.ObjectId(user.id),
    course: { $in: courseIds },
    status: 'active',
  })
    .select('course')
    .lean();

  const enrolledSet = new Set(
    (enrollments as any[]).map((e) => e.course.toString())
  );

  // Deduplicate: keep only the most-recent payment per course.
  const seen = new Set<string>();
  const payments = candidatePayments.filter((p: any) => {
    const courseId = p.course?._id?.toString();
    if (!courseId || enrolledSet.has(courseId)) return false;
    if (seen.has(courseId)) return false;
    seen.add(courseId);
    return true;
  });

  return apiSuccess({ payments });
});
