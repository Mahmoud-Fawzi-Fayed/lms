'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
import SecureVideoPlayer from '@/components/SecureVideoPlayer';
import { uploadFileWithProgress } from '@/lib/upload-client';
import { ACADEMIC_YEARS } from '@/lib/validations';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

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

export default function EditCoursePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: session, status } = useSession();
  useLang();
  const instructorLinks = [
    { href: '/dashboard/instructor', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/instructor/courses', label: t('كورساتي', 'My Courses'), icon: '📚' },
    { href: '/dashboard/instructor/courses/new', label: t('إنشاء كورس', 'Create Course'), icon: '➕' },
    { href: '/dashboard/instructor/exams', label: t('الاختبارات', 'Exams'), icon: '📝' },
  ];
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

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [router, status]);
  useEffect(() => {
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'instructor' && role !== 'admin') router.push('/dashboard');
    }
  }, [status, session, router]);

  useEffect(() => { fetchCourse(); }, [id]);

  const fetchCourse = async (): Promise<any | null> => {
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

        // Auto-load stream URLs for video lessons that already have a file uploaded
        const previewUrls: Record<string, string> = {};
        for (const [mi, mod] of (c.modules || []).entries()) {
          for (const [li, lesson] of (mod.lessons || []).entries()) {
            if (lesson.type === 'video' && lesson.fileUrl && lesson._id) {
              try {
                const tokenRes = await fetch(`/api/courses/${id}/content-token?lessonId=${lesson._id}&kind=stream`);
                const tokenData = await tokenRes.json();
                if (tokenData.success) {
                  previewUrls[`${mi}-${li}`] = `/api/content/${tokenData.data.token}?mode=stream`;
                }
              } catch { /* skip if token fetch fails */ }
            }
          }
        }
        if (Object.keys(previewUrls).length > 0) {
          setFilePreviewUrls(previewUrls);
        }

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
        return c;
      }
    } catch {
      toast.error(t('فشل تحميل الكورس', 'Failed to load course'));
    } finally {
      setLoading(false);
    }
    return null;
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
        setError(data.error || t('فشل التحديث', 'Update failed'));
      }
    } catch {
      setError(t('حدث خطأ ما', 'An error occurred'));
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
        setUploadError(data.error || t('فشل رفع الصورة', 'Image upload failed'));
      }
    } catch (e: any) {
      setUploadError(e?.message || t('فشل رفع الصورة', 'Image upload failed'));
    } finally {
      setUploadingThumbnail(false);
      setTimeout(() => setThumbnailProgress(0), 600);
    }
  };

  const addModule = () => {
    const idx = form.modules.length;
    setForm((prev: any) => ({
      ...prev,
      modules: [...prev.modules, { title: `${t('وحدة', 'Unit')} ${idx + 1}`, order: idx, lessons: [] }],
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
        title: `${t('درس', 'Lesson')} ${(modules[mi].lessons?.length || 0) + 1}`,
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
    if (file.size > MAX_SIZE) { setUploadError(`${t('حجم الملف كبير. الحد الأقصى:', 'File size too large. Max:')} ${lessonType === 'video' ? '1.5GB' : '50MB'}`); return; }
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
        // Clear stale preview URL so a re-fetch is triggered for the new file
        setFilePreviewUrls(prev => { const updated = { ...prev }; delete updated[key]; return updated; });
        // Clear progress indicator
        setUploadProgress(prev => { const updated = { ...prev }; delete updated[key]; return updated; });
        const refreshed = await fetchCourse();
        // BUG-FIX: auto-trigger the preview AFTER the course refetch so the
        // instructor immediately sees the freshly uploaded PDF/video instead
        // of having to click "معاينة" manually. We resolve the lessonId from
        // the just-refreshed course tree (the in-memory `form.modules` may
        // still be stale at this microtask).
        const lessonId = refreshed?.modules?.[mi]?.lessons?.[li]?._id;
        if (lessonId) {
          // Fire and forget — errors surface inline via setUploadError.
          void loadFilePreview(mi, li, lessonId, lessonType);
        }
      } else {
        setUploadError(data.error || t('فشل رفع الملف', 'File upload failed'));
      }
    } catch (e: any) {
      setUploadError(e?.message || t('فشل رفع الملف', 'File upload failed'));
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
      if (data.success) {
        toast.success(t('تم حفظ إعدادات الفيديو', 'Video settings saved'));
      } else {
        toast.error(data.error || t('فشل حفظ الإعدادات', 'Failed to save settings'));
      }
    } catch {
      toast.error(t('فشل حفظ الإعدادات', 'Failed to save settings'));
    } finally {
      setSavingSettings(null);
    }
  };

  const loadFilePreview = async (mi: number, li: number, lessonId?: string, lessonType?: string) => {
    if (!lessonId) return;
    const key = `${mi}-${li}`;
    // Don't skip re-fetch — always get a fresh token to avoid serving a stale/replaced file
    if (previewingKey === key) return; // only guard against concurrent double-clicks
    setPreviewingKey(key);
    try {
      const kind = lessonType === 'video' ? 'stream' : 'raw';
      const tokenRes = await fetch(`/api/courses/${id}/content-token?lessonId=${lessonId}&kind=${kind}`);
      const tokenData = await tokenRes.json();
      if (!tokenData.success) {
        setUploadError(tokenData.error || t('فشل تحميل المعاينة', 'Preview load failed'));
        return;
      }
      const token = tokenData.data.token;
      if (lessonType === 'video') {
        // Videos: use mode=stream so the <video> element can stream natively
        // (no full blob download — critical for large files)
        const streamUrl = `/api/content/${token}?mode=stream`;
        setFilePreviewUrls(prev => ({ ...prev, [key]: streamUrl }));
      } else {
        // PDFs: use mode=raw; PdfCanvasViewer will fetch with X-Content-Request
        setFilePreviewUrls(prev => ({ ...prev, [key]: `/api/content/${token}?mode=raw` }));
      }
    } catch {
      setUploadError(t('فشل تحميل المعاينة', 'Preview load failed'));
    } finally {
      setPreviewingKey(null);
    }
  };

  const deleteCourse = async () => {
    if (!confirm(t('هل أنت متأكد من حذف هذا الكورس؟', 'Are you sure you want to delete this course?'))) return;
    try {
      const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || t('فشل حذف الكورس', 'Course deletion failed'));
        return;
      }
      router.push('/dashboard/instructor/courses');
    } catch {
      setError(t('حدث خطأ أثناء حذف الكورس', 'Error occurred while deleting course'));
    }
  };

  const toggleSetting = (mi: number, li: number, k: string, value: boolean) => {
    const key = `${mi}-${li}`;
    // Update the dedicated lessonSettings state (used by the settings panel UI)
    setLessonSettings(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [k]: value } }));
    // Also keep form.modules in sync so handleSave doesn't overwrite with stale values
    setForm((prev: any) => {
      const modules = [...prev.modules];
      const lessons = [...modules[mi].lessons];
      lessons[li] = { ...lessons[li], videoControls: { ...(lessons[li].videoControls || {}), [k]: value } };
      modules[mi] = { ...modules[mi], lessons };
      return { ...prev, modules };
    });
  };

  const toggleModule = (mi: number) => {
    setExpandedModules(prev => {
      const s = new Set(prev);
      if (s.has(mi)) {
        s.delete(mi);
      } else {
        s.add(mi);
      }
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
        <div className="p-8 text-center text-slate-500">{t('الكورس غير موجود', 'Course not found')}</div>
      </DashboardSidebar>
    );
  }

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8 w-full max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">{t('تعديل الكورس', 'Edit Course')}</h1>

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
          <h2 className="font-semibold text-slate-900">{t('المعلومات الأساسية', 'Basic Information')}</h2>

          {/* Thumbnail */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('صورة الغلاف', 'Cover Image')}</label>
            <div className="flex items-center gap-4">
              <div className="relative w-32 h-20 rounded-xl overflow-hidden bg-gradient-to-bl from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                {form.thumbnail ? (
                  <Image src={form.thumbnail} alt="thumbnail" width={128} height={80} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <span className="text-3xl">📚</span>
                )}
              </div>
              <div>
                <label className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl cursor-pointer transition-colors ${uploadingThumbnail ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {uploadingThumbnail ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>{t('جاري الرفع...', 'Uploading...')}</>
                  ) : t('📷 رفع صورة', '📷 Upload image')}
                  <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" disabled={uploadingThumbnail}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleThumbnailUpload(f); e.target.value = ''; }} />
                </label>
                <p className="text-xs text-slate-400 mt-1.5">JPEG, PNG, WebP — {t('حد أقصى 5MB', 'Max 5MB')}</p>
                {uploadingThumbnail && (
                  <div className="mt-3 w-64 max-w-full">
                    <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                      <span>{t('رفع الصورة', 'Upload image')}</span>
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
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('العنوان', 'Title')}</label>
            <input type="text" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('وصف مختصر', 'Short Description')}</label>
            <input type="text" value={form.shortDescription || ''} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('الوصف الكامل', 'Full Description')}</label>
            <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('السعر (ج.م)', 'Price (EGP)')}</label>
              <input type="number" value={form.price || 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('سعر الخصم (ج.م)', 'Discount Price (EGP)')}</label>
              <input type="number" value={form.discountPrice || 0} onChange={(e) => setForm({ ...form, discountPrice: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('السنة الدراسية المستهدفة', 'Target Academic Year')}</label>
            <select value={form.targetYear || ''} onChange={(e) => setForm({ ...form, targetYear: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">{t('للجميع', 'All')}</option>
              {ACADEMIC_YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('التصنيف', 'Category')}</label>
            <input
              type="text"
              value={form.category || ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder={t('مثال: البرمجة', 'e.g. Programming')}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="isPublished" checked={form.isPublished || false}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} className="rounded" />
            <label htmlFor="isPublished" className="text-sm text-slate-700 cursor-pointer">{t('منشور', 'Published')}</label>
          </div>
        </div>

        {/* ── Section 2: Curriculum Structure ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{t('هيكل المنهج', 'Curriculum Structure')}</h2>
            <button onClick={addModule}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
              + {t('إضافة وحدة', 'Add unit')}
            </button>
          </div>

          {form.modules.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">{t('لا توجد وحدات. أضف وحدة للبدء.', 'No units yet. Add a unit to get started.')}</p>
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
                      placeholder={t('اسم الوحدة', 'Unit title')}
                      className="flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none border-b border-transparent focus:border-blue-400 pb-0.5" />
                    <span className="text-xs text-slate-400">{module.lessons.length} {t('درس', 'lessons')}</span>
                    <button type="button" onClick={() => removeModule(mi)}
                      className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors" title={t('حذف الوحدة', 'Delete unit')}>
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
                                  placeholder={t('اسم الدرس', 'Lesson title')}
                                  className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                                <div className="flex items-center gap-3 flex-wrap">
                                  <select value={lesson.type} onChange={(e) => updateLesson(mi, li, { type: e.target.value as LessonType })}
                                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400">
                                    <option value="text">{t('نص', 'Text')}</option>
                                    <option value="video">{t('فيديو', 'Video')}</option>
                                    <option value="pdf">PDF</option>
                                  </select>
                                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                                    <input type="checkbox" checked={lesson.isPreview} onChange={(e) => updateLesson(mi, li, { isPreview: e.target.checked })} className="rounded" />
                                    {t('معاينة مجانية', 'Free preview')}
                                  </label>
                                  {(lesson.type === 'video' || lesson.type === 'pdf') && (
                                    lesson.fileUrl ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-green-600 font-medium">✓ {t('ملف محمل', 'File loaded')}</span>
                                        <button
                                          type="button"
                                          onClick={() => loadFilePreview(mi, li, lesson._id, lesson.type)}
                                          className="text-xs text-indigo-600 hover:underline"
                                        >
                                          {previewingKey === key ? t('تحميل...', 'Loading...') : t('معاينة', 'Preview')}
                                        </button>
                                        <label className="text-xs text-blue-500 cursor-pointer hover:underline">
                                          {t('استبدال', 'Replace')}
                                          <input type="file" accept={lesson.type === 'video' ? 'video/*' : 'application/pdf'} className="hidden"
                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(mi, li, f, lesson.type); }} />
                                        </label>
                                      </div>
                                    ) : isUploading ? (
                                      <span className="flex items-center gap-1 text-xs text-blue-600">
                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                        {t('رفع...', 'Uploading...')}
                                      </span>
                                    ) : lesson._id ? (
                                      <label className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                                        {t('رفع', 'Upload')} {lesson.type === 'video' ? t('فيديو', 'video') : 'PDF'}
                                        <input type="file" accept={lesson.type === 'video' ? 'video/*' : 'application/pdf'} className="hidden"
                                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(mi, li, f, lesson.type); }} />
                                      </label>
                                    ) : (
                                      <span className="text-xs text-slate-400">{t('احفظ أولاً لرفع الملف', 'Save first to upload file')}</span>
                                    )
                                  )}
                                </div>
                                {lesson.type === 'text' && (
                                  <textarea value={lesson.content || ''} onChange={(e) => updateLesson(mi, li, { content: e.target.value })}
                                    placeholder={t('محتوى الدرس...', 'Lesson content...')} rows={3}
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-400 resize-none text-slate-700" />
                                )}
                                {isUploading && (
                                  <div className="w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                    <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                                      <span>{t('جاري رفع الملف...', 'Uploading file...')}</span>
                                      <span>{uploadProgress[key] || 0}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                                      <div className="h-full bg-blue-600 transition-all duration-200" style={{ width: `${uploadProgress[key] || 0}%` }} />
                                    </div>
                                  </div>
                                )}
                                {filePreviewUrls[key] && lesson.type === 'pdf' && (
                                  <PdfCanvasViewer src={filePreviewUrls[key]} protected maxHeight="75vh" />
                                )}
                              </div>
                              <button type="button" onClick={() => removeLesson(mi, li)}
                                className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors mt-1.5 flex-shrink-0" title={t('حذف الدرس', 'Delete lesson')}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                            </div>

                            {/* Video settings */}
                            {lesson.type === 'video' && settings && (
                              <div className="border-t border-slate-200">
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200">
                                  <span className="text-xs font-semibold text-slate-700">⚙️ {t('إعدادات مشغّل الفيديو', 'Video Player Settings')}</span>
                                </div>
                                {filePreviewUrls[key] && (
                                  <div className="p-3 bg-black">
                                    <SecureVideoPlayer
                                      key={filePreviewUrls[key]}
                                      src={filePreviewUrls[key]}
                                      title={lesson.title}
                                      controls={settings}
                                    />
                                  </div>
                                )}
                                <div className="divide-y divide-slate-100">
                                  {([
                                    { k: 'allowSpeed', label: t('سرعة التشغيل', 'Playback speed') },
                                    { k: 'allowSkip', label: t('التخطي', 'Skip') },
                                    { k: 'allowSeek', label: t('شريط التقدم', 'Progress bar') },
                                    { k: 'allowVolume', label: t('التحكم بالصوت', 'Volume control') },
                                    { k: 'allowFullscreen', label: t('ملء الشاشة', 'Fullscreen') },
                                    { k: 'forceFocus', label: t('التركيز الإجباري', 'Force focus') },
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
                                    {isSaving ? t('جاري الحفظ...', 'Saving...') : t('حفظ الإعدادات', 'Save settings')}
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
                          + {t('إضافة درس', 'Add lesson')}
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
            {t('حذف الكورس', 'Delete Course')}
          </button>
          <button type="button" onClick={() => router.push('/dashboard/instructor/courses')}
            className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium">
            {t('إلغاء', 'Cancel')}
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50">
            {saving ? t('جاري الحفظ...', 'Saving...') : t('حفظ التغييرات', 'Save Changes')}
          </button>
        </div>
      </div>
    </DashboardSidebar>
  );
}
