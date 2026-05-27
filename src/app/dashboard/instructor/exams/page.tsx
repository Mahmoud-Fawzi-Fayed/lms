'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';
import { ACADEMIC_YEARS } from '@/lib/validations';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function InstructorExamsPage() {
  const { data: session, status } = useSession();
  useLang();
  const instructorLinks = [
    { href: '/dashboard/instructor', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/instructor/courses', label: t('كورساتي', 'My Courses'), icon: '📚' },
    { href: '/dashboard/instructor/courses/new', label: t('إنشاء كورس', 'Create Course'), icon: '➕' },
    { href: '/dashboard/instructor/exams', label: t('الاختبارات', 'Exams'), icon: '📝' },
  ];
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'instructor' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchData();
  }, [status]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    course: '',
    targetYear: '',
    accessType: 'free' as 'free' | 'paid',
    price: 0,
    discountPrice: 0,
    durationMinutes: 30,
    passingScore: 60,
    maxAttempts: 3,
    shuffleQuestions: false,
    shuffleOptions: false,
    showResults: true,
    isPublished: false,
    isPreview: false,
    questions: [
      {
        type: 'mcq' as 'mcq' | 'single' | 'truefalse' | 'fillinblank',
        text: '',
        options: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
        ],
        correctAnswer: '',
        points: 1,
      },
    ],
  });

  const fetchData = async () => {
    try {
      const [examsRes, statsRes] = await Promise.all([
        fetch('/api/exams'),
        fetch('/api/instructor/stats'),
      ]);
      const examsData = await examsRes.json();
      const statsData = await statsRes.json();
      if (examsData.success) setExams(examsData.data.exams || []);
      if (statsData.success) setCourses(statsData.data.courses || []);
    } catch {
      toast.error(t('فشل تحميل البيانات', 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    setForm({
      ...form,
      questions: [
        ...form.questions,
        {
          type: 'mcq',
          text: '',
          options: [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
          ],
          correctAnswer: '',
          points: 1,
        },
      ],
    });
  };

  const removeQuestion = (index: number) => {
    if (form.questions.length <= 1) return;
    setForm({
      ...form,
      questions: form.questions.filter((_, i) => i !== index),
    });
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const updated = [...form.questions];
    (updated[index] as any)[field] = value;

    // Reset options for question type changes
    if (field === 'type') {
      if (value === 'truefalse') {
        updated[index].options = [
          { text: t('صح', 'True'), isCorrect: true },
          { text: t('خطأ', 'False'), isCorrect: false },
        ];
      } else if (value === 'mcq') {
        updated[index].options = [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
        ];
      }
    }

    setForm({ ...form, questions: updated });
  };

  const updateOption = (qi: number, oi: number, field: string, value: any) => {
    const updated = [...form.questions];
    if (field === 'isCorrect' && value === true) {
      // Only one correct answer
      updated[qi].options = updated[qi].options.map((o, i) => ({
        ...o,
        isCorrect: i === oi,
      }));
    } else {
      (updated[qi].options[oi] as any)[field] = value;
    }
    setForm({ ...form, questions: updated });
  };

  const addOption = (qi: number) => {
    const updated = [...form.questions];
    updated[qi].options = [...updated[qi].options, { text: '', isCorrect: false }];
    setForm({ ...form, questions: updated });
  };

  const removeOption = (qi: number, oi: number) => {
    const updated = [...form.questions];
    if (updated[qi].options.length <= 2) return;
    const hadCorrect = updated[qi].options[oi].isCorrect;
    updated[qi].options = updated[qi].options.filter((_, i) => i !== oi);
    // If the removed option was correct, make first one correct
    if (hadCorrect && updated[qi].options.length > 0) {
      updated[qi].options[0].isCorrect = true;
    }
    setForm({ ...form, questions: updated });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        course: form.course || undefined,
        ...(form.targetYear && { targetYear: form.targetYear }),
        accessType: form.course ? 'free' : form.accessType,
        price: form.course || form.accessType === 'free' ? 0 : Number(form.price),
        discountPrice: form.course || form.accessType === 'free' ? undefined : Number(form.discountPrice || 0),
        duration: Number(form.durationMinutes),
        passingScore: Number(form.passingScore),
        maxAttempts: Number(form.maxAttempts),
        shuffleQuestions: form.shuffleQuestions,
        shuffleOptions: form.shuffleOptions,
        showResults: form.showResults,
        isPublished: form.isPublished,
        isPreview: form.isPreview,
        questions: form.questions.map((q, qi) => ({
          ...q,
          points: Number(q.points),
          order: qi,
          options: q.type !== 'fillinblank'
            ? q.options.filter(o => o.text.trim() !== '')
            : undefined,
        })),
      };

      const url = editingExamId ? `/api/exams/${editingExamId}` : '/api/exams';
      const method = editingExamId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setEditingExamId(null);
        setForm({
          title: '',
          description: '',
          course: '',
          targetYear: '',
          accessType: 'free',
          price: 0,
          discountPrice: 0,
          durationMinutes: 30,
          passingScore: 60,
          maxAttempts: 3,
          shuffleQuestions: false,
          shuffleOptions: false,
          showResults: true,
          isPublished: false,
          isPreview: false,
          questions: [{
            type: 'mcq',
            text: '',
            options: [
              { text: '', isCorrect: true },
              { text: '', isCorrect: false },
              { text: '', isCorrect: false },
              { text: '', isCorrect: false },
            ],
            correctAnswer: '',
            points: 1,
          }],
        });
        fetchData();
      } else {
        toast.error(data.error || (editingExamId ? t('فشل تحديث الاختبار', 'Update failed') : t('فشل إنشاء الاختبار', 'Create failed')));
      }
    } catch {
      toast.error(t('خطأ في الحفظ', 'Save error'));
    } finally {
      setSaving(false);
    }
  };

  const deleteExam = async (examId: string) => {
    if (!confirm(t('حذف هذا الاختبار؟', 'Delete this exam?'))) return;
    try {
      const res = await fetch(`/api/exams/${examId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) { toast.error(data.error || t('فشل الحذف', 'Delete failed')); return; }
      toast.success(t('تم حذف الاختبار', 'Exam deleted'));
      fetchData();
    } catch {
      toast.error(t('خطأ في الحذف', 'Delete error'));
    }
  };

  const cancelForm = () => {
    setShowCreate(false);
    setEditingExamId(null);
  };

  const openEdit = async (exam: any) => {
    try {
      const res = await fetch(`/api/exams/${exam._id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) {
        toast.error(t('فشل تحميل بيانات الاختبار', 'Failed to load exam'));
        return;
      }
      const e = data.data.exam;
      setForm({
        title: e.title,
        description: e.description || '',
        course: typeof e.course === 'object' ? e.course?._id ?? '' : (e.course ?? ''),
        targetYear: e.targetYear || '',
        accessType: e.accessType || ((e.discountPrice ?? e.price ?? 0) > 0 ? 'paid' : 'free'),
        price: Number(e.price || 0),
        discountPrice: Number(e.discountPrice || 0),
        durationMinutes: e.duration,
        passingScore: e.passingScore,
        maxAttempts: e.maxAttempts,
        shuffleQuestions: !!e.shuffleQuestions,
        shuffleOptions: !!e.shuffleOptions,
        showResults: e.showResults !== false,
        isPublished: e.isPublished,
        isPreview: !!e.isPreview,
        questions: e.questions.map((q: any) => ({
          type: q.type === 'single' ? 'mcq' : q.type,
          text: q.text,
          options:
            q.options && q.options.length > 0
              ? q.options
              : q.type === 'truefalse'
              ? [{ text: t('صح', 'True'), isCorrect: true }, { text: t('خطأ', 'False'), isCorrect: false }]
              : [
                  { text: '', isCorrect: true },
                  { text: '', isCorrect: false },
                  { text: '', isCorrect: false },
                  { text: '', isCorrect: false },
                ],
          correctAnswer: q.correctAnswer || '',
          points: q.points,
        })),
      });
      setEditingExamId(exam._id);
      setShowCreate(true);
    } catch {
      toast.error(t('حدث خطأ ما', 'An error occurred'));
    }
  };

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{t('الاختبارات', 'Exams')}</h1>
          <button
            onClick={() => (showCreate ? cancelForm() : setShowCreate(true))}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            {showCreate ? t('إلغاء', 'Cancel') : `+ ${t('إنشاء اختبار', 'Create Exam')}`}
          </button>
        </div>

        {/* Create Exam Form */}
        {showCreate && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 space-y-6">
<h2 className="font-semibold text-slate-900">{editingExamId ? t('تعديل الاختبار', 'Edit Exam') : t('اختبار جديد', 'New Exam')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('العنوان', 'Title')} *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={t('عنوان الاختبار', 'Exam title')}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('الكورس (اختياري)', 'Course (optional)')}</label>
                <select
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">{t('اختبار مستقل (بدون كورس)', 'Independent exam (no course)')}</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>{c.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('السنة الدراسية المستهدفة', 'Target Academic Year')} *</label>
              <select
                value={form.targetYear}
                onChange={(e) => setForm({ ...form, targetYear: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">{t('اختر السنة الدراسية', 'Select academic year')}</option>
                {ACADEMIC_YEARS.map((y) => (
                  <option key={y.value} value={y.value}>{y.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('الوصف', 'Description')}</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            {!form.course && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('نوع الوصول', 'Access Type')}</label>
                  <select
                    value={form.accessType}
                    onChange={(e) => {
                      const nextAccessType = e.target.value as 'free' | 'paid';
                      setForm({
                        ...form,
                        accessType: nextAccessType,
                        price: nextAccessType === 'free' ? 0 : form.price,
                        discountPrice: nextAccessType === 'free' ? 0 : form.discountPrice,
                      });
                    }}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="free">{t('مجاني', 'Free')}</option>
                    <option value="paid">{t('مدفوع', 'Paid')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('السعر (ج.م)', 'Price (EGP)')}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    disabled={form.accessType === 'free'}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('سعر بعد الخصم (اختياري)', 'Discounted price (optional)')}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.discountPrice}
                    onChange={(e) => setForm({ ...form, discountPrice: Number(e.target.value) })}
                    disabled={form.accessType === 'free'}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('المدة (دقيقة)', 'Duration (minutes)')}</label>
                <input
                  type="number"
                  value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                  min={1}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('درجة النجاح (%)', 'Passing Score (%)')}</label>
                <input
                  type="number"
                  value={form.passingScore}
                  onChange={(e) => setForm({ ...form, passingScore: Number(e.target.value) })}
                  min={0}
                  max={100}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('أقصى عدد محاولات', 'Max Attempts')}</label>
                <input
                  type="number"
                  value={form.maxAttempts}
                  onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })}
                  min={1}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Questions */}
            <div>
              <h3 className="font-medium text-slate-900 mb-4">{t('الأسئلة', 'Questions')}</h3>
              <div className="space-y-4">
                {form.questions.map((q, qi) => (
                  <div key={qi} className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">{t('السؤال', 'Question')} {qi + 1}</span>
                      <div className="flex items-center gap-3">
                        <select
                          value={q.type}
                          onChange={(e) => updateQuestion(qi, 'type', e.target.value)}
                          className="text-sm border rounded-lg px-2 py-1"
                        >
                          <option value="mcq">{t('اختيار من متعدد', 'Multiple choice')}</option>
                          <option value="truefalse">{t('صح / خطأ', 'True / False')}</option>
                          <option value="fillinblank">{t('أكمل الفراغ', 'Fill in the blank')}</option>
                        </select>
                        <input
                          type="number"
                          value={q.points}
                          onChange={(e) => updateQuestion(qi, 'points', e.target.value)}
                          min={1}
                          className="w-16 text-sm border rounded-lg px-2 py-1"
                          title={t('النقاط', 'Points')}
                        />
                        <button
                          onClick={() => removeQuestion(qi)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          {t('حذف', 'Delete')}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={q.text}
                      onChange={(e) => updateQuestion(qi, 'text', e.target.value)}
                      placeholder={t('نص السؤال...', 'Question text...')}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />

                    {q.type === 'fillinblank' ? (
                      <input
                        type="text"
                        value={q.correctAnswer}
                        onChange={(e) => updateQuestion(qi, 'correctAnswer', e.target.value)}
                        placeholder={t('الإجابة الصحيحة', 'Correct answer')}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      <div className="space-y-2">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${qi}`}
                              checked={opt.isCorrect}
                              onChange={() => updateOption(qi, oi, 'isCorrect', true)}
                              className="text-blue-600"
                            />
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => updateOption(qi, oi, 'text', e.target.value)}
                              placeholder={`${t('الخيار', 'Option')} ${oi + 1}`}
                              className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
                              disabled={q.type === 'truefalse'}
                            />
                            {q.type === 'mcq' && q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeOption(qi, oi)}
                                className="text-red-400 hover:text-red-600 text-xs px-1"
                                title={t('حذف الخيار', 'Delete option')}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        {q.type === 'mcq' && (
                          <button
                            type="button"
                            onClick={() => addOption(qi)}
                            className="text-sm text-blue-500 hover:text-blue-700 mt-1"
                          >
                            + {t('إضافة خيار', 'Add option')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addQuestion}
                className="mt-4 w-full py-2 border-2 border-dashed rounded-xl text-sm text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
              >
                + {t('إضافة سؤال', 'Add question')}
              </button>
            </div>

            {/* Settings toggles */}
            <div className="bg-slate-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('إعدادات الاختبار', 'Exam Settings')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { key: 'showResults',       label: t('إظهار النتائج للطالب بعد التسليم', 'Show results to student after submission') },
                  { key: 'shuffleQuestions',  label: t('ترتيب عشوائي للأسئلة', 'Shuffle questions') },
                  { key: 'shuffleOptions',    label: t('ترتيب عشوائي للإجابات', 'Shuffle options') },
                  { key: 'isPublished',       label: t('نشر الاختبار', 'Publish exam') },
                  ...(form.course ? [{ key: 'isPreview', label: t('معاينة مجانية (متاح بدون تسجيل في الكورس)', 'Free preview (available without course enrollment)') }] : []),
                ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-3 cursor-pointer select-none bg-white rounded-lg px-3 py-2 border border-slate-100">
                    <span className="text-sm text-slate-700">{label}</span>
                    <div
                      onClick={() => setForm(prev => ({ ...prev, [key]: !prev[key] }))}
                      className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${
                        form[key] ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 bg-white rounded-full shadow transition-all duration-200 ${
                          form[key] ? 'right-0.5' : 'left-0.5'
                        }`}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
              >
                {saving
                  ? editingExamId ? t('جاري الحفظ...', 'Saving...') : t('جاري الإنشاء...', 'Creating...')
                  : editingExamId ? t('حفظ التغييرات', 'Save Changes') : t('إنشاء الاختبار', 'Create Exam')}
              </button>
            </div>
          </div>
        )}

        {/* Exams List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('الاختبار', 'Exam')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('الكورس', 'Course')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('السنة', 'Year')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('السعر', 'Price')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('الأسئلة', 'Questions')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('المدة', 'Duration')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('الحالة', 'Status')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500">{t('إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : exams.length > 0 ? (
                  exams.map((exam) => (
                    <tr key={exam._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{exam.title}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{exam.course?.title || t('اختبار مستقل', 'Independent exam')}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{ACADEMIC_YEARS.find(y => y.value === exam.targetYear)?.label || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {exam.course ? (
                          <span className="inline-flex px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">{t('ضمن الكورس', 'Within course')}</span>
                        ) : ((exam.accessType === 'free' ? 0 : (exam.discountPrice ?? exam.price ?? 0)) > 0 ? (
                          <span className="font-semibold text-blue-700">{exam.discountPrice ?? exam.price} {t('ج.م', 'EGP')}</span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">{t('مجاني', 'Free')}</span>
                        ))}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{exam.questions?.length || 0}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{exam.duration} {t('دقيقة', 'min')}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          exam.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {exam.isPublished ? t('منشور', 'Published') : t('مسودة', 'Draft')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEdit(exam)}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {t('تعديل', 'Edit')}
                          </button>
                          <Link
                            href={`/exams/${exam._id}/leaderboard`}
                            className="text-sm text-slate-500 hover:text-slate-800"
                          >
                            {t('المتصدرين', 'Leaderboard')}
                          </Link>
                          <button
                            onClick={() => deleteExam(exam._id)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            {t('حذف', 'Delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">{t('لا توجد اختبارات بعد', 'No exams yet')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardSidebar>
  );
}
