'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { formatPrice, formatDuration } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function CourseDetailPage() {
  const { slug } = useParams();
  const { data: session } = useSession();
  const router = useRouter();

  const [course, setCourse] = useState<any>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchCourse();
  }, [slug]);

  const fetchCourse = async () => {
    try {
      const res = await fetch(`/api/courses/${slug}`);
      const data = await res.json();
      if (data.success) {
        setCourse(data.data.course);
        setIsEnrolled(data.data.isEnrolled);
      }
    } catch (error) {
      console.error('Failed to fetch course:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async (method: 'card' | 'fawry' | 'wallet') => {
    if (!session) {
      router.push(`/login?callbackUrl=/courses/${slug}`);
      return;
    }

    setPaymentLoading(true);
    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course._id, method }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'تعذر بدء عملية الدفع');
        return;
      }

      if (data.data.enrolled) {
        toast.success('تم التسجيل بنجاح!');
        setIsEnrolled(true);
        return;
      }

      if (data.data.pending && data.data.message) {
        toast.success(data.data.message);
      }

      // Redirect to payment
      if (data.data.iframeUrl) {
        window.location.href = data.data.iframeUrl;
      } else if (data.data.paymentUrl) {
        window.location.href = data.data.paymentUrl;
      } else if (data.data.fawryRef) {
        toast.success(`تم إنشاء مرجع فوري: ${data.data.fawryRef}`);
      } else {
        toast.success('تم بدء عملية الدفع. أكمل الدفع للتسجيل.');
      }
    } catch (error) {
      toast.error('فشل الدفع. حاول مرة أخرى.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePreviewLesson = async (lessonId: string) => {
    if (!session) {
      router.push(`/login?callbackUrl=/courses/${slug}`);
      return;
    }

    try {
      const res = await fetch(`/api/courses/${course._id}/content-token?lessonId=${lessonId}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.data?.token) {
        toast.error(data.error || 'تعذر فتح المعاينة');
        return;
      }

      window.open(`/api/content/${data.data.token}`, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('فشل فتح المعاينة');
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </>
    );
  }

  if (!course) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">الكورس غير موجود</h2>
            <Link href="/courses" className="text-blue-600 hover:underline">العودة للكورسات</Link>
          </div>
        </div>
      </>
    );
  }

  const finalPrice = course.price === 0 ? 0 : (course.discountPrice ?? course.price);
  const totalLessons = course.modules?.reduce(
    (sum: number, mod: any) => sum + (mod.lessons?.length || 0),
    0
  ) || 0;
  const totalDuration = course.modules?.reduce(
    (sum: number, mod: any) =>
      sum +
      (mod.lessons?.reduce((s: number, l: any) => s + (l.duration || 0), 0) || 0),
    0
  ) || 0;

  return (
    <>
      <Navbar />
      <main>
        {/* Course Header */}
        <section className="bg-gradient-to-l from-slate-900 to-blue-950 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2 text-sm mb-4">
                  <Link href="/courses" className="text-slate-400 hover:text-white">الكورسات</Link>
                  <span className="text-slate-600">/</span>
                  <span className="text-blue-400">{course.category}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-4">{course.title}</h1>
                <p className="text-slate-300 text-lg mb-6">{course.shortDescription || course.description?.slice(0, 200)}</p>

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {course.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-400 font-bold">{course.rating.toFixed(1)}</span>
                      <span className="text-yellow-400">★</span>
                      <span className="text-slate-400">({course.ratingCount} تقييم)</span>
                    </div>
                  )}
                  <span className="text-slate-400">{course.enrollmentCount} طالب</span>
                  <span className="text-slate-400">بواسطة {course.instructor?.name}</span>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                    {course.level === 'beginner' ? 'مبتدئ' : course.level === 'intermediate' ? 'متوسط' : 'متقدم'}
                  </span>
                </div>
              </div>

              {/* Course Card */}
              <div className="bg-white rounded-2xl shadow-xl p-6 text-slate-900">
                {/* Price */}
                <div className="mb-4">
                  {finalPrice === 0 ? (
                    <div className="text-3xl font-bold text-green-600">مجاني</div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold">{formatPrice(finalPrice)}</span>
                      {course.discountPrice != null && course.discountPrice < course.price && (
                        <span className="text-lg text-slate-400 line-through">
                          {formatPrice(course.price)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {isEnrolled ? (
                  <Link
                    href={`/courses/learn/${course._id}`}
                    className="block w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-center transition-colors mb-4"
                  >
                    متابعة التعلم
                  </Link>
                ) : (
                  <div className="space-y-3 mb-4">
                    <button
                      onClick={() => handleEnroll('card')}
                      disabled={paymentLoading}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      {paymentLoading ? 'جاري المعالجة...' : finalPrice === 0 ? 'سجّل مجاناً' : 'ادفع بالبطاقة'}
                    </button>
                    {finalPrice > 0 && (
                      <>
                        <button
                          onClick={() => handleEnroll('fawry')}
                          disabled={paymentLoading}
                          className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                        >
                          ادفع عبر فوري
                        </button>
                        <button
                          onClick={() => handleEnroll('wallet')}
                          disabled={paymentLoading}
                          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                        >
                          محفظة إلكترونية
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Course Info */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">الدروس</span>
                    <span className="font-medium">{totalLessons}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">المدة</span>
                    <span className="font-medium">{formatDuration(totalDuration)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">المستوى</span>
                    <span className="font-medium">{course.level === 'beginner' ? 'مبتدئ' : course.level === 'intermediate' ? 'متوسط' : 'متقدم'}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">اللغة</span>
                    <span className="font-medium">{course.language === 'ar' ? 'العربية' : 'الإنجليزية'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Course Content */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-8">
            {[
              { key: 'overview', label: 'نظرة عامة' },
              { key: 'curriculum', label: 'المنهج' },
              { key: 'exams', label: 'الاختبارات' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white shadow text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 space-y-8">
                {/* What You'll Learn */}
                {course.whatYouLearn?.length > 0 && (
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 mb-4">ماذا ستتعلم</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {course.whatYouLearn.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-slate-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-4">الوصف</h2>
                  <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-line">
                    {course.description}
                  </div>
                </div>

                {/* Requirements */}
                {course.requirements?.length > 0 && (
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 mb-4">المتطلبات</h2>
                    <ul className="list-disc list-inside space-y-2 text-slate-700">
                      {course.requirements.map((req: string, i: number) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'curriculum' && (
            <div className="max-w-3xl">
              <h2 className="text-xl font-bold text-slate-900 mb-6">
                المنهج الدراسي ({totalLessons} درس)
              </h2>
              <div className="space-y-4">
                {course.modules?.map((mod: any, mi: number) => (
                  <div key={mi} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900">
                        الوحدة {mi + 1}: {mod.title}
                      </h3>
                      <span className="text-sm text-slate-500">
                        {mod.lessons?.length || 0} درس
                      </span>
                    </div>
                    <div className="divide-y">
                      {mod.lessons?.map((lesson: any, li: number) => (
                        <div
                          key={li}
                          className={`px-5 py-3 flex items-center justify-between hover:bg-slate-50 ${lesson.isPreview ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (lesson.isPreview) handlePreviewLesson(lesson._id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">
                              {lesson.type === 'video' ? '🎥' : lesson.type === 'pdf' ? '📄' : '📝'}
                            </span>
                            <span className={`text-sm ${lesson.isPreview ? 'text-slate-900' : 'text-slate-600'}`}>
                              {lesson.title}
                            </span>
                            {lesson.isPreview && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreviewLesson(lesson._id);
                                }}
                                className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-0.5 rounded-full transition-colors"
                                title="فتح المعاينة"
                              >
                                معاينة
                              </button>
                            )}
                          </div>
                          {lesson.duration > 0 && (
                            <span className="text-xs text-slate-400">
                              {formatDuration(lesson.duration)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'exams' && (
            <div className="max-w-3xl">
              <h2 className="text-xl font-bold text-slate-900 mb-4">اختبارات الكورس</h2>
              <p className="text-slate-600 mb-6">
                {isEnrolled
                  ? 'خُض الاختبارات لتقييم مستواك وتصدّر قائمة المتفوقين.'
                  : 'سجّل في الكورس للوصول إلى الاختبارات وقوائم المتفوقين.'}
              </p>
              {isEnrolled && (
                <Link
                  href={`/exams?courseId=${course._id}`}
                  className="inline-block px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  عرض الاختبارات
                </Link>
              )}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
