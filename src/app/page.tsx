import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function HomePage() {
  // Background position controls - adjust these numbers directly
  const bgPositionTop = 0;    // Top/Bottom: negative shows more face, positive shows more bottom
  const bgPositionLeft = -500;   // Left/Right in pixels: move face to left side (try: -300, -400, -500, -600)


  return (
    <>
      <Navbar />
      <main>
        {/* Hero Section */}
        <section className="relative text-white overflow-hidden min-h-screen flex items-center w-full" style={{
          backgroundImage: 'url(/BG.png)',
          backgroundSize: '135%',
          backgroundPosition: `${bgPositionLeft}px ${bgPositionTop}px`,
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed'
        }}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="w-full relative z-10" style={{ textShadow: '0 2px 5px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.5)' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 h-full">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-xs sm:text-sm mb-6 md:mb-8 border border-white/40">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  منصة متخصصة في التكنولوجيا والبرمجة
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 md:mb-6 tracking-tight">
                  منصة تعليمية متقدمة في التكنولوجيا والبرمجة
                </h1>
                <p className="text-sm sm:text-base md:text-lg text-white/95 mb-6 md:mb-8 leading-loose font-medium max-w-2xl">
                  متخصصة في تدريس كمبيوتر وتكنولوجيا المعلومات والاتصالات للمرحلة الابتدائية والإعدادية، والبرمجة والذكاء الاصطناعي للمرحلة الثانوية.
                </p>
                
                {/* المواد المتاحة */}
                <div className="mb-8 md:mb-10 space-y-3 sm:space-y-4 bg-white/10 backdrop-blur-md p-4 md:p-6 rounded-xl border border-white/20 max-w-2xl">
                  <div className="flex items-center gap-3 md:gap-4">
                    <span className="text-3xl md:text-4xl flex-shrink-0">💻</span>
                    <div>
                      <div className="font-bold text-base md:text-lg text-white">كمبيوتر وتكنولوجيا المعلومات</div>
                      <div className="text-white/80 text-xs md:text-sm">المرحلة الابتدائية والإعدادية</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4">
                    <span className="text-3xl md:text-4xl flex-shrink-0">🤖</span>
                    <div>
                      <div className="font-bold text-base md:text-lg text-white">البرمجة والذكاء الاصطناعي</div>
                      <div className="text-white/80 text-xs md:text-sm">المرحلة الثانوية</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                  <Link
                    href="/courses"
                    className="px-6 md:px-8 py-3 md:py-4 bg-white/95 hover:bg-white text-blue-700 font-bold rounded-xl text-center transition-all transform hover:scale-105 shadow-lg shadow-black/30 text-sm md:text-base"
                  >
                    استكشف الكورسات ✨
                  </Link>
                  <Link
                    href="/register"
                    className="px-6 md:px-8 py-3 md:py-4 bg-transparent hover:bg-white/15 text-white font-bold rounded-xl text-center transition-all backdrop-blur-sm border border-white/50 text-sm md:text-base"
                  >
                    ابدأ مجاناً →
                  </Link>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-8 mt-12 md:mt-20 pt-8 md:pt-12 border-t border-white/20">
                <div>
                  <div className="text-2xl md:text-4xl mb-2 md:mb-3">🎓</div>
                  <div className="font-bold text-sm md:text-lg">تعلّم في أي وقت</div>
                  <div className="text-white/80 text-xs md:text-sm mt-1">محتوى متاح على مدار الساعة</div>
                </div>
                <div>
                  <div className="text-2xl md:text-4xl mb-2 md:mb-3">🏆</div>
                  <div className="font-bold text-sm md:text-lg">اختبارات تنافسية</div>
                  <div className="text-white/80 text-xs md:text-sm mt-1">تحدّ نفسك وتفوّق</div>
                </div>
                <div>
                  <div className="text-2xl md:text-4xl mb-2 md:mb-3">📊</div>
                  <div className="font-bold text-sm md:text-lg">تتبع تقدمك</div>
                  <div className="text-white/80 text-xs md:text-sm mt-1">إحصائيات دقيقة</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <span className="text-sm font-bold text-primary-600 bg-primary-50 px-4 py-1.5 rounded-full inline-block">✨ المميزات</span>
              <h2 className="text-4xl md:text-5xl font-bold text-accent-900 mt-6 mb-4 leading-tight">
                لماذا منصة أ/ محمد الصباغ؟
              </h2>
              <p className="text-accent-600 max-w-2xl mx-auto text-lg">
                نوفر تجربة تعليمية متكاملة مع أفضل الأدوات والتقنيات
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
              هل أنت مستعد لبدء رحلتك التعليمية؟
            </h2>
            <p className="text-primary-100 text-xl mb-10 leading-relaxed">
              انضم لآلاف الطلاب وابدأ التعلم اليوم
            </p>
            <Link
              href="/register"
              className="inline-block px-12 py-4 bg-white text-primary-700 font-bold rounded-xl hover:bg-accent-50 transition-colors shadow-lg shadow-black/10"
            >
              أنشئ حساب مجاني الآن
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

const features = [
  {
    icon: '🎓',
    title: 'كورسات احترافية',
    description: 'محتوى شامل بالفيديو والـ PDF. محاضرات منظمة وتقدم واضح.',
  },
  {
    icon: '📝',
    title: 'اختبارات ذكية',
    description: 'أسئلة متنوعة مع تصحيح فوري ونتائج تفصيلية للأداء.',
  },
  {
    icon: '🏆',
    title: 'لوحة المتصدرين',
    description: 'تنافس صحي مع أقرانك وتتبع ترتيبك والإنجازات.',
  },
  {
    icon: '🔒',
    title: 'محتوى محمي',
    description: 'أمان عالي للمحتوى مع حماية كاملة من النسخ.',
  },
  {
    icon: '💳',
    title: 'دفع آمن',
    description: 'خيارات دفع متعددة وآمنة مع تفعيل فوري.',
  },
  {
    icon: '📊',
    title: 'تحليلات مفصلة',
    description: 'تتبع شامل للتقدم بإحصائيات وتقارير تفصيلية.',
  },
];
