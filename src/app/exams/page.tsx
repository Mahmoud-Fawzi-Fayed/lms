'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function ExamsPage() {
  useLang();
  const { data: session } = useSession();
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingExamId, setPayingExamId] = useState<string | null>(null);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (data.success) {
        setExams(data.data.exams || []);
      }
    } catch {
      toast.error(t('تعذر تحميل الاختبارات', 'Failed to load exams'));
    } finally {
      setLoading(false);
    }
  };

  const handleStartExam = (examId: string) => {
    if (!session) {
      router.push(`/login?callbackUrl=/exams`);
      return;
    }
    router.push(`/exams/take/${examId}`);
  };

  const handleBuyExam = async (examId: string) => {
    if (!session) {
      router.push(`/login?callbackUrl=/exams`);
      return;
    }

    setPayingExamId(examId);
    try {
      const res = await fetch('/api/payments/exams/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, method: 'card' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || t('تعذر بدء عملية الدفع', 'Payment initiation failed'));
        return;
      }

      if (data.data.enrolled) {
        toast.success(t('تم تفعيل الاختبار بنجاح', 'Exam activated successfully'));
        await fetchExams();
        return;
      }

      if (data.data.iframeUrl) {
        window.location.href = data.data.iframeUrl;
        return;
      }

      toast.success(t('تم إنشاء الدفع بنجاح', 'Payment created successfully'));
    } catch {
      toast.error(t('حدث خطأ أثناء الدفع', 'Payment error occurred'));
    } finally {
      setPayingExamId(null);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-accent-900 mb-2">{t('الامتحانات', 'Exams')}</h1>
            <p className="text-accent-600">{t('اختبارات مستقلة أو مرتبطة بالكورسات. يمكنك البدء مباشرة إذا كانت مجانية أو شراء الاختبار المدفوع.', 'Independent exams or exams tied to courses. Start free exams directly or purchase paid ones.')}</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-accent-200 p-6 animate-pulse">
                  <div className="h-5 bg-accent-200 rounded w-2/3 mb-3" />
                  <div className="h-4 bg-accent-200 rounded w-full mb-2" />
                  <div className="h-4 bg-accent-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : exams.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.map((exam) => {
                const finalPrice = exam.accessType === 'free'
                  ? 0
                  : (exam.finalPrice ?? exam.discountPrice ?? exam.price ?? 0);
                const isStandalone = !exam.course;
                const isPaidStandalone = isStandalone && finalPrice > 0;
                const canAccess = exam.canAccess ?? (!isPaidStandalone);

                return (
                  <div key={exam._id} className="bg-white rounded-xl border border-accent-200 shadow-soft p-6 flex flex-col">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-bold text-accent-900 line-clamp-2">{exam.title}</h3>
                      {isStandalone ? (
                        finalPrice > 0 ? (
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">{t('مدفوع', 'Paid')}</span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">{t('مجاني', 'Free')}</span>
                        )
                      ) : (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">{t('ضمن كورس', 'In a course')}</span>
                      )}
                    </div>

                    <p className="text-sm text-accent-600 mb-4 line-clamp-2">
                      {exam.description || t('اختبار تقييمي لقياس مستوى التحصيل.', 'An assessment exam to measure your level.')}
                    </p>

                    <div className="space-y-2 text-xs text-accent-500 mb-5">
                      <div className="flex items-center justify-between">
                        <span>{t('المدة', 'Duration')}</span>
                        <span className="font-semibold text-accent-700">{exam.duration} {t('دقيقة', 'min')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('عدد الأسئلة', 'Questions')}</span>
                        <span className="font-semibold text-accent-700">{exam.questions?.length || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('النجاح', 'Pass')}</span>
                        <span className="font-semibold text-accent-700">{exam.passingScore}%</span>
                      </div>
                      {isStandalone && (
                        <div className="flex items-center justify-between">
                          <span>{t('السعر', 'Price')}</span>
                          <span className="font-semibold text-accent-700">{finalPrice > 0 ? `${finalPrice} ${t('ج.م', 'EGP')}` : t('مجاني', 'Free')}</span>
                        </div>
                      )}
                      {exam.course?.title && (
                        <div className="pt-1 text-accent-600">{t('الكورس', 'Course')}: {exam.course.title}</div>
                      )}
                    </div>

                    <div className="mt-auto flex gap-2">
                      {canAccess ? (
                        <button
                          onClick={() => handleStartExam(exam._id)}
                          className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-semibold"
                        >
                          {t('ابدأ الاختبار', 'Start exam')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBuyExam(exam._id)}
                          disabled={payingExamId === exam._id}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-60"
                        >
                          {payingExamId === exam._id ? t('جاري التحويل...', 'Redirecting...') : t('شراء الاختبار', 'Purchase exam')}
                        </button>
                      )}

                      <Link
                        href={`/exams/${exam._id}/leaderboard`}
                        className="px-4 py-2 border border-accent-200 rounded-lg text-sm text-accent-700 hover:bg-accent-50"
                      >
                        {t('المتصدرون', 'Leaderboard')}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-accent-200">
              <span className="text-5xl mb-3 block">📝</span>
              <h3 className="text-lg font-semibold text-accent-900 mb-2">{t('لا توجد اختبارات متاحة حالياً', 'No exams available right now')}</h3>
              <p className="text-accent-600">{t('تابعنا قريباً لإضافة اختبارات جديدة', 'Check back soon for new exams')}</p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
