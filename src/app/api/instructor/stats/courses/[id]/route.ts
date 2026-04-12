import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Course, Enrollment, Exam, ExamAttempt, Payment } from '@/models';
import mongoose from 'mongoose';

export const GET = withAuth(async (req, user) => {
  const id = req.nextUrl.pathname.split('/')[5];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return apiError('معرف الكورس غير صالح', 400);
  }

  const course = await Course.findById(id).lean();
  if (!course) return apiError('الكورس غير موجود', 404);

  // Ensure instructor owns this course
  if (course.instructor.toString() !== user.id && user.role !== 'admin') {
    return apiError('غير مصرح لك', 403);
  }

  const examIds = (await Exam.find({ course: id }).select('_id').lean()).map((e) => e._id);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    totalEnrollments,
    avgProgressAgg,
    totalRevenueAgg,
    paidPaymentsCount,
    totalExams,
    totalExamAttempts,
    students,
    enrollmentsTrendAgg,
    paymentsTrendAgg,
    revenueTrendAgg,
  ] = await Promise.all([
    Enrollment.countDocuments({ course: id, status: 'active' }),
    Enrollment.aggregate([
      { $match: { course: new mongoose.Types.ObjectId(id), status: 'active' } },
      { $group: { _id: null, avgProgress: { $avg: '$progress.percentage' } } },
    ]),
    Payment.aggregate([
      { $match: { course: new mongoose.Types.ObjectId(id), status: 'paid', method: { $in: ['card', 'wallet', 'fawry'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.countDocuments({ course: id, status: 'paid', method: { $in: ['card', 'wallet', 'fawry'] } }),
    Exam.countDocuments({ course: id }),
    ExamAttempt.countDocuments({ exam: { $in: examIds }, status: { $in: ['submitted', 'timed-out'] } }),
    Enrollment.find({ course: id, status: 'active' })
      .populate('user', 'name email')
      .sort({ 'progress.percentage': -1, enrolledAt: -1 })
      .limit(20)
      .lean(),
    Enrollment.aggregate([
      { $match: { course: new mongoose.Types.ObjectId(id), status: 'active', enrolledAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: '$enrolledAt' }, m: { $month: '$enrolledAt' } }, enrollments: { $sum: 1 } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Payment.aggregate([
      { $match: { course: new mongoose.Types.ObjectId(id), status: 'paid', method: { $in: ['card', 'wallet', 'fawry'] }, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, payments: { $sum: 1 } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Payment.aggregate([
      { $match: { course: new mongoose.Types.ObjectId(id), status: 'paid', method: { $in: ['card', 'wallet', 'fawry'] }, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, revenue: { $sum: '$amount' } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
  ]);

  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const now = new Date();
  const trendLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { label: MONTHS_AR[d.getMonth()], y: d.getFullYear(), m: d.getMonth() + 1 };
  });

  const buildTrend = (agg: any[], key: string) =>
    trendLabels.map(({ label, y, m }) => ({
      label,
      [key]: agg.find((a) => a._id.y === y && a._id.m === m)?.[key] ?? 0,
    }));

  return apiSuccess({
    course: { _id: course._id, title: course.title, thumbnail: course.thumbnail, isPublished: course.isPublished },
    stats: {
      totalEnrollments,
      avgProgress: Math.round(avgProgressAgg[0]?.avgProgress ?? 0),
      totalRevenue: totalRevenueAgg[0]?.total ?? 0,
      paidPaymentsCount,
      totalExams,
      totalExamAttempts,
    },
    students: students.map((e: any) => ({
      name: e.user?.name,
      email: e.user?.email,
      progress: Math.round(e.progress?.percentage ?? 0),
      enrolledAt: e.enrolledAt,
    })),
    trends: {
      enrollments: buildTrend(enrollmentsTrendAgg, 'enrollments'),
      payments: buildTrend(paymentsTrendAgg, 'payments'),
      revenue: buildTrend(revenueTrendAgg, 'revenue'),
    },
  });
}, ['instructor', 'admin']);
