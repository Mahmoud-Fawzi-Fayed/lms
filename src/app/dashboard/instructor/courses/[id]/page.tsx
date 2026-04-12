'use client';

import { useState, useEffect } from 'react';
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

export default function EditCoursePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: session, status } = useSession();
  const router = useRouter();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');  
  const [form, setForm] = useState<any>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [lessonSettings, setLessonSettings] = useState<Record<string, any>>({});
  const [savingSettings, setSavingSettings] = useState<string | null>(null);

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'instructor' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    fetchCourse();
  }, [id]);

  const fetchCourse = async () => {
    try {
      const res = await fetch(`/api/courses/${id}`);
      const data = await res.json();
      if (data.success) {
        const courseData = data.data.course || data.data;
        setCourse(courseData);
        // Init lessonSettings from existing videoControls
        const settings: Record<string, any> = {};
        (courseData.modules || []).forEach((mod: any, mi: number) => {
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
          title: courseData.title,
          description: courseData.description,
          shortDescription: courseData.shortDescription,
          category: courseData.category,
          level: courseData.level,
          price: courseData.price,
          discountPrice: courseData.discountPrice || 0,
          isPublished: courseData.isPublished,
          targetYear: courseData.targetYear || '',
        });
      }
    } catch (error) {
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

  const handleFileUpload = async (moduleIndex: number, lessonIndex: number, file: File, lessonType: string) => {
    const MAX_SIZE = lessonType === 'video' ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(`حجم الملف كبير جداً. الحد الأقصى: ${lessonType === 'video' ? '500' : '50'} MB`);
      return;
    }

    const key = `${moduleIndex}-${lessonIndex}`;
    setUploadingKey(key);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('moduleIndex', moduleIndex.toString());
    formData.append('lessonIndex', lessonIndex.toString());
    formData.append('type', lessonType);

    try {
      const res = await fetch(`/api/courses/${id}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        await fetchCourse();
      } else {
        setUploadError(data.error || 'فشل رفع الملف');
      }
    } catch {
      setUploadError('فشل رفع الملف - تأكد من الاتصال');
    } finally {
      setUploadingKey(null);
    }
  };

  const saveVideoSettings = async (moduleIndex: number, lessonIndex: number) => {
    const key = `${moduleIndex}-${lessonIndex}`;
    const settings = lessonSettings[key];
    if (!settings) return;
    setSavingSettings(key);
    try {
      const res = await fetch(`/api/courses/${id}/lesson-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleIndex, lessonIndex, videoControls: settings }),
      });
      const data = await res.json();
      if (!data.success) setUploadError(data.error || 'فشل حفظ الإعدادات');
    } catch {
      setUploadError('فشل حفظ الإعدادات');
    } finally {
      setSavingSettings(null);
    }
  };

  const toggleSetting = (moduleIndex: number, lessonIndex: number, key: string, value: boolean) => {
    const k = `${moduleIndex}-${lessonIndex}`;
    setLessonSettings(prev => ({
      ...prev,
      [k]: { ...(prev[k] || {}), [key]: value },
    }));
  };

  if (loading) {
    return (
      <DashboardSidebar links={instructorLinks}>
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-200 rounded w-1/3" />
            <div className="h-64 bg-slate-200 rounded-2xl" />
          </div>
        </div>
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

        {/* Basic Info */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6 mb-6">
          <h2 className="font-semibold text-slate-900">المعلومات الأساسية</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">العنوان</label>
            <input
              type="text"
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">وصف مختصر</label>
            <input
              type="text"
              value={form.shortDescription || ''}
              onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">الوصف الكامل</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">السعر (ج.م)</label>
              <input
                type="number"
                value={form.price || 0}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">سعر الخصم (ج.م)</label>
              <input
                type="number"
                value={form.discountPrice || 0}
                onChange={(e) => setForm({ ...form, discountPrice: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">السنة الدراسية المستهدفة</label>
            <select
              value={form.targetYear || ''}
              onChange={(e) => setForm({ ...form, targetYear: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">للجميع</option>
              {ACADEMIC_YEARS.map((y) => (
                <option key={y.value} value={y.value}>{y.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isPublished || false}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-slate-700">منشور</span>
            </label>
          </div>
        </div>

        {/* Curriculum - File Upload */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-4">محتوى الكورس - رفع الملفات</h2>
          {uploadError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm flex items-center justify-between">
              <span>{uploadError}</span>
              <button onClick={() => setUploadError('')} className="text-red-400 hover:text-red-600 mr-2">✕</button>
            </div>
          )}
          {course.modules?.map((module: any, mi: number) => (
            <div key={mi} className="mb-6">
              <h3 className="font-medium text-slate-800 mb-3">
                الوحدة {mi + 1}: {module.title}
              </h3>
              <div className="space-y-2 mr-4">
                {module.lessons?.map((lesson: any, li: number) => {
                  const key = `${mi}-${li}`;
                  const isUploading = uploadingKey === key;
                  const isSaving = savingSettings === key;
                  const settings = lessonSettings[key];
                  return (
                    <div key={li} className="bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
                      {/* Lesson row */}
                      <div className="flex items-center justify-between p-3">
                        <div>
                          <div className="text-sm font-medium text-slate-700">{lesson.title}</div>
                          <div className="text-xs text-slate-500">{lesson.type === 'video' ? 'فيديو' : lesson.type === 'pdf' ? 'PDF' : 'نص'}</div>
                        </div>
                        {(lesson.type === 'video' || lesson.type === 'pdf') && (
                          <div className="flex items-center gap-3">
                            {lesson.fileUrl ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-green-600 font-medium">✓ تم الرفع</span>
                                <label className="text-xs text-blue-500 cursor-pointer hover:underline">
                                  استبدال
                                  <input type="file" accept={lesson.type === 'video' ? 'video/mp4,video/webm,video/ogg' : 'application/pdf'} className="hidden"
                                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(mi, li, file, lesson.type); }} />
                                </label>
                              </div>
                            ) : isUploading ? (
                              <div className="flex items-center gap-2 text-xs text-blue-600">
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                جاري الرفع...
                              </div>
                            ) : (
                              <label className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                رفع {lesson.type === 'video' ? 'فيديو' : 'PDF'}
                                <input type="file" accept={lesson.type === 'video' ? 'video/mp4,video/webm,video/ogg' : 'application/pdf'} className="hidden"
                                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(mi, li, file, lesson.type); }} />
                              </label>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Video controls settings panel */}
                      {lesson.type === 'video' && settings && (
                        <div className="border-t border-slate-200 overflow-hidden">
                          {/* Header */}
                          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                            <div className="w-6 h-6 bg-slate-800 rounded-md flex items-center justify-center flex-shrink-0">
                              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.08-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                              </svg>
                            </div>
                            <span className="text-xs font-semibold text-slate-700">إعدادات مشغّل الفيديو</span>
                          </div>
                          {/* Controls list */}
                          <div className="divide-y divide-slate-100 bg-white">
                            {([
                              { key: 'allowSpeed',      label: 'سرعة التشغيل',      desc: 'تحكم في سرعة عرض الفيديو',          path: 'M13 2.05v2.02c3.95.49 7 3.85 7 7.93s-3.05 7.44-7 7.93v2.02c5.05-.5 9-4.76 9-9.95S18.05 2.55 13 2.05zM7.1 18.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zm-1.6-3.85c-.6-1.04-.93-2.2-.93-3.47s.33-2.43.93-3.47L3.92 5.97A10.01 10.01 0 0 0 2 11h2c.12.97.37 1.84.69 2.65zM11 5.08V3.06C9.61 3.23 8.26 3.77 7.1 4.67L8.55 6.12C9.3 5.58 10.14 5.23 11 5.08z', iconCls: 'text-violet-600 bg-violet-50' },
                              { key: 'allowSkip',       label: 'التخطي',             desc: 'تقديم ورجوع بمقدار 10 ثوانٍ',       path: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',                                                              iconCls: 'text-blue-600 bg-blue-50' },
                              { key: 'allowSeek',       label: 'شريط التقدم',        desc: 'النقر للانتقال لأي لحظة',             path: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z',                                         iconCls: 'text-cyan-600 bg-cyan-50' },
                              { key: 'allowVolume',     label: 'التحكم بالصوت',      desc: 'ضبط مستوى الصوت وكتمه',            path: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z',                                                                                        iconCls: 'text-green-600 bg-green-50' },
                              { key: 'allowFullscreen', label: 'ملء الشاشة',         desc: 'مشاهدة الفيديو بالشاشة الكاملة',   path: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',                                                                                        iconCls: 'text-orange-600 bg-orange-50' },
                              { key: 'forceFocus',      label: 'التركيز الإجباري',   desc: 'إيقاف الفيديو عند مغادرة التبويب', path: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z', iconCls: 'text-rose-600 bg-rose-50' },
                            ] as { key: string; label: string; desc: string; path: string; iconCls: string }[]).map(({ key: sk, label, desc, path, iconCls }) => (
                              <div key={sk} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconCls}`}>
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d={path} /></svg>
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-800 leading-tight">{label}</div>
                                    <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleSetting(mi, li, sk, !settings[sk])}
                                  className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ms-4 ${settings[sk] ? 'bg-blue-600' : 'bg-slate-200'}`}
                                  title={settings[sk] ? 'تعطيل' : 'تفعيل'}
                                >
                                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${settings[sk] ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                              </div>
                            ))}
                          </div>
                          {/* Save footer */}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100">
                            <span className="text-xs text-slate-400">تُطبَّق التغييرات فور الحفظ</span>
                            <button
                              onClick={() => saveVideoSettings(mi, li)}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 active:bg-slate-900 transition-colors disabled:opacity-50"
                            >
                              {isSaving ? (
                                <>
                                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                  </svg>
                                  جاري الحفظ...
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
                                  </svg>
                                  حفظ الإعدادات
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => router.push('/dashboard/instructor/courses')}
            className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </DashboardSidebar>
  );
}
