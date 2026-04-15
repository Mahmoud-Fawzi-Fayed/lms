'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { formatPrice } from '@/lib/utils';

interface Course {
  _id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  thumbnail?: string;
  instructor: { name: string };
  price: number;
  discountPrice?: number;
  category: string;
  level: string;
  enrollmentCount: number;
  rating: number;
  ratingCount: number;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [sort, setSort] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchCourses();
  }, [search, category, level, sort, page]);

  const fetchCourses = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: '12',
      ...(search && { search }),
      ...(category && { category }),
      ...(level && { level }),
      ...(sort && { sort }),
    });

    try {
      const res = await fetch(`/api/courses?${params}`);
      const data = await res.json();
      if (data.success) {
        setCourses(data.data.courses);
        setTotalPages(data.data.pagination.pages);
        setCategories(data.data.filters?.categories || []);
        setLevels(data.data.filters?.levels || []);
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const categoryLabels: Record<string, string> = {
    Programming: 'البرمجة',
    programming: 'البرمجة',
    'Web Development': 'تطوير الويب',
    web: 'تطوير الويب',
    'Mobile Development': 'تطوير تطبيقات الهاتف',
    mobile: 'تطوير تطبيقات الهاتف',
    'Data Science': 'علوم البيانات',
    data: 'علوم البيانات',
    'AI & ML': 'الذكاء الاصطناعي وتعلم الآلة',
    ai: 'الذكاء الاصطناعي وتعلم الآلة',
    Cybersecurity: 'الأمن السيبراني',
    cybersecurity: 'الأمن السيبراني',
    Design: 'التصميم',
    design: 'التصميم',
    Business: 'الأعمال',
    business: 'الأعمال',
    Marketing: 'التسويق',
    marketing: 'التسويق',
    science: 'العلوم',
    language: 'اللغات',
    languages: 'اللغات',
    Other: 'أخرى',
    other: 'أخرى',
  };

  const levelLabels: Record<string, string> = {
    beginner: 'مبتدئ',
    intermediate: 'متوسط',
    advanced: 'متقدم',
  };

  const categoryLabel = (value: string) => categoryLabels[value] || value;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        {/* Header */}
        <div className="bg-white border-b border-accent-200 shadow-soft">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <h1 className="text-4xl font-bold text-accent-900 mb-2">الكورسات</h1>
            <p className="text-accent-600 text-lg">اختر من مئات الكورسات وابدأ رحلتك التعليمية</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-soft border border-accent-200 p-5 mb-10">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="ابحث عن كورس..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pr-10 pl-4 py-2.5 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Category */}
              <select
                value={category}
                onChange={e => { setCategory(e.target.value); setPage(1); }}
                className="px-4 py-2.5 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
              >
                <option value="">كل التصنيفات</option>
                {categories.map(c => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </select>

              {/* Level */}
              <select
                value={level}
                onChange={e => { setLevel(e.target.value); setPage(1); }}
                className="px-4 py-2.5 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
              >
                <option value="">كل المستويات</option>
                {levels.map(l => (
                  <option key={l} value={l}>{levelLabels[l] || l}</option>
                ))}
              </select>

              {/* Sort */}
              <select
                value={sort}
                onChange={e => { setSort(e.target.value); setPage(1); }}
                className="px-4 py-2.5 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
              >
                <option value="">الترتيب الافتراضي</option>
                <option value="newest">الأحدث</option>
                <option value="popular">الأكثر شعبية</option>
                <option value="rating">الأعلى تقييماً</option>
                <option value="price-low">السعر: من الأقل للأعلى</option>
                <option value="price-high">السعر: من الأعلى للأقل</option>
              </select>
            </div>
          </div>

          {/* Course Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse shadow-soft">
                  <div className="h-48 bg-accent-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-accent-200 rounded w-3/4" />
                    <div className="h-3 bg-accent-200 rounded w-full" />
                    <div className="h-3 bg-accent-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-7xl mb-6">📚</div>
              <h3 className="text-2xl font-bold text-accent-900 mb-2">لم نجد كورسات</h3>
              <p className="text-accent-600 text-lg">حاول تغيير معايير البحث</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map(course => (
                <Link
                  key={course._id}
                  href={`/courses/${course.slug}`}
                  className="bg-white rounded-xl overflow-hidden shadow-soft border border-accent-200 hover:shadow-lg hover:border-primary-300 transition-all group"
                >
                  {/* Thumbnail */}
                  <div className="relative h-48 bg-gradient-to-br from-primary-100 to-primary-200 overflow-hidden">
                    {course.thumbnail ? (
                      <img
                        src={course.thumbnail}
                        alt={course.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <span className="text-6xl">📘</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className="px-3 py-1 bg-white rounded-lg text-xs font-semibold text-primary-700 shadow-sm">
                        {levelLabels[course.level] || course.level}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="text-xs font-semibold text-primary-600 mb-1">{categoryLabel(course.category)}</div>
                    <h3 className="font-bold text-accent-900 mb-2 line-clamp-2 group-hover:text-primary-600 transition-colors text-lg">
                      {course.title}
                    </h3>
                    {course.shortDescription && (
                      <p className="text-sm text-accent-600 line-clamp-2 mb-4">
                        {course.shortDescription}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-sm text-accent-500 mb-4 pb-4 border-b border-accent-100">
                      <span className="font-medium">👨‍🏫 {course.instructor.name}</span>
                      <span>👥 {course.enrollmentCount}</span>
                    </div>

                    {/* Rating */}
                    {course.ratingCount > 0 && (
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-yellow-500 font-bold">{course.rating.toFixed(1)}</span>
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <svg
                              key={i}
                              className={`w-4 h-4 ${i < Math.round(course.rating) ? 'text-yellow-400' : 'text-accent-200'}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                        <span className="text-xs text-accent-400">({course.ratingCount})</span>
                      </div>
                    )}

                    {/* Price */}
                    <div className="flex items-center gap-2 font-bold text-lg">
                      {course.discountPrice != null && course.discountPrice < course.price ? (
                        <>
                          <span className="text-primary-600">
                            {formatPrice(course.discountPrice)}
                          </span>
                          <span className="text-sm text-accent-400 line-through font-normal">
                            {formatPrice(course.price)}
                          </span>
                        </>
                      ) : course.price === 0 ? (
                        <span className="text-success-600">مجاني 🎁</span>
                      ) : (
                        <span className="text-accent-900">
                          {formatPrice(course.price)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-12">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-accent-200 rounded-lg disabled:opacity-50 hover:bg-accent-50 transition-colors"
              >
                ← السابق
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    page === i + 1
                      ? 'bg-primary-500 text-white shadow-soft'
                      : 'border border-accent-200 hover:bg-accent-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-accent-200 rounded-lg disabled:opacity-50 hover:bg-accent-50 transition-colors"
              >
                التالي →
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
