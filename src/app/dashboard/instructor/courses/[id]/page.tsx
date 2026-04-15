'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
import { uploadFileWithProgress } from '@/lib/upload-client';
import { ACADEMIC_YEARS } from '@/lib/validations';

type LessonType = 'video' | 'pdf' | 'text';

interface Lesson {
  _id?: string;
  title: string;
  type: LessonType;
  content?: string;
  fileUrl?: string;
  order: number;
  isPreview: boolean;
  videoControls?: Record<string, boolean>;
}

interface Module {
  _id?: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

const instructorLinks = [
  { href: '/dashboard/instructor', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/instructor/courses', label: 'كورساتي', icon: '📚' },
  { href: '/dashboard/instructor/courses/new', label: 'إنشاء كورس', icon: '➕' },
  { href: '/dashboard/instructor/exams', label: 'الاختبارات', icon: '📝' },
];

export default function EditCoursePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: session, status } = useSession();
  const router = useRouter();

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<any>({
    title: '', description: '', shortDescription: '',
    category: '', level: 'beginner', price: 0, discountPrice: 0,
    isPublished: false, targetYear: '', thumbnail: '', modules: [] as Module[],
  });

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailProgress, setThumbnailProgress] = useState(0);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [filePreviewUrls, setFilePreviewUrls] = useState<Record<string, string>>({});
  const [lessonSettings, setLessonSettings] = useState<Record<string, any>>({});
  const [savingSettings, setSavingSettings] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]));

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => {
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'instructor' && role !== 'admin') router.push('/dashboard');
    }
  }, [status, session]);

  useEffect(() => { fetchCourse(); }, [id]);

  const fetchCourse = async () => {
    try {
      const res = await fetch(`/api/courses/${id}`);
      const data = await res.json();
      if (data.success) {
        const c = data.data.course || data.data;
        setCourse(c);
        const settings: Record<string, any> = {};
        (c.modules || []).forEach((mod: any, mi: number) => {
          (mod.lessons || []).forEach((lesson: any, li: number) => {
            if (lesson.type === 'video') {
              settings[`${mi}-${li}`] = {
                allowSpeed:      lesson.videoControls?.allowSpeed      ?? true,
                allowSkip:       lesson.videoControls?.allowSkip       ?? true,
                allowFullscreen: lesson.videoControls?.allowFullscreen ?? true,
                allowSeek:       lesson.videoControls?.allowSeek       ?? true,
                allowVolume:     lesson.videoControls?.allowVolume     ?? true,
                forceFocus:      lesson.videoControls?.forceFocus      ?? false,
              };
            }
          });
        });
        setLessonSettings(settings);
        setForm({
          title: c.title,
          description: c.description,
          shortDescription: c.shortDescription || '',
          category: c.category || '',
          level: c.level || 'beginner',
          price: c.price,
          discountPrice: c.discountPrice || 0,
          isPublished: c.isPublished,
          targetYear: c.targetYear || '',
          thumbnail: c.thumbnail || '',
          modules: (c.modules || []).map((mod: any) => ({
            _id: mod._id,
            title: mod.title,
            order: mod.order,
            lessons: (mod.lessons || []).map((l: any) => ({
              _id: l._id,
              title: l.title,
              type: l.type,
              content: l.content || '',
              fileUrl: l.fileUrl,
              order: l.order,
              isPreview: l.isPreview || false,
              videoControls: l.videoControls,
            })),
          })),
        });
      }
    } catch {
      console.error('Failed to fetch course');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/courses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/dashboard/instructor/courses');
      } else {
        setError(data.error || 'فشل التحديث');
      }
    } catch {
      setError('حدث خطأ ما');
    } finally {
      setSaving(false);
    }
  };

  const handleThumbnailUpload = async (file: File) => {
    setUploadingThumbnail(true);
    setThumbnailProgress(0);
    setUploadError('');
    try {
      const data = await uploadFileWithProgress({
        url: `/api/courses/${id}/upload`,
        file,
        fields: { type: 'thumbnail' },
        onProgress: setThumbnailProgress,
      });

      if (data.success) {
        setForm((prev: any) => ({ ...prev, thumbnail: data.data.thumbnail }));
      } else {
        setUploadError(data.error || 'فشل رفع الصورة');
      }
    } catch (e: any) {
      setUploadError(e?.message || 'فشل رفع الصورة');
    } finally {
      setUploadingThumbnail(false);
      setTimeout(() => setThumbnailProgress(0), 600);
    }
  };

  const addModule = () => {
    const idx = form.modules.length;
    setForm((prev: any) => ({
      ...prev,
      modules: [...prev.modules, { title: `وحدة ${idx + 1}`, order: idx, lessons: [] }],
    }));
    setExpandedModules(prev => new Set([...prev, idx]));
  };

  const removeModule = (mi: number) => {
    setForm((prev: any) => ({ ...prev, modules: prev.modules.filter((_: any, i: number) => i !== mi) }));
  };

  const updateModuleTitle = (mi: number, title: string) => {
    setForm((prev: any) => {
      const modules = [...prev.modules];
      modules[mi] = { ...modules[mi], title };
      return { ...prev, modules };
    });
  };

  const addLesson = (mi: number) => {
    setForm((prev: any) => {
      const modules = [...prev.modules];
      const lessons = [...(modules[mi].lessons || []), {
        title: `درس ${(modules[mi].lessons?.length || 0) + 1}`,
        type: 'text' as LessonType,
        content: '',
        order: modules[mi].lessons?.length || 0,
        isPreview: false,
      }];
      modules[mi] = { ...modules[mi], lessons };
      return { ...prev, modules };
    });
  };

  const removeLesson = (mi: number, li: number) => {
    setForm((prev: any) => {
      const modules = [...prev.modules];
      modules[mi] = { ...modules[mi], lessons: modules[mi].lessons.filter((_: any, i: number) => i !== li) };
      return { ...prev, modules };
    });
  };

  const updateLesson = (mi: number, li: number, updates: Partial<Lesson>) => {
    setForm((prev: any) => {
      const modules = [...prev.modules];
      const lessons = [...modules[mi].lessons];
      lessons[li] = { ...lessons[li], ...updates };
      modules[mi] = { ...modules[mi], lessons };
      return { ...prev, modules };
    });
  };

  const handleFileUpload = async (mi: number, li: number, file: File, lessonType: string) => {
    const MAX_SIZE = lessonType === 'video' ? Math.floor(1.5 * 1024 * 1024 * 1024) : 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) { setUploadError(`حجم الملف كبير. الحد الأقصى: ${lessonType === 'video' ? '1.5GB' : '50MB'}`); return; }
    const key = `${mi}-${li}`;
    setUploadingKey(key);
    setUploadError('');
    setUploadProgress((prev) => ({ ...prev, [key]: 0 }));

    try {
      const data = await uploadFileWithProgress({
        url: `/api/courses/${id}/upload`,
        file,
        fields: {
          moduleIndex: mi.toString(),
          lessonIndex: li.toString(),
          type: lessonType,
        },
        onProgress: (percent) => setUploadProgress((prev) => ({ ...prev, [key]: percent })),
      });

      if (data.success) {
        await fetchCourse();
      } else {
        setUploadError(data.error || 'فشل رفع الملف');
      }
    } catch (e: any) {
      setUploadError(e?.message || 'فشل رفع الملف');
    } finally {
      setUploadingKey(null);
    }
  };

  const saveVideoSettings = async (mi: number, li: number) => {
    const key = `${mi}-${li}`;
    const settings = lessonSettings[key];
    if (!settings) return;
    setSavingSettings(key);
    try {
      const res = await fetch(`/api/courses/${id}/lesson-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleIndex: mi, lessonIndex: li, videoControls: settings }),
      });
      const data = await res.json();
      if (!data.success) setUploadError(data.error || 'فشل حفظ الإعدادات');
    } catch {
      setUploadError('فشل حفظ الإعدادات');
    } finally {
      setSavingSettings(null);
    }
  };

  const loadFilePreview = async (mi: number, li: number, lessonId?: string, lessonType?: string) => {
    if (!lessonId) return;
    const key = `${mi}-${li}`;
    if (filePreviewUrls[key]) return;
    setPreviewingKey(key);
    try {
      const tokenRes = await fetch(`/api/courses/${id}/content-token?lessonId=${lessonId}`);
      const tokenData = await tokenRes.json();
      if (!tokenData.success) {
        setUploadError(tokenData.error || 'فشل تحميل المعاينة');
        return;
      }
      const token = tokenData.data.token;
      const contentUrl = `/api/content/${token}?mode=raw`;
      if (lessonType === 'pdf') {
        // PDF: store the URL — PdfCanvasViewer will fetch it
        setFilePreviewUrls((prev) => ({ ...prev, [key]: contentUrl }));
      } else {
        // Video: fetch as blob with custom header
        const res = await fetch(contentUrl, { credentials: 'include', headers: { 'X-Content-Request': '1' } });
        if (!res.ok) throw new Error();
        const raw = await res.blob();
        const blob = new Blob([raw], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        setFilePreviewUrls((prev) => ({ ...prev, [key]: blobUrl }));
      }
    } catch {
      setUploadError('فشل تحميل المعاينة');
    } finally {
      setPreviewingKey(null);
    }
  };

  const deleteCourse = async () => {
    if (!confirm('هل أنت متأكد من حذف هذا الكورس؟')) return;
    try {
      const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'فشل حذف الكورس');
        return;
      }
      router.push('/dashboard/instructor/courses');
    } catch {
      setError('حدث خطأ أثناء حذف الكورس');
    }
  };

  const toggleSetting = (mi: number, li: number, k: string, value: boolean) => {
    const key = `${mi}-${li}`;
    setLessonSettings(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [k]: value } }));
  };

  const toggleModule = (mi: number) => {
    setExpandedModules(prev => {
      const s = new Set(prev);
      s.has(mi) ? s.delete(mi) : s.add(mi);
      return s;
    });
  };

  if (loading) {
    return (
      <DashboardSidebar links={instructorLinks}>
        <div className="p-8"><div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/3" /><div className="h-64 bg-slate-200 rounded-2xl" /></div></div>
      </DashboardSidebar>
    );
  }

  if (!course) {
    return (
      <DashboardSidebar links={instructorLinks}>
        <div className="p-8 text-center text-slate-500">الكورس غير موجود</div>
      </DashboardSidebar>
    );
  }

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8 w-full max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">تعديل الكورس</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">{error}</div>
        )}
        {uploadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm flex items-center justify-between">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError('')} className="text-red-400 hover:text-red-600 mr-2">✕</button>
          </div>
        )}

        {/* ── Section 1: Basic Info ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6 mb-6">
          <h2 className="font-semibold text-slate-900">المعلومات الأساسية</h2>

          {/* Thumbnail */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">صورة الغلاف</label>
            <div className="flex items-center gap-4">
              <div className="w-32 h-20 rounded-xl overflow-hidden bg-gradient-to-bl from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                {form.thumbnail ? (
                  <img src={form.thumbnail} alt="thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl">📚</span>
                )}
              </div>
              <div>
                <label className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl cursor-pointer transition-colors ${uploadingThumbnail ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {uploadingThumbnail ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>جاري الرفع...</>
                  ) : '📷 رفع صورة'}
                  <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" disabled={uploadingThumbnail}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleThumbnailUpload(f); e.target.value = ''; }} />
                </label>
                <p className="text-xs text-slate-400 mt-1.5">JPEG, PNG, WebP — حد أقصى 5MB</p>
                {uploadingThumbnail && (
                  <div className="mt-3 w-64 max-w-full">
                    <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                      <span>رفع الصورة</span>
                      <span>{thumbnailProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full bg-blue-600 transition-all duration-200" style={{ width: `${thumbnailProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">العنوان</label>
            <input type="text" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">وصف مختصر</label>
            <input type="text" value={form.shortDescription || ''} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">الوصف الكامل</label>
            <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">السعر (ج.م)</label>
              <input type="number" value={form.price || 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">سعر الخصم (ج.م)</label>
              <input type="number" value={form.discountPrice || 0} onChange={(e) => setForm({ ...form, discountPrice: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">السنة الدراسية المستهدفة</label>
            <select value={form.targetYear || ''} onChange={(e) => setForm({ ...form, targetYear: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">للجميع</option>
              {ACADEMIC_YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">التصنيف</label>
            <input
              type="text"
              value={form.category || ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="مثال: البرمجة"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="isPublished" checked={form.isPublished || false}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} className="rounded" />
            <label htmlFor="isPublished" className="text-sm text-slate-700 cursor-pointer">منشور</label>
          </div>
        </div>

        {/* ── Section 2: Curriculum Structure ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">هيكل المنهج</h2>
            <button onClick={addModule}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
              + إضافة وحدة
            </button>
          </div>

          {form.modules.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">لا توجد وحدات. أضف وحدة للبدء.</p>
          ) : (
            <div className="space-y-4">
              {form.modules.map((module: Module, mi: number) => (
                <div key={mi} className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Module header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                    <button type="button" onClick={() => toggleModule(mi)} className="text-slate-400 hover:text-slate-600">
                      <svg className={`w-4 h-4 transition-transform ${expandedModules.has(mi) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </button>
                    <input type="text" value={module.title} onChange={(e) => updateModuleTitle(mi, e.target.value)}
                      placeholder="اسم الوحدة"
                      className="flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none border-b border-transparent focus:border-blue-400 pb-0.5" />
                    <span className="text-xs text-slate-400">{module.lessons.length} درس</span>
                    <button type="button" onClick={() => removeModule(mi)}
                      className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors" title="حذف الوحدة">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>

                  {/* Lessons */}
                  {expandedModules.has(mi) && (
                    <div className="divide-y divide-slate-100">
                      {module.lessons.map((lesson: Lesson, li: number) => {
                        const key = `${mi}-${li}`;
                        const isUploading = uploadingKey === key;
                        const isSaving = savingSettings === key;
                        const settings = lessonSettings[key];
                        return (
                          <div key={li} className="bg-white">
                            <div className="flex items-start gap-3 px-4 py-3">
                              <span className="text-slate-400 text-sm mt-2.5 w-5 text-center flex-shrink-0">{li + 1}</span>
                              <div className="flex-1 space-y-2 min-w-0">
                                <input type="text" value={lesson.title} onChange={(e) => updateLesson(mi, li, { title: e.target.value })}
                                  placeholder="اسم الدرس"
                                  className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                                <div className="flex items-center gap-3 flex-wrap">
                                  <select value={lesson.type} onChange={(e) => updateLesson(mi, li, { type: e.target.value as LessonType })}
                                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400">
                                    <option value="text">نص</option>
                                    <option value="video">فيديو</option>
                                    <option value="pdf">PDF</option>
                                  </select>
                                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                                    <input type="checkbox" checked={lesson.isPreview} onChange={(e) => updateLesson(mi, li, { isPreview: e.target.checked })} className="rounded" />
                                    معاينة مجانية
                                  </label>
                                  {(lesson.type === 'video' || lesson.type === 'pdf') && (
                                    lesson.fileUrl ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-green-600 font-medium">✓ ملف محمل</span>
                                        <button
                                          type="button"
                                          onClick={() => loadFilePreview(mi, li, lesson._id, lesson.type)}
                                          className="text-xs text-indigo-600 hover:underline"
                                        >
                                          {previewingKey === key ? 'تحميل...' : 'معاينة'}
                                        </button>
                                        <label className="text-xs text-blue-500 cursor-pointer hover:underline">
                                          استبدال
                                          <input type="file" accept={lesson.type === 'video' ? 'video/*' : 'application/pdf'} className="hidden"
                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(mi, li, f, lesson.type); }} />
                                        </label>
                                      </div>
                                    ) : isUploading ? (
                                      <span className="flex items-center gap-1 text-xs text-blue-600">
                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                        رفع...
                                      </span>
                                    ) : lesson._id ? (
                                      <label className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                                        رفع {lesson.type === 'video' ? 'فيديو' : 'PDF'}
                                        <input type="file" accept={lesson.type === 'video' ? 'video/*' : 'application/pdf'} className="hidden"
                                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(mi, li, f, lesson.type); }} />
                                      </label>
                                    ) : (
                                      <span className="text-xs text-slate-400">احفظ أولاً لرفع الملف</span>
                                    )
                                  )}
                                </div>
                                {lesson.type === 'text' && (
                                  <textarea value={lesson.content || ''} onChange={(e) => updateLesson(mi, li, { content: e.target.value })}
                                    placeholder="محتوى الدرس..." rows={3}
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-400 resize-none text-slate-700" />
                                )}
                                {isUploading && (
                                  <div className="w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                    <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                                      <span>جاري رفع الملف...</span>
                                      <span>{uploadProgress[key] || 0}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                                      <div className="h-full bg-blue-600 transition-all duration-200" style={{ width: `${uploadProgress[key] || 0}%` }} />
                                    </div>
                                  </div>
                                )}
                                {filePreviewUrls[key] && lesson.type === 'video' && (
                                  <video
                                    src={filePreviewUrls[key]}
                                    controls
                                    className="w-full max-h-[75vh] rounded-lg border border-slate-200 bg-black"
                                  />
                                )}
                                {filePreviewUrls[key] && lesson.type === 'pdf' && (
                                  <PdfCanvasViewer src={filePreviewUrls[key]} protected maxHeight="75vh" />
                                )}
                              </div>
                              <button type="button" onClick={() => removeLesson(mi, li)}
                                className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors mt-1.5 flex-shrink-0" title="حذف الدرس">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                            </div>

                            {/* Video settings */}
                            {lesson.type === 'video' && settings && (
                              <div className="border-t border-slate-200">
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200">
                                  <span className="text-xs font-semibold text-slate-700">⚙️ إعدادات مشغّل الفيديو</span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                  {([
                                    { k: 'allowSpeed', label: 'سرعة التشغيل' },
                                    { k: 'allowSkip', label: 'التخطي' },
                                    { k: 'allowSeek', label: 'شريط التقدم' },
                                    { k: 'allowVolume', label: 'التحكم بالصوت' },
                                    { k: 'allowFullscreen', label: 'ملء الشاشة' },
                                    { k: 'forceFocus', label: 'التركيز الإجباري' },
                                  ]).map(({ k, label }) => (
                                    <div key={k} className="flex items-center justify-between px-4 py-2 bg-white hover:bg-slate-50">
                                      <span className="text-xs text-slate-700">{label}</span>
                                      <button type="button" onClick={() => toggleSetting(mi, li, k, !(settings[k]))}
                                        className={`relative w-10 h-5 rounded-full transition-all flex-shrink-0 ${settings[k] ? 'bg-blue-600' : 'bg-slate-200'}`}>
                                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings[k] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end px-4 py-2 bg-slate-50 border-t border-slate-100">
                                  <button type="button" onClick={() => saveVideoSettings(mi, li)} disabled={isSaving}
                                    className="text-xs font-semibold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
                                    {isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="px-4 py-2.5 bg-slate-50">
                        <button type="button" onClick={() => addLesson(mi)}
                          className="text-sm text-blue-600 font-medium hover:underline">
                          + إضافة درس
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={deleteCourse}
            className="px-6 py-3 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors font-medium">
            حذف الكورس
          </button>
          <button type="button" onClick={() => router.push('/dashboard/instructor/courses')}
            className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium">
            إلغاء
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </DashboardSidebar>
  );
}
