'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';
import { exportToExcel, exportToPdf } from '@/lib/export-utils';
import { MiniBarChart, MiniLineChart } from '@/components/analytics/Charts';

const instructorLinks = [
  { href: '/dashboard/instructor', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/instructor/courses', label: 'كورساتي', icon: '📚' },
  { href: '/dashboard/instructor/courses/new', label: 'إنشاء كورس', icon: '➕' },
  { href: '/dashboard/instructor/exams', label: 'الاختبارات', icon: '📝' },
];

export default function InstructorDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'instructor' && (session?.user as any)?.role !== 'admin') router.push('/dashboard');
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchStats();
  }, [status]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/instructor/stats');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (error) {
      console.error('Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  const courseColumns = [
    { header: 'اسم الكورس', value: (r: any) => r.title },
    { header: 'الحالة', value: (r: any) => (r.isPublished ? 'منشور' : 'مسودة') },
    { header: 'عدد الطلاب', value: (r: any) => r.enrollments },
    { header: 'متوسط التقدم %', value: (r: any) => r.avgProgress },
    { header: 'الإيراد', value: (r: any) => r.revenue },
    { header: 'عدد المدفوعات', value: (r: any) => r.paymentsCount },
  ];

  const examColumns = [
    { header: 'اسم الاختبار', value: (r: any) => r.title },
    { header: 'مرتبط بكورس', value: (r: any) => r.courseTitle || '-' },
    { header: 'الحالة', value: (r: any) => (r.isPublished ? 'منشور' : 'مسودة') },
    { header: 'عدد المحاولات', value: (r: any) => r.attempts },
    { header: 'متوسط الدرجة %', value: (r: any) => r.avgScore },
    { header: 'معدل النجاح %', value: (r: any) => r.passRate },
    { header: 'الإيراد', value: (r: any) => r.revenue },
  ];

  const exportCoursesExcel = async () => {
    const rows = stats?.analytics?.coursePerformance || [];
    await exportToExcel('instructor-courses-stats.xlsx', 'Courses', rows, courseColumns);
  };

  const exportCoursesPdf = async () => {
    const rows = stats?.analytics?.coursePerformance || [];
    await exportToPdf('instructor-courses-stats.pdf', 'Instructor Courses Analytics', rows, courseColumns);
  };

  const exportExamsExcel = async () => {
    const rows = stats?.analytics?.examPerformance || [];
    await exportToExcel('instructor-exams-stats.xlsx', 'Exams', rows, examColumns);
  };

  const exportExamsPdf = async () => {
    const rows = stats?.analytics?.examPerformance || [];
    await exportToPdf('instructor-exams-stats.pdf', 'Instructor Exams Analytics', rows, examColumns);
  };

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">لوحة تحكم المحاضر</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCoursesExcel}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              تصدير الكورسات Excel
            </button>
            <button
              onClick={exportCoursesPdf}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              تصدير الكورسات PDF
            </button>
            <button
              onClick={exportExamsExcel}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              تصدير الاختبارات Excel
            </button>
            <button
              onClick={exportExamsPdf}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              تصدير الاختبارات PDF
            </button>
            <Link
              href="/dashboard/instructor/courses/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              + كورس جديد
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">كورساتي</span>
                  <span className="text-2xl">📚</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalCourses}</div>
                <div className="text-xs text-slate-500 mt-1">{stats.stats.publishedCourses} منشور</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">إجمالي الطلاب</span>
                  <span className="text-2xl">🎓</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalEnrollments}</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">اختباراتي</span>
                  <span className="text-2xl">📝</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalExams}</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">محاولات الاختبارات</span>
                  <span className="text-2xl">📈</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalExamAttempts}</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">الإيرادات</span>
                  <span className="text-2xl">💰</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{formatPrice(stats.stats.totalRevenue)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">اتجاه الإيرادات (آخر 6 أشهر)</h2>
                <MiniLineChart
                  data={(stats.analytics?.revenueTrend || []).map((item: any) => ({
                    label: item.label,
                    value: item.revenue,
                  }))}
                />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">اتجاه المدفوعات الناجحة (آخر 6 أشهر)</h2>
                <MiniLineChart
                  data={(stats.analytics?.paymentsTrend || []).map((item: any) => ({
                    label: item.label,
                    value: item.payments,
                  }))}
                  stroke="#14b8a6"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">أفضل الكورسات حسب عدد المدفوعات</h2>
                <MiniBarChart
                  data={(stats.analytics?.coursePerformance || [])
                    .slice()
                    .sort((a: any, b: any) => b.paymentsCount - a.paymentsCount)
                    .slice(0, 6)
                    .map((course: any) => ({
                      label: course.title,
                      value: course.paymentsCount,
                    }))}
                />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">أفضل الاختبارات حسب عدد المحاولات</h2>
                <MiniBarChart
                  data={(stats.analytics?.examPerformance || [])
                    .slice()
                    .sort((a: any, b: any) => b.attempts - a.attempts)
                    .slice(0, 6)
                    .map((exam: any) => ({
                      label: exam.title,
                      value: exam.attempts,
                    }))}
                  color="bg-teal-500"
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
              <h2 className="font-semibold text-slate-900 mb-4">أداء الكورسات</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">الكورس</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">عدد الطلاب</th>
                      <th className="px-4 py-3">متوسط التقدم</th>
                      <th className="px-4 py-3">الإيراد</th>
                      <th className="px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {(stats.analytics?.coursePerformance || []).map((course: any) => (
                      <tr key={course.courseId} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{course.title}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${course.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {course.isPublished ? 'منشور' : 'مسودة'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-accent-700">{course.enrollments}</td>
                        <td className="px-4 py-3 text-accent-700">{course.avgProgress}%</td>
                        <td className="px-4 py-3 font-semibold text-accent-900">{formatPrice(course.revenue)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/instructor/courses/${course.courseId}`} className="text-primary-600 hover:underline">
                            فتح
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">أداء الاختبارات</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">الاختبار</th>
                      <th className="px-4 py-3">الكورس المرتبط</th>
                      <th className="px-4 py-3">المحاولات</th>
                      <th className="px-4 py-3">متوسط الدرجة</th>
                      <th className="px-4 py-3">معدل النجاح</th>
                      <th className="px-4 py-3">الإيراد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {(stats.analytics?.examPerformance || []).map((exam: any) => (
                      <tr key={exam.examId} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{exam.title}</td>
                        <td className="px-4 py-3 text-accent-700">{exam.courseTitle || 'اختبار مستقل'}</td>
                        <td className="px-4 py-3 text-accent-700">{exam.attempts}</td>
                        <td className="px-4 py-3 text-accent-700">{exam.avgScore}%</td>
                        <td className="px-4 py-3 text-accent-700">{exam.passRate}%</td>
                        <td className="px-4 py-3 font-semibold text-accent-900">{formatPrice(exam.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardSidebar>
  );
}
