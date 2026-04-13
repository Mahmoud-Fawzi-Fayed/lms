'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ContentProtection from '@/components/ContentProtection';
import SecureVideoPlayer from '@/components/SecureVideoPlayer';
import SecurePdfViewer from '@/components/SecurePdfViewer';
import toast from 'react-hot-toast';

export default function CourseLearnPage() {
  const { id } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [course, setCourse] = useState<any>(null);
  const [activeLesson, setActiveLesson] = useState<any>(null);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [contentUrl, setContentUrl] = useState('');
  const [courseExam, setCourseExam] = useState<any>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/courses/learn/' + id);
    }
  }, [status]);

  useEffect(() => {
    fetchCourse();
  }, [id]);

  const fetchCourse = async () => {
    try {
      const res = await fetch(`/api/courses/${id}`);
      const data = await res.json();

      if (!data.success || !data.data.isEnrolled) {
        toast.error('يجب أن تكون مسجلاً للوصول لهذا الكورس');
        router.push(`/courses`);
        return;
      }

      setCourse(data.data.course);
      if (data.data.enrollment?.progress) {
        setCompletedLessons(
          data.data.enrollment.progress.completedLessons?.map((l: any) => l.toString()) || []
        );
        setProgress(data.data.enrollment.progress.percentage || 0);
      }

      // Set first lesson as active
      if (data.data.course.modules?.[0]?.lessons?.[0]) {
        setActiveLesson(data.data.course.modules[0].lessons[0]);
        loadContent(data.data.course._id, data.data.course.modules[0].lessons[0]._id);
      }

      // Fetch exam for this course
      try {
        const examRes = await fetch(`/api/exams?courseId=${data.data.course._id}`);
        const examData = await examRes.json();
        if (examData.success && examData.data.exams?.length > 0) {
          setCourseExam(examData.data.exams[0]);
        }
      } catch { /* no exam */ }
    } catch (error) {
      toast.error('فشل تحميل الكورس');
    } finally {
      setLoading(false);
    }
  };

  const loadContent = async (courseId: string, lessonId: string) => {
    try {
      // Get content token from API
      const res = await fetch(`/api/courses/${courseId}/content-token?lessonId=${lessonId}`);
      const data = await res.json();
      if (data.success && data.data.token) {
        setContentUrl(`/api/content/${data.data.token}`);
      }
    } catch (error) {
      console.error('Failed to load content URL');
    }
  };

  const selectLesson = (moduleIdx: number, lessonIdx: number) => {
    const lesson = course.modules[moduleIdx].lessons[lessonIdx];
    setActiveModuleIndex(moduleIdx);
    setActiveLessonIndex(lessonIdx);
    setActiveLesson(lesson);
    loadContent(course._id, lesson._id);
  };

  const markComplete = async () => {
    if (!activeLesson || completedLessons.includes(activeLesson._id)) return;

    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course._id,
          lessonId: activeLesson._id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCompletedLessons(prev => [...prev, activeLesson._id]);
        setProgress(data.data.progress.percentage);
        toast.success('تم إكمال الدرس!');

        if (isLastLesson) {
          if (courseExam) {
            toast.success('اكتمل الكورس! جاري تحويلك للاختبار...');
            setTimeout(() => router.push(`/exams/take/${courseExam._id}`), 700);
          } else {
            toast.success('مبروك! اكتملت كل دروس الكورس');
            setTimeout(() => router.push('/dashboard/student/courses'), 700);
          }
        }
      }
    } catch (error) {
      console.error('Failed to mark complete');
    }
  };

  const isLastLesson = course
    ? activeModuleIndex === course.modules.length - 1 &&
      activeLessonIndex === course.modules[activeModuleIndex]?.lessons.length - 1
    : false;

  const isFirstLesson = activeModuleIndex === 0 && activeLessonIndex === 0;

  const goToNextLesson = () => {
    const currentMod = course.modules[activeModuleIndex];
    if (activeLessonIndex < currentMod.lessons.length - 1) {
      selectLesson(activeModuleIndex, activeLessonIndex + 1);
    } else if (activeModuleIndex < course.modules.length - 1) {
      selectLesson(activeModuleIndex + 1, 0);
    } else if (courseExam) {
      router.push(`/exams/take/${courseExam._id}`);
    } else {
      router.push('/dashboard/student/courses');
    }
  };

  const goToPrevLesson = () => {
    if (activeLessonIndex > 0) {
      selectLesson(activeModuleIndex, activeLessonIndex - 1);
    } else if (activeModuleIndex > 0) {
      const prevMod = course.modules[activeModuleIndex - 1];
      selectLesson(activeModuleIndex - 1, prevMod.lessons.length - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!course) return null;

  return (
    <ContentProtection watermarkText={session?.user?.email || ''} enabled={true}>
      <div className="flex h-screen bg-slate-100">
        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? 'w-80' : 'w-0'
          } transition-all bg-white border-l overflow-hidden flex-shrink-0`}
        >
          <div className="w-80 h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 line-clamp-1">{course.title}</h2>
              <div className="mt-2">
                <div className="flex justify-between text-sm text-slate-600 mb-1">
                  <span>التقدم</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 rounded-full h-2 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Modules */}
            <div className="flex-1 overflow-y-auto">
              {course.modules.map((mod: any, mi: number) => (
                <div key={mi} className="border-b border-slate-100">
                  <div className="px-4 py-3 bg-slate-50 font-medium text-sm text-slate-700">
                    الوحدة {mi + 1}: {mod.title}
                  </div>
                  {mod.lessons.map((lesson: any, li: number) => {
                    const isActive = mi === activeModuleIndex && li === activeLessonIndex;
                    const isCompleted = completedLessons.includes(lesson._id);

                    return (
                      <button
                        key={li}
                        onClick={() => selectLesson(mi, li)}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-right text-sm hover:bg-slate-50 transition-colors ${
                          isActive ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                        }`}
                      >
                        <span className="flex-shrink-0">
                          {isCompleted ? (
                            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <span className="text-gray-400">
                              {lesson.type === 'video' ? '🎥' : lesson.type === 'pdf' ? '📄' : '📝'}
                            </span>
                          )}
                        </span>
                        <span className={`flex-1 ${isActive ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>
                          {lesson.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Exam entry */}
            {courseExam && (
              <div className="border-t border-slate-200 p-3">
                <button
                  onClick={() => router.push(`/exams/take/${courseExam._id}`)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors text-right"
                >
                  <span className="text-xl">📝</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-blue-700">{courseExam.title}</div>
                    <div className="text-xs text-blue-500">
                      {courseExam.duration} دقيقة · درجة النجاح {courseExam.passingScore}%
                    </div>
                  </div>
                  <span className="text-blue-400 text-xs">←</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h3 className="font-medium text-slate-900">{activeLesson?.title}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevLesson}
                disabled={isFirstLesson}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default"
              >
                السابق ←
              </button>
              <button
                onClick={markComplete}
                disabled={completedLessons.includes(activeLesson?._id)}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-default"
              >
                {completedLessons.includes(activeLesson?._id) ? '✓ مكتمل' : 'تحديد كمكتمل'}
              </button>
              <button
                onClick={goToNextLesson}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default"
              >
                {isLastLesson && courseExam ? '← ابدأ الاختبار' : isLastLesson ? 'إنهاء الكورس' : '→ التالي'}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeLesson?.type === 'video' && contentUrl && (
              <SecureVideoPlayer
                src={contentUrl}
                title={activeLesson.title}
                controls={activeLesson.videoControls}
                onComplete={markComplete}
              />
            )}

            {activeLesson?.type === 'pdf' && contentUrl && (
              <SecurePdfViewer src={contentUrl} title={activeLesson.title} />
            )}

            {activeLesson?.type === 'text' && (
              <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">{activeLesson.title}</h2>
                <div className="prose prose-slate max-w-none whitespace-pre-line">
                  {activeLesson.content}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ContentProtection>
  );
}
