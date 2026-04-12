'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ContentProtection from '@/components/ContentProtection';
import toast from 'react-hot-toast';

const draftKey = (attemptId: string) => `exam_draft_${attemptId}`;

export default function TakeExamPage() {
  const { id } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [exam, setExam] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, { selectedOption?: string; answer?: string }>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Stable refs — prevent stale closures in timer/event callbacks
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submittingRef = useRef(false);
  const answersRef = useRef<Record<string, { selectedOption?: string; answer?: string }>>({});
  const examRef = useRef<any>(null);
  const attemptRef = useRef<any>(null);
  const startedAtRef = useRef<number>(0);   // epoch ms
  const durationRef = useRef<number>(0);    // exam duration in minutes

  // Keep answersRef in sync with state on every render
  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/exams/take/' + id);
    }
  }, [status]);

  useEffect(() => {
    startExam();
    return () => stopTimer();
  }, [id]);

  // Correct timer drift when user switches back to the tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && examRef.current && !submittingRef.current) {
        const remaining = calcRemaining();
        setTimeLeft(remaining);
        if (remaining <= 0) {
          stopTimer();
          doAutoSubmit();
        } else {
          restartTimer();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Save draft and warn before the tab is closed / navigated away
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (examRef.current && attemptRef.current && !submittingRef.current) {
        localStorage.setItem(draftKey(attemptRef.current._id), JSON.stringify(answersRef.current));
        e.preventDefault();
        e.returnValue = 'لديك اختبار جارٍ، هل أنت متأكد من المغادرة؟';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // ── Timer helpers ──────────────────────────────────────────────────────────

  const calcRemaining = () => {
    if (!startedAtRef.current || !durationRef.current) return 0;
    return Math.max(0, Math.floor(durationRef.current * 60 - (Date.now() - startedAtRef.current) / 1000));
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const restartTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      const remaining = calcRemaining();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        stopTimer();
        doAutoSubmit();
      }
    }, 1000);
  };

  const doAutoSubmit = () => {
    if (submittingRef.current || !examRef.current || !attemptRef.current) return;
    handleSubmit(true);
  };

  // ── API calls ──────────────────────────────────────────────────────────────

  const startExam = async () => {
    try {
      const res = await fetch(`/api/exams/${id}/start`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'فشل بدء الاختبار');
        router.back();
        return;
      }

      const examData  = data.data.exam;
      const attemptData = data.data.attempt;
      const serverTimedOut = data.data.timedOut;

      examRef.current      = examData;
      attemptRef.current   = attemptData;
      startedAtRef.current = new Date(attemptData.startedAt).getTime();
      durationRef.current  = examData.duration;

      setExam(examData);
      setAttempt(attemptData);

      // Restore saved draft answers (survives page refresh)
      try {
        const saved = localStorage.getItem(draftKey(attemptData._id));
        if (saved) {
          const parsed = JSON.parse(saved);
          setAnswers(parsed);
          answersRef.current = parsed;
          toast('تم استعادة إجاباتك السابقة', { icon: 'ℹ️', duration: 3000 });
        }
      } catch { /* ignore invalid localStorage data */ }

      if (serverTimedOut) {
        // Server says time already ran out — submit what we have immediately
        setTimeLeft(0);
        setTimeout(doAutoSubmit, 100);
      } else {
        const remaining = calcRemaining();
        setTimeLeft(remaining);
        if (remaining <= 0) {
          doAutoSubmit();
        } else {
          restartTimer();
        }
      }
    } catch {
      toast.error('فشل بدء الاختبار');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionId: string, value: { selectedOption?: string; answer?: string }) => {
    setAnswers(prev => {
      const updated = { ...prev, [questionId]: value };
      answersRef.current = updated;
      if (attemptRef.current) {
        localStorage.setItem(draftKey(attemptRef.current._id), JSON.stringify(updated));
      }
      return updated;
    });
  };

  const handleSubmit = async (timedOut = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    stopTimer();

    // Capture stable refs — avoids stale closure issues
    const currentExam    = examRef.current;
    const currentAttempt = attemptRef.current;
    const currentAnswers = answersRef.current;

    if (!currentExam || !currentAttempt) {
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    try {
      const formattedAnswers = currentExam.questions.map((q: any) => ({
        questionId: q._id,
        selectedOption: currentAnswers[q._id]?.selectedOption,
        answer: currentAnswers[q._id]?.answer,
      }));

      const res = await fetch('/api/exams/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: currentExam._id,
          attemptId: currentAttempt._id,
          answers: formattedAnswers,
        }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.removeItem(draftKey(currentAttempt._id));
        setResult(data.data);
        toast.success(timedOut ? 'انتهى الوقت! تم تسليم الاختبار تلقائياً.' : 'تم تسليم الاختبار!');
      } else {
        toast.error(data.error || 'فشل التسليم');
        submittingRef.current = false;
        setSubmitting(false);
      }
    } catch {
      toast.error('فشل تسليم الاختبار');
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">جاري تحميل الاختبار...</p>
        </div>
      </div>
    );
  }

  if (!exam) return null;

  // Show result
  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 py-12">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center">
            <div className="text-6xl mb-4">
              {result.passed ? '🎉' : '😔'}
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {result.passed ? 'تهانينا!' : 'حظ أوفر في المرة القادمة!'}
            </h1>
            <p className="text-slate-600 mb-8">
              {result.passed
                ? 'لقد اجتزت الاختبار!'
                : 'لا تقلق، يمكنك المحاولة مرة أخرى.'}
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-50 rounded-xl p-4">
                <div className={`text-3xl font-bold ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {result.score}%
                </div>
                <div className="text-sm text-slate-600 mt-1">الدرجة</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-3xl font-bold text-slate-900">
                  {result.earnedPoints}/{result.totalPoints}
                </div>
                <div className="text-sm text-slate-600 mt-1">النقاط</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-3xl font-bold text-slate-900">
                  {formatTimer(result.timeSpent)}
                </div>
                <div className="text-sm text-slate-600 mt-1">الوقت</div>
              </div>
            </div>

            {/* Detailed results */}
            {result.details && (
              <div className="text-right mb-8">
                <h3 className="font-semibold text-slate-900 mb-4">نتائج الأسئلة</h3>
                <div className="space-y-3">
                  {result.details.map((detail: any, i: number) => (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border ${
                        detail.isCorrect
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={detail.isCorrect ? 'text-green-500' : 'text-red-500'}>
                          {detail.isCorrect ? '✓' : '✗'}
                        </span>
                        <div>
                          <p className="font-medium text-slate-900">{detail.question}</p>
                          {!detail.isCorrect && detail.correctAnswer && (
                            <p className="text-sm text-slate-600 mt-1">
                              الإجابة الصحيحة: <span className="font-medium">{detail.correctAnswer}</span>
                            </p>
                          )}
                          {detail.explanation && (
                            <p className="text-sm text-slate-500 mt-1 italic">{detail.explanation}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push(`/exams/${id}/leaderboard`)}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                عرض قائمة المتفوقين
              </button>
              <button
                onClick={() => router.back()}
                className="px-6 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
              >
                العودة للكورس
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;

  return (
    <ContentProtection watermarkText={session?.user?.email || ''}>
      <div className="min-h-screen bg-slate-50">
        {/* Timer Bar */}
        <div className="bg-white border-b border-slate-100 sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{exam.title}</h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">
                {answeredCount}/{exam.questions.length} تمت الإجابة
              </span>
              <div
                className={`px-4 py-1.5 rounded-lg font-mono font-bold text-lg ${
                  timeLeft < 60
                    ? 'bg-red-100 text-red-700 animate-pulse'
                    : timeLeft < 300
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {formatTimer(timeLeft)}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Question Navigator */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sticky top-20">
                <h3 className="font-semibold text-slate-900 mb-3">الأسئلة</h3>
                <div className="grid grid-cols-5 gap-2">
                  {exam.questions.map((_: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => setCurrentQuestionIndex(i)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        i === currentQuestionIndex
                          ? 'bg-primary-600 text-white'
                          : answers[exam.questions[i]._id]
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={submitting}
                  className="w-full mt-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {submitting ? 'جاري التسليم...' : 'تسليم الاختبار'}
                </button>
              </div>
            </div>

            {/* Question Content */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm text-slate-500">
                    السؤال {currentQuestionIndex + 1} من {exam.questions.length}
                  </span>
                  <span className="text-sm text-blue-600 font-medium">
                    {currentQuestion.points} {currentQuestion.points !== 1 ? 'نقاط' : 'نقطة'}
                  </span>
                </div>

                <h3 className="text-xl font-semibold text-slate-900 mb-8">
                  {currentQuestion.text}
                </h3>

                {/* MCQ / True-False */}
                {(currentQuestion.type === 'mcq' || currentQuestion.type === 'single' || currentQuestion.type === 'truefalse') && (() => {
                  const rawOptions: any[] = currentQuestion.options ?? [];
                  const displayOptions =
                    rawOptions.length > 0
                      ? rawOptions
                      : currentQuestion.type === 'truefalse'
                      ? [{ text: 'صح', _id: 'true' }, { text: 'خطأ', _id: 'false' }]
                      : [];

                  if (displayOptions.length === 0) {
                    return (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
                        لا توجد خيارات لهذا السؤال. يرجى التواصل مع المدرس.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {displayOptions.map((option: any, oi: number) => {
                        const isSelected = answers[currentQuestion._id]?.selectedOption === option.text;
                        return (
                          <button
                            key={oi}
                            onClick={() =>
                              handleAnswer(currentQuestion._id, {
                                selectedOption: option.text,
                              })
                            }
                            className={`w-full p-4 rounded-xl border-2 text-right transition-all ${
                              isSelected
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                  isSelected
                                    ? 'border-primary-500 bg-primary-500'
                                    : 'border-gray-300'
                                }`}
                              >
                                {isSelected && (
                                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span className="text-gray-900">{option.text}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Fill in blank */}
                {currentQuestion.type === 'fillinblank' && (
                  <div>
                    <input
                      type="text"
                      value={answers[currentQuestion._id]?.answer || ''}
                      onChange={e =>
                        handleAnswer(currentQuestion._id, { answer: e.target.value })
                      }
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 outline-none text-lg"
                      placeholder="اكتب إجابتك هنا..."
                      autoComplete="off"
                    />
                  </div>
                )}

                {/* Navigation */}
                <div className="flex justify-between mt-8">
                  <button
                    onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="px-6 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    السابق ←
                  </button>
                  <button
                    onClick={() =>
                      setCurrentQuestionIndex(
                        Math.min(exam.questions.length - 1, currentQuestionIndex + 1)
                      )
                    }
                    disabled={currentQuestionIndex === exam.questions.length - 1}
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    → التالي
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">تأكيد تسليم الاختبار</h3>
            <p className="text-slate-600 text-sm mb-6">هل أنت متأكد من التسليم؟ لن تتمكن من تعديل الإجابات بعد ذلك.</p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  handleSubmit();
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              >
                نعم، تسليم الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </ContentProtection>
  );
}
