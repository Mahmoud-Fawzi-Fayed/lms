import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { User, Enrollment, ExamEnrollment, ExamAttempt, Payment } from '@/models';
import mongoose from 'mongoose';

export const GET = withAuth(async (req) => {
  const id = req.nextUrl.pathname.split('/')[5];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return apiError('معرف الطالب غير صالح', 400);
  }

  const student = await User.findById(id).select('name email role academicYear isActive createdAt').lean();

  if (!student) {
    return apiError('الطالب غير موجود', 404);
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    courseEnrollments,
    examEnrollments,
    attemptsAgg,
    recentAttempts,
    payments,
    totalSpentAgg,
    attemptsTrendAgg,
    paymentsTrendAgg,
  ] = await Promise.all([
    Enrollment.find({ user: id })
      .populate('course', 'title category level')
      .populate('payment', 'amount method status createdAt')
      .sort({ enrolledAt: -1 })
      .lean(),
    ExamEnrollment.find({ user: id })
      .populate('exam', 'title accessType')
      .populate('payment', 'amount method status createdAt')
      .sort({ enrolledAt: -1 })
      .lean(),
    ExamAttempt.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(id), status: { $in: ['submitted', 'timed-out'] } } },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
          passCount: { $sum: { $cond: [{ $eq: ['$passed', true] }, 1, 0] } },
        },
      },
    ]),
    ExamAttempt.find({ user: id, status: { $in: ['submitted', 'timed-out'] } })
      .populate('exam', 'title')
      .sort({ submittedAt: -1 })
      .limit(20)
      .lean(),
    Payment.find({ user: id, method: { $in: ['card', 'wallet', 'fawry'] } })
      .populate('course', 'title')
      .populate('exam', 'title')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    Payment.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(id),
          status: 'paid',
          method: { $in: ['card', 'wallet', 'fawry'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    ExamAttempt.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(id),
          status: { $in: ['submitted', 'timed-out'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          attempts: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Payment.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(id),
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

  const submittedAgg = attemptsAgg[0] || { attempts: 0, avgScore: 0, passCount: 0 };
  const passRate = submittedAgg.attempts > 0 ? Math.round((submittedAgg.passCount / submittedAgg.attempts) * 100) : 0;

  const activeCourses = courseEnrollments.filter((e: any) => e.status === 'active').length;
  const activeExams = examEnrollments.filter((e: any) => e.status === 'active').length;

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
  const spentByMonth = new Map(
    paymentsTrendAgg.map((row: any) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row.revenue])
  );

  return apiSuccess({
    student,
    stats: {
      activeCourses,
      activeExams,
      totalCourseEnrollments: courseEnrollments.length,
      totalExamEnrollments: examEnrollments.length,
      totalAttempts: submittedAgg.attempts,
      avgScore: Math.round(submittedAgg.avgScore || 0),
      passRate,
      totalSpent: totalSpentAgg[0]?.total || 0,
      paidPaymentsCount: payments.filter((p: any) => p.status === 'paid').length,
    },
    courseEnrollments,
    examEnrollments,
    recentAttempts,
    payments,
    trends: {
      attempts: months.map((m) => ({ label: m.label, value: attemptsByMonth.get(m.key) || 0 })),
      payments: months.map((m) => ({ label: m.label, value: paymentsByMonth.get(m.key) || 0 })),
      spending: months.map((m) => ({ label: m.label, value: spentByMonth.get(m.key) || 0 })),
    },
  });
}, ['admin']);
