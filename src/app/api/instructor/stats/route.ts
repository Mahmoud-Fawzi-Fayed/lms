import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Course, Enrollment, ExamAttempt, Exam, Payment } from '@/models';

// GET /api/instructor/stats - Instructor dashboard stats
export const GET = withAuth(async (req, user) => {
  const courses = await Course.find({ instructor: user.id }).lean();
  const courseIds = courses.map(c => c._id);
  const exams = await Exam.find({
    $or: [
      { createdBy: user.id },
      { course: { $in: courseIds } },
    ],
  })
    .populate('course', 'title')
    .lean();
  const examIds = exams.map((e) => e._id);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    totalEnrollments,
    totalRevenue,
    paymentsTrendAgg,
    recentEnrollments,
    courseEnrollmentAgg,
    courseRevenueAgg,
    examAttemptsAgg,
    examRevenueAgg,
    revenueTrendAgg,
    enrollmentsTrendAgg,
    attemptsTrendAgg,
    totalAttempts,
  ] = await Promise.all([
    Enrollment.countDocuments({
      course: { $in: courseIds },
      status: 'active',
    }),
    Enrollment.aggregate([
      { $match: { course: { $in: courseIds }, status: 'active' } },
      {
        $lookup: {
          from: 'payments',
          localField: 'payment',
          foreignField: '_id',
          as: 'paymentData',
        },
      },
      { $unwind: '$paymentData' },
      { $match: { 'paymentData.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$paymentData.amount' } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: 'paid',
          method: { $in: ['card', 'wallet', 'fawry'] },
          createdAt: { $gte: sixMonthsAgo },
          $or: [
            { course: { $in: courseIds } },
            { exam: { $in: examIds } },
          ],
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          payments: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Enrollment.find({
      course: { $in: courseIds },
      status: 'active',
    })
      .populate('user', 'name email')
      .populate('course', 'title')
      .sort({ enrolledAt: -1 })
      .limit(10)
      .lean(),
    Enrollment.aggregate([
      { $match: { course: { $in: courseIds }, status: 'active' } },
      {
        $group: {
          _id: '$course',
          enrollments: { $sum: 1 },
          avgProgress: { $avg: '$progress.percentage' },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { course: { $in: courseIds }, status: 'paid' } },
      {
        $group: {
          _id: '$course',
          revenue: { $sum: '$amount' },
          paymentsCount: { $sum: 1 },
        },
      },
    ]),
    ExamAttempt.aggregate([
      {
        $match: {
          exam: { $in: examIds },
          status: { $in: ['submitted', 'timed-out'] },
        },
      },
      {
        $group: {
          _id: '$exam',
          attempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
          passCount: {
            $sum: {
              $cond: [{ $eq: ['$passed', true] }, 1, 0],
            },
          },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { exam: { $in: examIds }, status: 'paid' } },
      {
        $group: {
          _id: '$exam',
          revenue: { $sum: '$amount' },
        },
      },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: 'paid',
          createdAt: { $gte: sixMonthsAgo },
          $or: [
            { course: { $in: courseIds } },
            { exam: { $in: examIds } },
          ],
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          revenue: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Enrollment.aggregate([
      {
        $match: {
          course: { $in: courseIds },
          status: 'active',
          enrolledAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$enrolledAt' },
            m: { $month: '$enrolledAt' },
          },
          enrollments: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    ExamAttempt.aggregate([
      {
        $match: {
          exam: { $in: examIds },
          status: { $in: ['submitted', 'timed-out'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          attempts: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    ExamAttempt.countDocuments({
      exam: { $in: examIds },
      status: { $in: ['submitted', 'timed-out'] },
    }),
  ]);

  const makeMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  const months: { key: string; label: string }[] = [];
  const iter = new Date(sixMonthsAgo);
  for (let i = 0; i < 6; i++) {
    const d = new Date(iter.getFullYear(), iter.getMonth() + i, 1);
    months.push({
      key: makeMonthKey(d),
      label: d.toLocaleDateString('ar-EG', { month: 'short' }),
    });
  }

  const revenueByMonth = new Map(
    revenueTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.revenue,
    ])
  );
  const paymentsByMonth = new Map(
    paymentsTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.payments,
    ])
  );
  const attemptsByMonth = new Map(
    attemptsTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.attempts,
    ])
  );
  const enrollmentsByMonth = new Map(
    enrollmentsTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.enrollments,
    ])
  );

  const enrollmentMap = new Map(courseEnrollmentAgg.map((r: any) => [String(r._id), r]));
  const courseRevenueMap = new Map(courseRevenueAgg.map((r: any) => [String(r._id), r]));
  const examAttemptMap = new Map(examAttemptsAgg.map((r: any) => [String(r._id), r]));
  const examRevenueMap = new Map(examRevenueAgg.map((r: any) => [String(r._id), r]));

  const coursePerformance = courses.map((c: any) => {
    const enroll = enrollmentMap.get(String(c._id));
    const rev = courseRevenueMap.get(String(c._id));
    return {
      courseId: c._id,
      title: c.title,
      isPublished: c.isPublished,
      enrollments: enroll?.enrollments || 0,
      avgProgress: Math.round(enroll?.avgProgress || 0),
      revenue: rev?.revenue || 0,
      paymentsCount: rev?.paymentsCount || 0,
    };
  });

  const examPerformance = exams.map((e: any) => {
    const attempts = examAttemptMap.get(String(e._id));
    const rev = examRevenueMap.get(String(e._id));
    const attemptsCount = attempts?.attempts || 0;
    const passRate = attemptsCount > 0 ? Math.round(((attempts?.passCount || 0) / attemptsCount) * 100) : 0;
    return {
      examId: e._id,
      title: e.title,
      courseTitle: (e.course as any)?.title || null,
      attempts: attemptsCount,
      avgScore: Math.round(attempts?.avgScore || 0),
      passRate,
      revenue: rev?.revenue || 0,
      isPublished: e.isPublished,
    };
  });

  return apiSuccess({
    stats: {
      totalCourses: courses.length,
      publishedCourses: courses.filter(c => c.isPublished).length,
      totalExams: exams.length,
      totalExamAttempts: totalAttempts,
      totalEnrollments,
      totalRevenue: totalRevenue[0]?.total || 0,
    },
    courses: courses.map(c => ({
      _id: c._id,
      title: c.title,
      isPublished: c.isPublished,
      enrollmentCount: c.enrollmentCount,
      price: c.price,
    })),
    recentEnrollments,
    analytics: {
      coursePerformance,
      examPerformance,
      revenueTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        revenue: revenueByMonth.get(m.key) || 0,
      })),
      paymentsTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        payments: paymentsByMonth.get(m.key) || 0,
      })),
      enrollmentsTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        enrollments: enrollmentsByMonth.get(m.key) || 0,
      })),
      attemptsTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        attempts: attemptsByMonth.get(m.key) || 0,
      })),
    },
  });
}, ['instructor', 'admin']);
