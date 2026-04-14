'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
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
  const [previewModal, setPreviewModal] = useState<{ open: boolean; contentUrl: string; type: string; title: string; textContent: string }>({ open: false, contentUrl: '', type: '', title: '', textContent: '' });
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
        // Fetch exams linked to this course
        fetchCourseExams(data.data.course._id);
      }
    } catch (error) {
      console.error('Failed to fetch course:', error);
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
    } catch (error) {
      console.error('Failed to fetch course exams:', error);
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

    // Find the lesson to get its type and title
    let lessonType = 'video';
    let lessonTitle = '';
    let lessonTextContent = '';
    for (const mod of course.modules || []) {
      const l = (mod.lessons || []).find((ls: any) => ls._id === lessonId);
      if (l) { lessonType = l.type; lessonTitle = l.title; lessonTextContent = l.content || ''; break; }
    }

    // Text lessons don't need a content token — show directly
    if (lessonType === 'text') {
      setPreviewModal({ open: true, contentUrl: '', type: 'text', title: lessonTitle, textContent: lessonTextContent });
      return;
    }

    try {
      const res = await fetch(`/api/courses/${course._id}/content-token?lessonId=${lessonId}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.data?.token) {
        toast.error(data.error || 'تعذر فتح المعاينة');
        return;
      }

      const contentUrl = `/api/content/${data.data.token}?mode=raw`;
      setPreviewModal({ open: true, contentUrl, type: lessonType, title: lessonTitle, textContent: '' });
    } catch {
      toast.error('فشل فتح المعاينة');
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onContextMenu={(e) => e.preventDefault()}
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

            {/* Watermark overlay — multi-layer forensic (like VdoCipher/Udemy) */}
            <div className="absolute inset-0 pointer-events-none z-40 select-none overflow-hidden" style={{ userSelect: 'none' }}>
              {/* Center watermark */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-white/[0.06] text-4xl font-bold rotate-[-30deg] whitespace-nowrap">
                  {session?.user?.email || session?.user?.name || 'Preview'}
                </div>
              </div>
              {/* Tiled watermarks for screen recording */}
              <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-32 rotate-[-25deg] scale-150">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="text-white/[0.03] text-sm font-medium whitespace-nowrap">
                    {session?.user?.email || session?.user?.name || ''}
                  </span>
                ))}
              </div>
            </div>

            {/* Content area */}
            <div className="relative z-30 w-full max-w-5xl mx-4" style={{ maxHeight: '90vh' }}>
              {/* VIDEO */}
              {previewModal.type === 'video' && (
                <PreviewVideo url={previewModal.contentUrl} />
              )}

              {/* PDF */}
              {previewModal.type === 'pdf' && (
                <PreviewPdf url={previewModal.contentUrl} />
              )}

              {/* TEXT */}
              {previewModal.type === 'text' && (
                <div
                  className="bg-white rounded-2xl p-6 md:p-8 max-h-[80vh] overflow-y-auto text-right select-none"
                  dir="rtl"
                  style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                  onCopy={(e) => e.preventDefault()}
                >
                  <h2 className="text-xl font-bold text-slate-900 mb-4 border-b pb-3">{previewModal.title}</h2>
                  <div
                    className="prose prose-slate max-w-none text-slate-700 leading-loose"
                    dangerouslySetInnerHTML={{ __html: previewModal.textContent || '<p>لا يوجد محتوى لهذا الدرس</p>' }}
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

/* ── Protected Video Player – CANVAS RENDERING (no <video> visible in DOM) ── */
function PreviewVideo({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  // Fetch as blob, set on hidden video, immediately revoke
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    fetch(url, { credentials: 'include', headers: { 'X-Content-Request': '1' } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(b => {
        const bUrl = URL.createObjectURL(b);
        video.src = bUrl;
        // Revoke immediately once data is grabbed — URL becomes useless in DevTools
        video.addEventListener('loadeddata', () => URL.revokeObjectURL(bUrl), { once: true });
      })
      .catch(() => setErr(true));
  }, [url]);

  // Canvas rendering loop — paint video frames to <canvas>
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      if (video.readyState >= 2) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth || 1280;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => { setDuration(v.duration); setLoading(false); v.play().then(() => setPlaying(true)).catch(() => {}); };
    const onTime = () => setCurrentTime(v.currentTime);
    const onEnd = () => setPlaying(false);
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEnd);
    return () => { v.removeEventListener('loadedmetadata', onLoaded); v.removeEventListener('timeupdate', onTime); v.removeEventListener('ended', onEnd); };
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, []);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
  }, []);

  const toggleMute = useCallback(() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }, []);
  const changeVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current; if (!v) return;
    const val = parseFloat(e.target.value); v.volume = val; setVolume(val);
    if (val === 0) { v.muted = true; setMuted(true); } else { v.muted = false; setMuted(false); }
  }, []);
  const toggleFS = useCallback(() => {
    const el = containerRef.current; if (!el) return;
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen();
  }, []);
  const resetHide = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { setPlaying(p => { if (p) setShowControls(false); return p; }); }, 3000);
  }, []);
  const fmtTime = (s: number) => { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; };

  if (err) return <div className="text-white text-center py-12">فشل تحميل الفيديو</div>;

  return (
    <div ref={containerRef} className="relative rounded-xl overflow-hidden bg-black select-none" onContextMenu={(e) => e.preventDefault()} onMouseMove={resetHide} onClick={togglePlay}>
      {/* Hidden video — source for canvas, invisible to user */}
      <video ref={videoRef} playsInline disablePictureInPicture style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }} />
      {/* Visible canvas — right-click shows "Save Image" not "Save Video" */}
      <canvas ref={canvasRef} className="w-full max-h-[85vh] block" style={{ background: '#000' }} onContextMenu={(e) => e.preventDefault()} />

      {loading && <div className="absolute inset-0 flex items-center justify-center"><div className="animate-spin w-10 h-10 border-2 border-white border-t-transparent rounded-full" /></div>}
      {!playing && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-3 px-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`} onClick={(e) => e.stopPropagation()}>
        <div className="group cursor-pointer h-1.5 bg-white/30 rounded-full mb-3 relative" onClick={seek}>
          <div className="h-full bg-blue-500 rounded-full relative" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-blue-500 rounded-full border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors">
            {playing ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
          </button>
          <span className="text-white/80 text-xs font-mono min-w-[80px]">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
          <div className="flex-1" />
          <button onClick={toggleMute} className="text-white hover:text-blue-400 transition-colors">
            {muted || volume === 0 ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}
          </button>
          <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={changeVolume} onClick={(e) => e.stopPropagation()} className="w-16 h-1 accent-blue-500 cursor-pointer" />
          <button onClick={toggleFS} className="text-white hover:text-blue-400 transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Protected PDF Viewer component — renders to canvas via PDF.js ── */
function PreviewPdf({ url }: { url: string }) {
  return <PdfCanvasViewer src={url} protected />;
}
