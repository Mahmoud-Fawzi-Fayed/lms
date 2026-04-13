'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import { ACADEMIC_YEARS } from '@/lib/validations';

const instructorLinks = [
  { href: '/dashboard/instructor', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/instructor/courses', label: 'كورساتي', icon: '📚' },
  { href: '/dashboard/instructor/courses/new', label: 'إنشاء كورس', icon: '➕' },
  { href: '/dashboard/instructor/exams', label: 'الاختبارات', icon: '📝' },
];

interface VideoControls {
  allowSpeed: boolean;
  allowSkip: boolean;
  allowFullscreen: boolean;
  allowSeek: boolean;
  allowVolume: boolean;
  forceFocus: boolean;
}

interface Lesson {
  title: string;
  type: 'video' | 'pdf' | 'text';
  content: string;
  duration: number;
  isPreview: boolean;
  file?: File;
  previewUrl?: string;
  videoControls: VideoControls;
}

interface Module {
  title: string;
  lessons: Lesson[];
}

export default function CreateCoursePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]));

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'instructor' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    shortDescription: '',
    category: '',
    level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    price: 0,
    discountPrice: 0,
    tags: '',
    requirements: '',
    whatYouWillLearn: '',
    targetYear: '',
  });

  const createLesson = (type: Lesson['type'], index: number): Lesson => ({
    title: `الدرس ${index}`,
    type,
    content: '',
    duration: type === 'video' ? 10 : 0,
    isPreview: false,
    videoControls: { allowSpeed: true, allowSkip: true, allowFullscreen: true, allowSeek: true, allowVolume: true, forceFocus: false },
  });

  const [modules, setModules] = useState<Module[]>([
    { title: 'الوحدة 1', lessons: [createLesson('video', 1)] },
  ]);

  const addModule = () => {
    const newIndex = modules.length;
    setModules([...modules, {
      title: `الوحدة ${newIndex + 1}`,
      lessons: [createLesson('video', 1)],
    }]);
    setExpandedModules((prev) => new Set([...prev, newIndex]));
  };

  const removeModule = (index: number) => {
    if (modules.length <= 1) return;
    setModules(modules.filter((_, i) => i !== index));
  };

  const addLesson = (moduleIndex: number) => {
    const updated = [...modules];
    updated[moduleIndex].lessons.push(createLesson('video', updated[moduleIndex].lessons.length + 1));
    setModules(updated);
  };

  const addLessonWithType = (moduleIndex: number, type: Lesson['type']) => {
    const updated = [...modules];
    updated[moduleIndex].lessons.push(createLesson(type, updated[moduleIndex].lessons.length + 1));
    setModules(updated);
  };

  const duplicateLesson = (moduleIndex: number, lessonIndex: number) => {
    const updated = [...modules];
    const source = updated[moduleIndex].lessons[lessonIndex];
    const clone: Lesson = {
      ...source,
      title: source.title ? `${source.title} (نسخة)` : `الدرس ${updated[moduleIndex].lessons.length + 1}`,
      file: undefined,
      previewUrl: undefined,
    };
    updated[moduleIndex].lessons.splice(lessonIndex + 1, 0, clone);
    setModules(updated);
  };

  const toggleModule = (index: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const applyQuickTemplate = () => {
    setModules([
      {
        title: 'الوحدة 1',
        lessons: [
          createLesson('video', 1),
          createLesson('text', 2),
          createLesson('pdf', 3),
        ],
      },
    ]);
    setExpandedModules(new Set([0]));
  };

  const removeLesson = (moduleIndex: number, lessonIndex: number) => {
    const updated = [...modules];
    if (updated[moduleIndex].lessons.length <= 1) return;
    updated[moduleIndex].lessons = updated[moduleIndex].lessons.filter((_, i) => i !== lessonIndex);
    setModules(updated);
  };

  const handleLessonFile = (moduleIndex: number, lessonIndex: number, file: File | null) => {
    const updated = [...modules];
    const oldPreview = updated[moduleIndex].lessons[lessonIndex].previewUrl;
    if (oldPreview) {
      URL.revokeObjectURL(oldPreview);
      previewUrlsRef.current.delete(oldPreview);
    }

    updated[moduleIndex].lessons[lessonIndex].file = file || undefined;
    if (file && updated[moduleIndex].lessons[lessonIndex].type === 'video') {
      const previewUrl = URL.createObjectURL(file);
      updated[moduleIndex].lessons[lessonIndex].previewUrl = previewUrl;
      previewUrlsRef.current.add(previewUrl);
    } else {
      updated[moduleIndex].lessons[lessonIndex].previewUrl = undefined;
    }
    setModules(updated);
  };

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  const updateModule = (index: number, field: string, value: string) => {
    const updated = [...modules];
    (updated[index] as any)[field] = value;
    setModules(updated);
  };

  const updateLesson = (moduleIndex: number, lessonIndex: number, field: string, value: any) => {
    const updated = [...modules];
    (updated[moduleIndex].lessons[lessonIndex] as any)[field] = value;
    setModules(updated);
  };

  const handleSubmit = async (publish: boolean) => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        description: form.description,
        shortDescription: form.shortDescription,
        category: form.category,
        level: form.level,
        price: Number(form.price),
        discountPrice: form.discountPrice ? Number(form.discountPrice) : undefined,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        requirements: form.requirements.split('\n').filter(Boolean),
        whatYouLearn: form.whatYouWillLearn.split('\n').filter(Boolean),
        isPublished: publish,
        targetYear: form.targetYear || undefined,
        modules: modules.map((m, mi) => ({
          title: m.title,
          order: mi + 1,
          lessons: m.lessons.map((l, li) => ({
            title: l.title,
            type: l.type,
            content: l.type === 'text' ? l.content : '',
            duration: Number(l.duration),
            isPreview: l.isPreview,
            order: li + 1,
            videoControls: l.type === 'video' ? l.videoControls : undefined,
          })),
        })),
      };

      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'فشل إنشاء الكورس');
        return;
      }

      const courseId = data.data._id;

      // Upload any selected files for video/pdf lessons
      const uploads: Promise<void>[] = [];
      modules.forEach((mod, mi) => {
        mod.lessons.forEach((lesson, li) => {
          if (lesson.file) {
            const fd = new FormData();
            fd.append('file', lesson.file);
            fd.append('moduleIndex', mi.toString());
            fd.append('lessonIndex', li.toString());
            fd.append('type', lesson.type);
            uploads.push(
              fetch(`/api/courses/${courseId}/upload`, { method: 'POST', body: fd }).then(() => {})
            );
          }
        });
      });
      if (uploads.length) await Promise.all(uploads);

      router.push('/dashboard/instructor/courses');
    } catch (err) {
      setError('حدث خطأ ما');
    } finally {
      setSaving(false);
    }
  };

  const canProceedToCurriculum =
    form.title.trim().length > 0 &&
    form.shortDescription.trim().length > 0 &&
    form.description.trim().length > 0 &&
    form.category.trim().length > 0;

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8 w-full max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">إنشاء كورس جديد</h1>
        <p className="text-slate-500 mb-8">املأ البيانات لإنشاء الكورس</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">{error}</div>
        )}

        {/* Step Indicator */}
        <div className="flex items-center gap-4 mb-8">
          {['المعلومات الأساسية', 'المنهج', 'مراجعة'].map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i + 1)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                step === i + 1
                  ? 'bg-blue-600 text-white'
                  : step > i + 1
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">
                {step > i + 1 ? '✓' : i + 1}
              </span>
              {label}
            </button>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">عنوان الكورس *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="مثال: دورة تطوير React الشاملة"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">وصف مختصر *</label>
              <input
                type="text"
                value={form.shortDescription}
                onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                placeholder="وصف موجز في سطر واحد"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">الوصف الكامل *</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={5}
                placeholder="وصف تفصيلي للكورس..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">السنة الدراسية المستهدفة</label>
                <select
                  value={form.targetYear}
                  onChange={(e) => setForm({ ...form, targetYear: e.target.value })}
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">للجميع</option>
                  {ACADEMIC_YEARS.map((y) => (
                    <option key={y.value} value={y.value}>{y.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">التصنيف</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="مثال: البرمجة"
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">المستوى</label>
                <select
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value as any })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="beginner">مبتدئ</option>
                  <option value="intermediate">متوسط</option>
                  <option value="advanced">متقدم</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">السعر (ج.م)</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  min={0}
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">سعر الخصم (ج.م)</label>
                <input
                  type="number"
                  value={form.discountPrice}
                  onChange={(e) => setForm({ ...form, discountPrice: Number(e.target.value) })}
                  min={0}
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">الوسوم (مفصولة بفواصل)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="react, javascript, برمجة"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">المتطلبات (واحد في كل سطر)</label>
              <textarea
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                rows={3}
                placeholder="معرفة أساسية بـ HTML&#10;جهاز كمبيوتر متصل بالإنترنت"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">ماذا ستتعلم (واحد في كل سطر)</label>
              <textarea
                value={form.whatYouWillLearn}
                onChange={(e) => setForm({ ...form, whatYouWillLearn: e.target.value })}
                rows={3}
                placeholder="بناء تطبيقات React حقيقية&#10;فهم React Hooks"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                disabled={!canProceedToCurriculum}
                onClick={() => setStep(2)}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                التالي: المنهج →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Curriculum */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-blue-800">تجهيز سريع للمنهج</div>
                <div className="text-xs text-blue-700">ابدأ بوحدة جاهزة (فيديو + نص + PDF) ثم عدّل بسهولة.</div>
              </div>
              <button
                type="button"
                onClick={applyQuickTemplate}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                تطبيق قالب سريع
              </button>
            </div>

            {modules.map((module, mi) => (
              <div key={mi} className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => toggleModule(mi)} className="text-slate-400 hover:text-slate-600">
                      <svg className={`w-4 h-4 transition-transform ${expandedModules.has(mi) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </button>
                    <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-sm font-bold">
                      {mi + 1}
                    </span>
                    <input
                      type="text"
                      value={module.title}
                      onChange={(e) => updateModule(mi, 'title', e.target.value)}
                      placeholder="عنوان الوحدة"
                      className="text-lg font-semibold border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1 py-0.5"
                    />
                  </div>
                  <button
                    onClick={() => removeModule(mi)}
                    className="text-red-500 hover:text-red-700 text-sm"
                    disabled={modules.length <= 1}
                  >
                    حذف
                  </button>
                </div>

                {expandedModules.has(mi) && (
                <div className="space-y-3 ml-11">
                  {module.lessons.map((lesson, li) => (
                    <div key={li} className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">الدرس {li + 1}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => duplicateLesson(mi, li)}
                            className="text-indigo-500 hover:text-indigo-700 text-xs"
                          >
                            نسخ
                          </button>
                          <button
                            onClick={() => removeLesson(mi, li)}
                            className="text-red-400 hover:text-red-600 text-xs"
                            disabled={module.lessons.length <= 1}
                          >
                            حذف
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={lesson.title}
                        onChange={(e) => updateLesson(mi, li, 'title', e.target.value)}
                        placeholder="عنوان الدرس"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />

                      <div className="grid grid-cols-3 gap-3">
                        <select
                          value={lesson.type}
                          onChange={(e) => {
                            const selectedType = e.target.value as Lesson['type'];
                            const updated = [...modules];
                            const current = updated[mi].lessons[li];
                            if (current.previewUrl) {
                              URL.revokeObjectURL(current.previewUrl);
                              previewUrlsRef.current.delete(current.previewUrl);
                            }
                            updated[mi].lessons[li] = {
                              ...current,
                              type: selectedType,
                              file: undefined,
                              previewUrl: undefined,
                              duration: selectedType === 'video' ? (current.duration || 10) : 0,
                            };
                            setModules(updated);
                          }}
                          className="px-3 py-2 border rounded-lg text-sm"
                        >
                          <option value="video">فيديو</option>
                          <option value="pdf">PDF</option>
                          <option value="text">نص</option>
                        </select>

                        <input
                          type="number"
                          value={lesson.duration}
                          onChange={(e) => updateLesson(mi, li, 'duration', e.target.value)}
                          placeholder="المدة (دقيقة)"
                          min={0}
                          className="px-3 py-2 border rounded-lg text-sm"
                        />

                        <label className="flex items-center gap-2 text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={lesson.isPreview}
                            onChange={(e) => updateLesson(mi, li, 'isPreview', e.target.checked)}
                            className="rounded"
                          />
                          معاينة مجانية
                        </label>
                      </div>

                      {lesson.type === 'text' ? (
                        <textarea
                          value={lesson.content}
                          onChange={(e) => updateLesson(mi, li, 'content', e.target.value)}
                          rows={4}
                          placeholder="محتوى الدرس النصي (يدعم markdown)..."
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        />
                      ) : (
                        <div>
                          <label
                            htmlFor={`file-${mi}-${li}`}
                            className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm"
                          >
                            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className={lesson.file ? 'text-green-700 font-medium' : 'text-slate-500'}>
                              {lesson.file ? `✓ ${lesson.file.name}` : `اختر ملف ${lesson.type === 'video' ? 'فيديو (MP4 / WebM)' : 'PDF'}`}
                            </span>
                          </label>
                          <input
                            id={`file-${mi}-${li}`}
                            type="file"
                            accept={lesson.type === 'video' ? 'video/mp4,video/webm,video/ogg' : 'application/pdf'}
                            className="hidden"
                            onChange={(e) => handleLessonFile(mi, li, e.target.files?.[0] || null)}
                          />
                          {lesson.type === 'video' && lesson.previewUrl && (
                            <div className="mt-3">
                              <video
                                src={lesson.previewUrl}
                                controls
                                className="w-full max-h-64 rounded-lg border border-slate-200 bg-black"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {lesson.type === 'video' && (
                        <div className="rounded-xl border border-slate-200 overflow-hidden mt-2">
                          <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 border-b border-slate-200">
                            <div className="w-5 h-5 bg-slate-800 rounded flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.08-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                              </svg>
                            </div>
                            <span className="text-xs font-semibold text-slate-700">إعدادات مشغّل الفيديو</span>
                          </div>
                          <div className="divide-y divide-slate-100 bg-white">
                            {([
                              { key: 'allowSpeed',      label: 'سرعة التشغيل',      desc: 'تحكم في سرعة عرض الفيديو',          path: 'M13 2.05v2.02c3.95.49 7 3.85 7 7.93s-3.05 7.44-7 7.93v2.02c5.05-.5 9-4.76 9-9.95S18.05 2.55 13 2.05zM7.1 18.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zm-1.6-3.85c-.6-1.04-.93-2.2-.93-3.47s.33-2.43.93-3.47L3.92 5.97A10.01 10.01 0 0 0 2 11h2c.12.97.37 1.84.69 2.65zM11 5.08V3.06C9.61 3.23 8.26 3.77 7.1 4.67L8.55 6.12C9.3 5.58 10.14 5.23 11 5.08z', iconCls: 'text-violet-600 bg-violet-50' },
                              { key: 'allowSkip',       label: 'التخطي',             desc: 'تقديم ورجوع بمقدار 10 ثوانٍ',       path: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',                                                              iconCls: 'text-blue-600 bg-blue-50' },
                              { key: 'allowSeek',       label: 'شريط التقدم',        desc: 'النقر للانتقال لأي لحظة',             path: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z',                                         iconCls: 'text-cyan-600 bg-cyan-50' },
                              { key: 'allowVolume',     label: 'التحكم بالصوت',      desc: 'ضبط مستوى الصوت وكتمه',            path: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z',                                                                                        iconCls: 'text-green-600 bg-green-50' },
                              { key: 'allowFullscreen', label: 'ملء الشاشة',         desc: 'مشاهدة الفيديو بالشاشة الكاملة',   path: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',                                                                                        iconCls: 'text-orange-600 bg-orange-50' },
                              { key: 'forceFocus',      label: 'التركيز الإجباري',   desc: 'إيقاف الفيديو عند مغادرة التبويب', path: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z', iconCls: 'text-rose-600 bg-rose-50' },
                            ] as { key: keyof VideoControls; label: string; desc: string; path: string; iconCls: string }[]).map(({ key: sk, label, desc, path, iconCls }) => (
                              <div key={sk} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconCls}`}>
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d={path} /></svg>
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-slate-800 leading-tight">{label}</div>
                                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{desc}</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => updateLesson(mi, li, 'videoControls', { ...lesson.videoControls, [sk]: !lesson.videoControls[sk] })}
                                  className={`relative w-10 h-5 rounded-full transition-all duration-200 flex-shrink-0 ms-3 ${lesson.videoControls[sk] ? 'bg-blue-600' : 'bg-slate-200'}`}
                                  title={lesson.videoControls[sk] ? 'تعطيل' : 'تفعيل'}
                                >
                                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${lesson.videoControls[sk] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => addLessonWithType(mi, 'video')}
                      className="py-2 border-2 border-dashed rounded-xl text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                    >
                      + درس فيديو
                    </button>
                    <button
                      type="button"
                      onClick={() => addLessonWithType(mi, 'text')}
                      className="py-2 border-2 border-dashed rounded-xl text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                    >
                      + درس نصي
                    </button>
                    <button
                      type="button"
                      onClick={() => addLessonWithType(mi, 'pdf')}
                      className="py-2 border-2 border-dashed rounded-xl text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                    >
                      + درس PDF
                    </button>
                  </div>
                </div>
                )}
              </div>
            ))}

            <button
              onClick={addModule}
              className="w-full py-3 border-2 border-dashed rounded-2xl text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors font-medium"
            >
              + إضافة وحدة
            </button>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
              >
                → رجوع
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                التالي: مراجعة →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">مراجعة الكورس</h2>

            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">العنوان:</span>
                  <p className="font-medium text-slate-900">{form.title || 'غير محدد'}</p>
                </div>
                <div>
                  <span className="text-slate-500">التصنيف:</span>
                  <p className="font-medium text-slate-900">{form.category || 'غير محدد'}</p>
                </div>
                <div>
                  <span className="text-slate-500">المستوى:</span>
                  <p className="font-medium text-slate-900 capitalize">{form.level === 'beginner' ? 'مبتدئ' : form.level === 'intermediate' ? 'متوسط' : 'متقدم'}</p>
                </div>
                <div>
                  <span className="text-slate-500">السعر:</span>
                  <p className="font-medium text-slate-900">
                    {form.price === 0 ? 'مجاني' : `${form.price} ج.م`}
                    {form.discountPrice > 0 && ` (خصم: ${form.discountPrice} ج.م)`}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-sm text-slate-500">الوحدات: {modules.length}</span>
                <div className="mt-2 space-y-2">
                  {modules.map((m, i) => (
                    <div key={i} className="text-sm text-slate-700">
                      {i + 1}. {m.title || 'بدون عنوان'} ({m.lessons.length} درس)
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
              >
                → رجوع
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={saving}
                  className="px-6 py-3 bg-slate-200 text-slate-800 rounded-xl hover:bg-slate-300 transition-colors font-medium disabled:opacity-50"
                >
                  حفظ كمسودة
                </button>
                <button
                  onClick={() => handleSubmit(true)}
                  disabled={saving}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? 'جاري الإنشاء...' : 'نشر الكورس'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardSidebar>
  );
}
