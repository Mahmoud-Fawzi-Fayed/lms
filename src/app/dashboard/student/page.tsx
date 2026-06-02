'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

const METHOD_LABELS: Record<string, string> = {
  card:   'بطاقة بنكية',
  fawry:  'فوري',
  wallet: 'محفظة إلكترونية',
};

// Separate component so useSearchParams() is isolated inside a Suspense boundary
function PaymentResultToast() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const paymentResult = searchParams.get('payment');
    if (!paymentResult) return;
    const clean = new URLSearchParams(searchParams.toString());
    clean.delete('payment');
    const newUrl = clean.toString() ? `?${clean.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    if (paymentResult === 'success') {
      toast.success(t('تمت عملية الدفع بنجاح! سيتم تفعيل الاشتراك قريباً.', 'Payment successful! Your enrollment will be activated shortly.'));
    } else if (paymentResult === 'pending') {
      toast(t('جاري معالجة الدفع… ستصلك تأكيد قريباً.', 'Payment is being processed… you will be notified shortly.'), { icon: '⏳' });
    } else if (paymentResult === 'failed') {
      toast.error(t('فشلت عملية الدفع. يرجى المحاولة مرة أخرى.', 'Payment failed. Please try again.'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function StudentDashboard() {
  useLang();
  const { data: session, status } = useSession();
  const studentLinks = [
    { href: '/dashboard/student', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/student/courses', label: t('كورساتي', 'My Courses'), icon: '📚' },
    { href: '/dashboard/student/exams', label: t('اختباراتي', 'My Exams'), icon: '📝' },
    { href: '/dashboard/student/profile', label: t('الملف الشخصي', 'Profile'), icon: '👤' },
  ];
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'student' && (session?.user as any)?.role !== 'admin') router.push('/dashboard');
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchData();
  }, [status]);

  const fetchData = async () => {
    try {
      const [enrollRes, userRes, pendingRes] = await Promise.all([
        fetch('/api/enrollments'),
        fetch('/api/users/me'),
        fetch('/api/payments/pending'),
      ]);
      const enrollData = await enrollRes.json();
      const userData = await userRes.json();
      const pendingData = await pendingRes.json();
      setData({
        enrollments: enrollData.success ? (enrollData.data.enrollments || []) : [],
        user: userData.success ? userData.data : null,
      });
      if (pendingData.success) {
        setPendingPayments(pendingData.data.payments || []);
      }
    } catch {
      toast.error(t('فشل تحميل البيانات', 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };

  const resumePayment = async (payment: any) => {
    setPayingId(payment._id);
    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: payment.course?._id, method: payment.method }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('فشل استئناف الدفع', 'Failed to resume payment'));
        return;
      }
      if (data.data?.enrolled) {
        toast.success(t('تم التسجيل بنجاح!', 'Enrolled successfully!'));
        setPendingPayments(prev => prev.filter(p => p._id !== payment._id));
        fetchData();
        return;
      }
      const url = data.data?.iframeUrl || data.data?.paymentUrl;
      if (url) {
        window.location.href = url;
        return;
      }
      if (data.data?.fawryRef) {
        toast.success(`${t('مرجع فوري:', 'Fawry ref:')} ${data.data.fawryRef}`);
        setPendingPayments(prev => prev.filter(p => p._id !== payment._id));
        fetchData();
        return;
      }
      toast.error(t('تعذر استئناف الدفع. حاول من صفحة الكورس.', 'Could not resume payment. Try from the course page.'));
    } catch {
      toast.error(t('حدث خطأ', 'An error occurred'));
    } finally {
      setPayingId(null);
    }
  };

  const activeEnrollments = data?.enrollments?.filter((e: any) => e.status === 'active') || [];

  return (
    <DashboardSidebar links={studentLinks}>
      <Suspense fallback={null}><PaymentResultToast /></Suspense>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {t('مرحباً بك', 'Welcome')}{data?.user?.name ? `، ${data.user.name}` : ''} 👋
        </h1>
        <p className="text-slate-500 mb-8">{t('أكمل رحلة التعلم', 'Continue your learning journey')}</p>

        {/* Pending payment alerts */}
        {pendingPayments.length > 0 && (
          <div className="mb-8 space-y-3">
            {pendingPayments.map(payment => (
              <div
                key={payment._id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-amber-50 border border-amber-300 rounded-2xl p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-amber-900">
                      {t('لم يكتمل الدفع لكورس:', 'Payment incomplete for:')} {payment.course?.title || t('كورس', 'Course')}
                    </p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      {t('طريقة الدفع:', 'Method:')} {METHOD_LABELS[payment.method] || payment.method}
                      {' · '}
                      {t('المبلغ:', 'Amount:')} {payment.amount} {t('ج.م', 'EGP')}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      {t(
                        'لن تتمكن من الوصول لمحتوى الكورس حتى إتمام الدفع.',
                        'You cannot access course content until payment is completed.',
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => resumePayment(payment)}
                  disabled={payingId === payment._id}
                  className="shrink-0 px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm"
                >
                  {payingId === payment._id
                    ? t('جاري التحميل...', 'Loading...')
                    : t('إتمام الدفع', 'Complete Payment')}
                </button>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-24 mb-4" />
                <div className="h-8 bg-slate-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('الكورسات المسجلة', 'Enrolled Courses')}</span>
                  <span className="text-2xl">📚</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{activeEnrollments.length}</div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('متوسط التقدم', 'Average Progress')}</span>
                  <span className="text-2xl">📈</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {activeEnrollments.length > 0
                    ? Math.round(
                        activeEnrollments.reduce((sum: number, e: any) => sum + (e.progress?.percentage || 0), 0) /
                          activeEnrollments.length
                      )
                    : 0}%
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('مكتمل', 'Completed')}</span>
                  <span className="text-2xl">🏆</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {activeEnrollments.filter((e: any) => e.progress?.percentage === 100).length}
                </div>
              </div>
            </div>

            {/* Continue Learning */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
              <h2 className="font-semibold text-slate-900 mb-4">{t('أكمل التعلم', 'Continue Learning')}</h2>
              {activeEnrollments.length > 0 ? (
                <div className="space-y-3">
                  {activeEnrollments.slice(0, 5).map((enrollment: any) => (
                    <Link
                      key={enrollment._id}
                      href={`/courses/learn/${enrollment.course?._id}`}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{enrollment.course?.title}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {enrollment.course?.instructor?.name || t('محاضر غير معروف', 'Unknown Instructor')}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-32">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>{t('التقدم', 'Progress')}</span>
                            <span>{enrollment.progress?.percentage || 0}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${enrollment.progress?.percentage || 0}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-slate-400">←</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-500 mb-4">{t('لا توجد كورسات بعد', 'No courses yet')}</p>
                  <Link
                    href="/courses"
                    className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
                  >
                    {t('تصفح الكورسات', 'Browse Courses')}
                  </Link>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Link
                href="/courses"
                className="bg-gradient-to-l from-blue-500 to-blue-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow"
              >
                <span className="text-3xl mb-2 block">🔍</span>
                <h3 className="font-semibold text-lg">{t('تصفح الكورسات', 'Browse Courses')}</h3>
                <p className="text-blue-100 text-sm mt-1">{t('اكتشف كورسات جديدة للتعلم', 'Discover new courses to learn')}</p>
              </Link>
              <Link
                href="/dashboard/student/exams"
                className="bg-gradient-to-l from-purple-500 to-purple-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow"
              >
                <span className="text-3xl mb-2 block">📝</span>
                <h3 className="font-semibold text-lg">{t('اختباراتي', 'My Exams')}</h3>
                <p className="text-purple-100 text-sm mt-1">{t('شاهد نتائج اختباراتك ودرجاتك', 'View your exam results and scores')}</p>
              </Link>
            </div>
          </>
        )}
      </div>
    </DashboardSidebar>
  );
}
