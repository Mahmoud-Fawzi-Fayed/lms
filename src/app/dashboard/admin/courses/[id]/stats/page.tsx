'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import { MiniBarChart, MiniLineChart } from '@/components/analytics/Charts';
import { formatPrice } from '@/lib/utils';
import { exportToPdf } from '@/lib/export-utils';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function AdminCourseStatsPage() {
  const { data: session, status } = useSession();
  useLang();
  const adminLinks = [
    { href: '/dashboard/admin', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/admin/users', label: t('المستخدمين', 'Users'), icon: '👥' },
    { href: '/dashboard/admin/courses', label: t('الكورسات', 'Courses'), icon: '📚' },
    { href: '/dashboard/admin/payments', label: t('المدفوعات', 'Payments'), icon: '💳' },
  ];
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') router.push('/dashboard');
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated' && params?.id) {
      fetchStats();
    }
  }, [status, params?.id]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats/courses/${params.id}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  const exportStudentsPdf = async () => {
    const rows = data?.students || [];
    await exportToPdf(
      `course-${params.id}-students.pdf`,
      `${t('إحصائيات طلاب الكورس:', 'Course Students Stats:')} ${data?.course?.title || ''}`,
      rows,
      [
        { header: t('الاسم', 'Name'), value: (r: any) => r.name },
        { header: t('البريد', 'Email'), value: (r: any) => r.email },
        { header: t('نسبة التقدم', 'Progress %'), value: (r: any) => `${r.progress}%` },
        { header: t('الحالة', 'Status'), value: (r: any) => r.status },
        { header: t('تاريخ التسجيل', 'Enrollment Date'), value: (r: any) => new Date(r.enrolledAt).toLocaleDateString('ar-EG') },
      ]
    );
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('إحصائيات الكورس', 'Course Statistics')}</h1>
            {data?.course && <p className="text-slate-500 mt-1">{data.course.title}</p>}
          </div>
          <button
            onClick={exportStudentsPdf}
            disabled={!data}
            className="px-4 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm disabled:opacity-50"
          >
            {t('تصدير الطلاب PDF', 'Export Students PDF')}
          </button>
        </div>

        {loading ? (
          <div className="text-slate-500">{t('جاري التحميل...', 'Loading...')}</div>
        ) : !data ? (
          <div className="text-slate-500">{t('تعذر تحميل الإحصائيات', 'Failed to load statistics')}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-6 mb-8">
              <Card title={t('عدد الطلاب', 'Students')} value={data.stats.totalEnrollments} />
              <Card title={t('عدد الاختبارات', 'Exams')} value={data.stats.totalExams} />
              <Card title={t('محاولات الاختبار', 'Exam Attempts')} value={data.stats.totalExamAttempts} />
              <Card title={t('عدد المدفوعات', 'Payments')} value={data.stats.paidPaymentsCount} />
              <Card title={t('إجمالي الإيراد', 'Total Revenue')} value={formatPrice(data.stats.totalRevenue)} />
              <Card title={t('متوسط التقدم', 'Avg Progress')} value={`${data.stats.avgProgress}%`} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
              <Panel title={t('اتجاه التسجيلات', 'Enrollment Trend')}>
                <MiniLineChart data={data.trends.enrollments} />
              </Panel>
              <Panel title={t('اتجاه المدفوعات', 'Payment Trend')}>
                <MiniLineChart data={data.trends.payments} stroke="#14b8a6" />
              </Panel>
              <Panel title={t('اتجاه الإيراد', 'Revenue Trend')}>
                <MiniBarChart data={data.trends.revenue} color="bg-emerald-500" />
              </Panel>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">{t('أفضل الطلاب حسب التقدم', 'Top Students by Progress')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">{t('الطالب', 'Student')}</th>
                      <th className="px-4 py-3">{t('البريد', 'Email')}</th>
                      <th className="px-4 py-3">{t('نسبة التقدم', 'Progress %')}</th>
                      <th className="px-4 py-3">{t('الحالة', 'Status')}</th>
                      <th className="px-4 py-3">{t('تاريخ التسجيل', 'Enrollment Date')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {data.students.map((row: any) => (
                      <tr key={row.enrollmentId} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{row.name}</td>
                        <td className="px-4 py-3 text-accent-700">{row.email}</td>
                        <td className="px-4 py-3 text-accent-700">{row.progress}%</td>
                        <td className="px-4 py-3 text-accent-700">{row.status}</td>
                        <td className="px-4 py-3 text-accent-700">{new Date(row.enrolledAt).toLocaleDateString('ar-EG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardSidebar>
  );
}

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="text-sm text-slate-500 mb-1">{title}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <h2 className="font-semibold text-slate-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}
