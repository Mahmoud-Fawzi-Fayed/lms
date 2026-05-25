'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useLang } from '@/contexts/LanguageContext';
import { t } from '@/lib/i18n';

export default function HomePage() {
  // Subscribe so this client component re-renders on language change.
  useLang();

  const features = [
    {
      icon: '🎓',
      title: t('كورسات احترافية', 'Professional Courses'),
      description: t(
        'محتوى شامل بالفيديو والـ PDF. محاضرات منظمة وتقدم واضح.',
        'Comprehensive video & PDF content. Organized lectures with clear progress.'
      ),
    },
    {
      icon: '📝',
      title: t('اختبارات ذكية', 'Smart Quizzes'),
      description: t(
        'أسئلة متنوعة مع تصحيح فوري ونتائج تفصيلية للأداء.',
        'Varied questions with instant grading and detailed performance reports.'
      ),
    },
    {
      icon: '🏆',
      title: t('لوحة المتصدرين', 'Leaderboard'),
      description: t(
        'تنافس صحي مع أقرانك وتتبع ترتيبك والإنجازات.',
        'Healthy competition with peers, track your rank and achievements.'
      ),
    },
    {
      icon: '🔒',
      title: t('محتوى محمي', 'Protected Content'),
      description: t(
        'أمان عالي للمحتوى مع حماية كاملة من النسخ.',
        'High content security with full protection against copying.'
      ),
    },
    {
      icon: '💳',
      title: t('دفع آمن', 'Secure Payments'),
      description: t(
        'خيارات دفع متعددة وآمنة مع تفعيل فوري.',
        'Multiple secure payment options with instant activation.'
      ),
    },
    {
      icon: '📊',
      title: t('تحليلات مفصلة', 'Detailed Analytics'),
      description: t(
        'تتبع شامل للتقدم بإحصائيات وتقارير تفصيلية.',
        'Comprehensive progress tracking with stats and detailed reports.'
      ),
    },
  ];

  return (
    <>
      <Navbar />
      <main>
        {/* Hero Section */}
        <section className="relative text-white overflow-hidden min-h-[calc(100vh-4rem)] flex items-center w-full animate-fade-in">
          <div
            className="absolute inset-0 md:hidden"
            style={{
              backgroundImage: 'url(/BG.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center top',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <div
            className="absolute inset-0 hidden md:block"
            style={{
              backgroundImage: 'url(/BG.png)',
              backgroundSize: '118%',
              backgroundPosition: 'left -220px top 0px',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/35 via-slate-900/25 to-slate-950/50 md:bg-black/20" />
          <div className="w-full relative z-10" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.45)' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 h-full">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-xs sm:text-sm mb-6 md:mb-8 border border-white/40">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  {t('منصة متخصصة في التكنولوجيا والبرمجة', 'Specialized platform for technology and programming')}
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 md:mb-6 tracking-tight">
                  {t(
                    'منصة تعليمية متقدمة في التكنولوجيا والبرمجة',
                    'Advanced learning platform for technology and programming'
                  )}
                </h1>
                <p className="text-sm sm:text-base md:text-lg text-white/95 mb-6 md:mb-8 leading-loose font-medium max-w-2xl">
                  {t(
                    'متخصصة في تدريس كمبيوتر وتكنولوجيا المعلومات والاتصالات للمرحلة الابتدائية والإعدادية، والبرمجة والذكاء الاصطناعي للمرحلة الثانوية.',
                    'Specialized in teaching Computer & ICT for primary and preparatory stages, and Programming & AI for secondary stage.'
                  )}
                </p>

                {/* المواد المتاحة */}
                <div className="mb-8 md:mb-10 space-y-3 sm:space-y-4 bg-white/10 backdrop-blur-md p-4 md:p-6 rounded-xl border border-white/20 max-w-2xl">
                  <div className="flex items-center gap-3 md:gap-4">
                    <span className="text-3xl md:text-4xl flex-shrink-0">💻</span>
                    <div>
                      <div className="font-bold text-base md:text-lg text-white">
                        {t('كمبيوتر وتكنولوجيا المعلومات', 'Computer & Information Technology')}
                      </div>
                      <div className="text-white/80 text-xs md:text-sm">
                        {t('المرحلة الابتدائية والإعدادية', 'Primary & Preparatory stages')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4">
                    <span className="text-3xl md:text-4xl flex-shrink-0">🤖</span>
                    <div>
                      <div className="font-bold text-base md:text-lg text-white">
                        {t('البرمجة والذكاء الاصطناعي', 'Programming & Artificial Intelligence')}
                      </div>
                      <div className="text-white/80 text-xs md:text-sm">
                        {t('المرحلة الثانوية', 'Secondary stage')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                  <Link
                    href="/courses"
                    className="px-6 md:px-8 py-3 md:py-4 bg-white/95 hover:bg-white text-blue-700 font-bold rounded-xl text-center transition-all transform hover:scale-105 shadow-lg shadow-black/30 text-sm md:text-base"
                  >
                    {t('استكشف الكورسات ✨', 'Explore Courses ✨')}
                  </Link>
                  <Link
                    href="/register"
                    className="px-6 md:px-8 py-3 md:py-4 bg-transparent hover:bg-white/15 text-white font-bold rounded-xl text-center transition-all backdrop-blur-sm border border-white/50 text-sm md:text-base"
                  >
                    {t('ابدأ مجاناً →', 'Start Free →')}
                  </Link>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-8 mt-12 md:mt-20 pt-8 md:pt-12 border-t border-white/20">
                <div>
                  <div className="text-2xl md:text-4xl mb-2 md:mb-3">🎓</div>
                  <div className="font-bold text-sm md:text-lg">{t("تعلّم في أي وقت", 'Learn Anytime')}</div>
                  <div className="text-white/80 text-xs md:text-sm mt-1">{t('محتوى متاح على مدار الساعة', 'Content available 24/7')}</div>
                </div>
                <div>
                  <div className="text-2xl md:text-4xl mb-2 md:mb-3">🏆</div>
                  <div className="font-bold text-sm md:text-lg">{t('اختبارات تنافسية', 'Competitive Quizzes')}</div>
                  <div className="text-white/80 text-xs md:text-sm mt-1">{t('تحدّ نفسك وتفوّق', 'Challenge yourself and excel')}</div>
                </div>
                <div>
                  <div className="text-2xl md:text-4xl mb-2 md:mb-3">📊</div>
                  <div className="font-bold text-sm md:text-lg">{t('تتبع تقدمك', 'Track Your Progress')}</div>
                  <div className="text-white/80 text-xs md:text-sm mt-1">{t('إحصائيات دقيقة', 'Accurate statistics')}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <span className="text-sm font-bold text-primary-600 bg-primary-50 px-4 py-1.5 rounded-full inline-block">
                {t('✨ المميزات', '✨ Features')}
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-accent-900 mt-6 mb-4 leading-tight">
                {t('لماذا منصة أ/ محمد الصباغ؟', "Why Mr. Mohamed Elsabbagh's Platform?")}
              </h2>
              <p className="text-accent-600 max-w-2xl mx-auto text-lg">
                {t(
                  'نوفر تجربة تعليمية متكاملة مع أفضل الأدوات والتقنيات',
                  'We provide a complete learning experience with the best tools and technologies'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className="p-8 rounded-2xl border border-accent-200 hover:border-primary-300 hover:shadow-lg shadow-soft hover:shadow-medium transition-all duration-300 group bg-white"
                >
                  <div className="w-16 h-16 bg-primary-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 group-hover:bg-primary-100">
                    <span className="text-3xl">{feature.icon}</span>
                  </div>
                  <h3 className="text-xl font-bold text-accent-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-accent-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-28 bg-gradient-to-br from-primary-600 to-primary-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
              {t('هل أنت مستعد لبدء رحلتك التعليمية؟', 'Ready to start your learning journey?')}
            </h2>
            <p className="text-primary-100 text-xl mb-10 leading-relaxed">
              {t('انضم لآلاف الطلاب وابدأ التعلم اليوم', 'Join thousands of students and start learning today')}
            </p>
            <Link
              href="/register"
              className="inline-block px-12 py-4 bg-white text-primary-700 font-bold rounded-xl hover:bg-accent-50 transition-colors shadow-lg shadow-black/10"
            >
              {t('أنشئ حساب مجاني الآن', 'Create a free account now')}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
