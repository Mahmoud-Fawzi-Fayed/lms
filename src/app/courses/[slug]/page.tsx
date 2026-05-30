'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SecureVideoPlayer from '@/components/SecureVideoPlayer';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
import { formatPrice, formatDuration } from '@/lib/utils';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';

export default function CourseDetailPage() {
  const { slug } = useParams();
  const { data: session } = useSession();
  const router = useRouter();

  const [course, setCourse] = useState<any>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [previewModal, setPreviewModal] = useState<{ open: boolean; contentUrl: string; type: string; title: string; textContent: string; videoControls?: any }>({ open: false, contentUrl: '', type: '', title: '', textContent: '' });
  const [courseExams, setCourseExams] = useState<any[]>([]);

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
        fetchCourseExams(data.data.course._id);
      } else {
        toast.error(data.error || t('تعذر تحميل الكورس', 'Failed to load course'));
      }
    } catch {
      toast.error(t('فشل الاتصال بالخادم', 'Network error, please retry'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCourseExams = async (courseId: string) => {
    try {
      const res = await fetch(`/api/exams?courseId=${courseId}`);
      const data = await res.json();
      if (data.success) {
        setCourseExams(data.data.exams || []);
      }
    } catch {
      // Non-critical — exams section will simply be empty
    }
  };

  const handleEnroll = async (method: 'card' | 'fawry' | 'wallet') => {
    if (!session) {
      // Pass both callbackUrl (so they return to this course after login) and
      // courseId (so new users land on the purchase-gated registration page).
      router.push(`/login?callbackUrl=/courses/${slug}&courseId=${course._id}`);
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
        toast.error(data.error || t('تعذر بدء عملية الدفع', 'Payment initiation failed'));
        return;
      }

      if (data.data.enrolled) {
        toast.success(t('تم التسجيل بنجاح!', 'Enrolled successfully!'))
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
        toast.success(`${t('تم إنشاء مرجع فوري', 'Fawry ref created')}: ${data.data.fawryRef}`);
      } else {
        toast.success(t('تم بدء عملية الدفع. أكمل الدفع للتسجيل.', 'Payment started. Complete payment to enroll.'));
      }
    } catch {
      toast.error(t('فشل الدفع. حاول مرة أخرى.', 'Payment failed. Please try again.'));
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePreviewLesson = async (lessonId: string) => {
    if (!session) {
      router.push(`/login?callbackUrl=/courses/${slug}`);
      return;
    }

    // Find the lesson to get its type and title
    let lessonType = 'video';
    let lessonTitle = '';
    let lessonTextContent = '';
    let lessonVideoControls: any = undefined;
    for (const mod of course.modules || []) {
      const l = (mod.lessons || []).find((ls: any) => ls._id === lessonId);
      if (l) {
        lessonType = l.type;
        lessonTitle = l.title;
        lessonTextContent = l.content || '';
        lessonVideoControls = l.videoControls;
        break;
      }
    }

    // Text lessons don't need a content token — show directly
    if (lessonType === 'text') {
      setPreviewModal({ open: true, contentUrl: '', type: 'text', title: lessonTitle, textContent: lessonTextContent });
      return;
    }

    try {
      const kind = lessonType === 'video' ? 'stream' : 'raw';
      const res = await fetch(`/api/courses/${course._id}/content-token?lessonId=${lessonId}&kind=${kind}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.data?.token) {
        toast.error(data.error || t('تعذر فتح المعاينة', 'Preview failed to open'));
        return;
      }

      const mode = lessonType === 'video' ? 'stream' : 'raw';
      const contentUrl = `/api/content/${data.data.token}?mode=${mode}`;
      setPreviewModal({ open: true, contentUrl, type: lessonType, title: lessonTitle, textContent: '', videoControls: lessonVideoControls });
    } catch {
      toast.error(t('فشل فتح المعاينة', 'Preview error'));
    }
  };

  const closePreview = () => {
    setPreviewModal({ open: false, contentUrl: '', type: '', title: '', textContent: '' });
  };

  // ESC key to close preview modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
    };
    if (previewModal.open) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [previewModal.open]);

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
        <section className="relative text-white overflow-hidden">
          {/* Background: thumbnail or gradient fallback */}
          {course.thumbnail ? (
            <>
              <div className="absolute inset-0">
                <img src={course.thumbnail} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-l from-slate-900/95 to-blue-950/90" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-l from-slate-900 to-blue-950" />
          )}
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
              ...(courseExams.length > 0 ? [{ key: 'exams', label: 'الاختبارات' }] : []),
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
                        {mod.title}
                      </h3>
                      <span className="text-sm text-slate-500">
                        {mod.lessons?.length || 0} درس
                      </span>
                    </div>
                    <div className="divide-y">
                      {mod.lessons?.map((lesson: any, li: number) => (
                        <div
                          key={li}
                          className={`px-5 py-3 flex items-center justify-between hover:bg-slate-50 ${(lesson.isPreview || lesson.isFreeLesson) ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (lesson.isPreview || lesson.isFreeLesson) handlePreviewLesson(lesson._id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">
                              {lesson.type === 'video' ? '🎥' : lesson.type === 'pdf' ? '📄' : '📝'}
                            </span>
                            <span className={`text-sm ${(lesson.isPreview || lesson.isFreeLesson) ? 'text-slate-900' : 'text-slate-600'}`}>
                              {lesson.title}
                            </span>
                            {(lesson.isPreview || lesson.isFreeLesson) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreviewLesson(lesson._id);
                                }}
                                className="inline-flex items-center gap-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-0.5 rounded-full transition-colors font-medium"
                                title="فتح المعاينة"
                              >
                                {lesson.type === 'video' ? '🎥' : lesson.type === 'pdf' ? '📄' : null}
                                {lesson.isFreeLesson ? 'مجاني' : 'معاينة'}
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

          {activeTab === 'exams' && courseExams.length > 0 && (
            <div className="max-w-3xl">
              <h2 className="text-xl font-bold text-slate-900 mb-6">
                اختبارات الكورس ({courseExams.length} اختبار)
              </h2>
              <div className="space-y-4">
                {courseExams.map((exam: any) => (
                  <div key={exam._id} className="border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-slate-900">{exam.title}</h3>
                          {exam.isPreview && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              معاينة مجانية
                            </span>
                          )}
                        </div>
                        {exam.description && (
                          <p className="text-sm text-slate-600 mb-3">{exam.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            📝 {exam.questions?.length || 0} سؤال
                          </span>
                          <span className="flex items-center gap-1">
                            ⏱️ {exam.duration} دقيقة
                          </span>
                          <span className="flex items-center gap-1">
                            🎯 درجة النجاح: {exam.passingScore}%
                          </span>
                          <span className="flex items-center gap-1">
                            🔄 {exam.maxAttempts} محاولة
                          </span>
                        </div>
                      </div>
                      <div>
                        {isEnrolled || exam.isPreview ? (
                          <Link
                            href={`/exams/take/${exam._id}`}
                            className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
                          >
                            ابدأ الاختبار
                          </Link>
                        ) : (
                          <span className="inline-block px-4 py-2 bg-slate-100 text-slate-500 text-sm rounded-xl whitespace-nowrap">
                            🔒 سجّل أولاً
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Preview Modal ── */}
        {previewModal.open && (
          /* Backdrop — click outside content to close */
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onContextMenu={(e) => e.preventDefault()}
            onClick={closePreview}
          >
            {/* Close button */}
            <button
              onClick={closePreview}
              className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white text-xl flex items-center justify-center transition-colors"
              title="إغلاق"
            >
              ✕
            </button>

            {/* Title bar */}
            <div className="absolute top-4 right-4 z-50 bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg text-white text-sm font-medium max-w-md truncate">
              {previewModal.title}
            </div>

            {/* Watermark overlay */}
            <div className="absolute inset-0 pointer-events-none z-40 select-none overflow-hidden" style={{ userSelect: 'none' }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-white/[0.06] text-4xl font-bold rotate-[-30deg] whitespace-nowrap">
                  {session?.user?.email || session?.user?.name || 'Preview'}
                </div>
              </div>
              <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-32 rotate-[-25deg] scale-150">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="text-white/[0.03] text-sm font-medium whitespace-nowrap">
                    {session?.user?.email || session?.user?.name || ''}
                  </span>
                ))}
              </div>
            </div>

            {/* Content area — stopPropagation so clicking inside doesn't close */}
            <div
              className="relative z-30 flex items-center justify-center"
              style={{ width: '100%', height: '100%', paddingTop: '52px', paddingBottom: '8px', paddingLeft: '8px', paddingRight: '8px' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* VIDEO — width capped by height*16/9 so it fills screen without overflow */}
              {previewModal.type === 'video' && (
                <div style={{ width: '100%', maxWidth: 'min(calc(100vw - 16px), calc((100vh - 68px) * 16 / 9))' }}>
                  <SecureVideoPlayer
                    src={previewModal.contentUrl}
                    title={previewModal.title}
                    controls={previewModal.videoControls}
                  />
                </div>
              )}

              {/* PDF */}
              {previewModal.type === 'pdf' && (
                <div className="w-full max-w-4xl" style={{ maxHeight: 'calc(100vh - 68px)', overflowY: 'auto' }}>
                  <PreviewPdf url={previewModal.contentUrl} />
                </div>
              )}

              {/* TEXT */}
              {previewModal.type === 'text' && (
                <div
                  className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-3xl text-right select-none"
                  style={{ maxHeight: 'calc(100vh - 68px)', overflowY: 'auto', userSelect: 'none', WebkitUserSelect: 'none' } as any}
                  dir="rtl"
                  onCopy={(e) => e.preventDefault()}
                >
                  <h2 className="text-xl font-bold text-slate-900 mb-4 border-b pb-3">{previewModal.title}</h2>
                  <div
                    className="prose prose-slate max-w-none text-slate-700 leading-loose"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewModal.textContent || '<p>لا يوجد محتوى لهذا الدرس</p>') }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

/* ── Protected PDF Viewer component — renders to canvas via PDF.js ── */
function PreviewPdf({ url }: { url: string }) {
  return <PdfCanvasViewer src={url} protected />;
}
