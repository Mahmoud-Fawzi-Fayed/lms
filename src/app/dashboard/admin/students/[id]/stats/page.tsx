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

export default function AdminStudentStatsPage() {
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
    if (status === 'authenticated' && params?.id) fetchStats();
  }, [status, params?.id]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats/students/${params.id}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  const exportPaymentsPdf = async () => {
    const rows = data?.payments || [];
    await exportToPdf(
      `student-${params.id}-payments.pdf`,
      `${t('مدفوعات الطالب:', 'Student Payments:')} ${data?.student?.name || ''}`,
      rows,
      [
        { header: t('العنصر', 'Item'), value: (r: any) => r.course?.title || r.exam?.title || '-' },
        { header: t('المبلغ', 'Amount'), value: (r: any) => r.amount },
        { header: t('الطريقة', 'Method'), value: (r: any) => r.method },
        { header: t('الحالة', 'Status'), value: (r: any) => r.status },
        { header: t('التاريخ', 'Date'), value: (r: any) => new Date(r.createdAt).toLocaleDateString('ar-EG') },
      ]
    );
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('إحصائيات الطالب', 'Student Statistics')}</h1>
            {data?.student && <p className="text-slate-500 mt-1">{data.student.name} - {data.student.email}</p>}
          </div>
          <button
            onClick={exportPaymentsPdf}
            disabled={!data}
            className="px-4 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm disabled:opacity-50"
          >
            {t('تصدير المدفوعات PDF', 'Export Payments PDF')}
          </button>
        </div>

        {loading ? (
          <div className="text-slate-500">{t('جاري التحميل...', 'Loading...')}</div>
        ) : !data ? (
          <div className="text-slate-500">{t('تعذر تحميل الإحصائيات', 'Failed to load statistics')}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-6 mb-8">
              <Card title={t('كورسات نشطة', 'Active Courses')} value={data.stats.activeCourses} />
              <Card title={t('اختبارات نشطة', 'Active Exams')} value={data.stats.activeExams} />
              <Card title={t('تسجيلات الكورسات', 'Course Enrollments')} value={data.stats.totalCourseEnrollments} />
              <Card title={t('تسجيلات الاختبارات', 'Exam Enrollments')} value={data.stats.totalExamEnrollments} />
              <Card title={t('محاولات الاختبار', 'Exam Attempts')} value={data.stats.totalAttempts} />
              <Card title={t('متوسط الدرجة', 'Avg Score')} value={`${data.stats.avgScore}%`} />
              <Card title={t('معدل النجاح', 'Pass Rate')} value={`${data.stats.passRate}%`} />
              <Card title={t('إجمالي الإنفاق', 'Total Spent')} value={formatPrice(data.stats.totalSpent)} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
              <Panel title={t('اتجاه المحاولات', 'Attempts Trend')}>
                <MiniLineChart data={data.trends.attempts} />
              </Panel>
              <Panel title={t('اتجاه المدفوعات', 'Payment Trend')}>
                <MiniLineChart data={data.trends.payments} stroke="#14b8a6" />
              </Panel>
              <Panel title={t('اتجاه الإنفاق', 'Spending Trend')}>
                <MiniBarChart data={data.trends.spending} color="bg-emerald-500" />
              </Panel>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">{t('سجل المدفوعات (Paymob)', 'Payments Record (Paymob)')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">{t('العنصر', 'Item')}</th>
                      <th className="px-4 py-3">{t('النوع', 'Type')}</th>
                      <th className="px-4 py-3">{t('المبلغ', 'Amount')}</th>
                      <th className="px-4 py-3">{t('الطريقة', 'Method')}</th>
                      <th className="px-4 py-3">{t('الحالة', 'Status')}</th>
                      <th className="px-4 py-3">{t('التاريخ', 'Date')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {data.payments.map((row: any) => (
                      <tr key={row._id} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{row.course?.title || row.exam?.title || '-'}</td>
                        <td className="px-4 py-3 text-accent-700">{row.course ? t('كورس', 'Course') : t('اختبار', 'Exam')}</td>
                        <td className="px-4 py-3 text-accent-700">{formatPrice(row.amount)}</td>
                        <td className="px-4 py-3 text-accent-700">{row.method}</td>
                        <td className="px-4 py-3 text-accent-700">{row.status}</td>
                        <td className="px-4 py-3 text-accent-700">{new Date(row.createdAt).toLocaleDateString('ar-EG')}</td>
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
