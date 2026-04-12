import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Exam, ExamAttempt, Payment, ExamEnrollment } from '@/models';
import mongoose from 'mongoose';

export const GET = withAuth(async (req) => {
  const id = req.nextUrl.pathname.split('/')[5];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return apiError('معرف الاختبار غير صالح', 400);
  }

  const exam = await Exam.findById(id)
    .populate('course', 'title')
    .populate('createdBy', 'name email')
    .lean();

  if (!exam) {
    return apiError('الاختبار غير موجود', 404);
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    attemptsAgg,
    uniqueParticipants,
    paidPaymentsCount,
    totalRevenueAgg,
    recentAttempts,
    topResultsAgg,
    recentPayments,
    examEnrollments,
    attemptsTrendAgg,
    paymentsTrendAgg,
  ] = await Promise.all([
    ExamAttempt.aggregate([
      { $match: { exam: new mongoose.Types.ObjectId(id), status: { $in: ['submitted', 'timed-out'] } } },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
          passCount: { $sum: { $cond: [{ $eq: ['$passed', true] }, 1, 0] } },
          avgTime: { $avg: '$timeSpent' },
        },
      },
    ]),
    ExamAttempt.distinct('user', {
      exam: new mongoose.Types.ObjectId(id),
      status: { $in: ['submitted', 'timed-out'] },
    }),
    Payment.countDocuments({
      exam: id,
      status: 'paid',
      method: { $in: ['card', 'wallet', 'fawry'] },
    }),
    Payment.aggregate([
      {
        $match: {
          exam: new mongoose.Types.ObjectId(id),
          status: 'paid',
          method: { $in: ['card', 'wallet', 'fawry'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    ExamAttempt.find({ exam: id, status: { $in: ['submitted', 'timed-out'] } })
      .populate('user', 'name email')
      .sort({ submittedAt: -1 })
      .limit(20)
      .lean(),
    ExamAttempt.aggregate([
      { $match: { exam: new mongoose.Types.ObjectId(id), status: { $in: ['submitted', 'timed-out'] } } },
      { $sort: { score: -1, timeSpent: 1, submittedAt: -1 } },
      {
        $group: {
          _id: '$user',
          bestScore: { $first: '$score' },
          fastestTime: { $first: '$timeSpent' },
          attempts: { $sum: 1 },
        },
      },
      { $sort: { bestScore: -1, fastestTime: 1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          email: '$user.email',
          bestScore: 1,
          fastestTime: 1,
          attempts: 1,
        },
      },
    ]),
    Payment.find({
      exam: id,
      method: { $in: ['card', 'wallet', 'fawry'] },
    })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    ExamEnrollment.find({ exam: id })
      .populate('user', 'name email')
      .sort({ enrolledAt: -1 })
      .limit(20)
      .lean(),
    ExamAttempt.aggregate([
      {
        $match: {
          exam: new mongoose.Types.ObjectId(id),
          status: { $in: ['submitted', 'timed-out'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          attempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Payment.aggregate([
      {
        $match: {
          exam: new mongoose.Types.ObjectId(id),
          status: 'paid',
          method: { $in: ['card', 'wallet', 'fawry'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          payments: { $sum: 1 },
          revenue: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
  ]);

  const agg = attemptsAgg[0] || { attempts: 0, avgScore: 0, passCount: 0, avgTime: 0 };
  const passRate = agg.attempts > 0 ? Math.round((agg.passCount / agg.attempts) * 100) : 0;

  const makeMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const months: { key: string; label: string }[] = [];
  const iter = new Date(sixMonthsAgo);

  for (let i = 0; i < 6; i++) {
    const d = new Date(iter.getFullYear(), iter.getMonth() + i, 1);
    months.push({ key: makeMonthKey(d), label: d.toLocaleDateString('ar-EG', { month: 'short' }) });
  }

  const attemptsByMonth = new Map(
    attemptsTrendAgg.map((row: any) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row.attempts])
  );
  const paymentsByMonth = new Map(
    paymentsTrendAgg.map((row: any) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row.payments])
  );
  const revenueByMonth = new Map(
    paymentsTrendAgg.map((row: any) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row.revenue])
  );

  return apiSuccess({
    exam: {
      _id: exam._id,
      title: exam.title,
      isPublished: exam.isPublished,
      duration: exam.duration,
      passingScore: exam.passingScore,
      maxAttempts: exam.maxAttempts,
      courseTitle: (exam.course as any)?.title || 'اختبار مستقل',
      createdBy: (exam.createdBy as any)?.name || '-',
      createdByEmail: (exam.createdBy as any)?.email || '-',
    },
    stats: {
      attempts: agg.attempts,
      uniqueParticipants: uniqueParticipants.length,
      avgScore: Math.round(agg.avgScore || 0),
      passRate,
      avgTimeMinutes: Math.round((agg.avgTime || 0) / 60),
      paidPaymentsCount,
      totalRevenue: totalRevenueAgg[0]?.total || 0,
      enrollmentCount: examEnrollments.length,
    },
    topResults: topResultsAgg,
    recentAttempts,
    recentPayments,
    recentExamEnrollments: examEnrollments,
    trends: {
      attempts: months.map((m) => ({ label: m.label, value: attemptsByMonth.get(m.key) || 0 })),
      payments: months.map((m) => ({ label: m.label, value: paymentsByMonth.get(m.key) || 0 })),
      revenue: months.map((m) => ({ label: m.label, value: revenueByMonth.get(m.key) || 0 })),
    },
  });
}, ['admin']);
