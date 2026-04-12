import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-accent-900 via-accent-800 to-primary-900 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
          <div className="absolute top-40 right-10 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-20 w-96 h-96 bg-primary-400/10 rounded-full blur-3xl" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-40 relative z-10">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500/20 backdrop-blur-sm rounded-full text-primary-200 text-sm mb-8 border border-primary-400/30">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                منصة تعليمية حديثة
              </div>
              <h1 className="text-5xl md:text-7xl font-bold leading-[5] mb-8 tracking-tight">
                تعلّم <span className="text-primary-300">بذكاء</span>،
                <br />
                <span className="text-primary-300">انطلق بثقة</span>
              </h1>
              <p className="text-lg md:text-xl text-accent-200 mb-12 max-w-2xl leading-loose font-medium">
                منصة تعليمية حديثة تجمع بين الجودة والتكنولوجيا. كورسات احترافية، اختبارات ذكية، وتتبع تقدم شامل.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/courses"
                  className="px-8 py-4 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl text-center transition-all transform hover:scale-105 shadow-lg shadow-primary-500/30"
                >
                  استكشف الكورسات ✨
                </Link>
                <Link
                  href="/register"
                  className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-center transition-all backdrop-blur-sm border border-white/20"
                >
                  ابدأ مجاناً →
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-8 mt-20 pt-12 border-t border-white/10">
                <div>
                  <div className="text-4xl mb-3">🎓</div>
                  <div className="font-bold text-lg">تعلّم في أي وقت</div>
                  <div className="text-accent-300 text-sm mt-1">محتوى متاح على مدار الساعة</div>
                </div>
                <div>
                  <div className="text-4xl mb-3">🏆</div>
                  <div className="font-bold text-lg">اختبارات تنافسية</div>
                  <div className="text-accent-300 text-sm mt-1">تحدّ نفسك وتفوّق على الآخرين</div>
                </div>
                <div>
                  <div className="text-4xl mb-3">📊</div>
                  <div className="font-bold text-lg">تتبع تقدمك</div>
                  <div className="text-accent-300 text-sm mt-1">إحصائيات شاملة ودقيقة</div>
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
