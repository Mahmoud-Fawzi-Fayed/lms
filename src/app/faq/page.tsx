import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const faqs = [
  {
    q: 'كيف يمكنني التسجيل في الكورسات؟',
    a: 'قم بإنشاء حساب جديد من خلال صفحة التسجيل، ثم تصفح الكورسات المتاحة واختر الكورس المناسب لك.',
  },
  {
    q: 'هل يمكنني الوصول للمحتوى بعد انتهاء الكورس؟',
    a: 'نعم، يمكنك الوصول لمحتوى الكورسات التي سجّلت فيها في أي وقت ومن أي جهاز.',
  },
  {
    q: 'كيف يمكنني التواصل مع الأستاذ؟',
    a: 'يمكنك التواصل معنا عبر البريد الإلكتروني info@alsabbagh.com أو عبر رقم الهاتف الموجود في قسم تواصل معنا.',
  },
  {
    q: 'هل يوجد شهادات بعد إتمام الكورس؟',
    a: 'نعم، يحصل الطلاب على شهادة إتمام بعد اجتياز الكورس والاختبارات المطلوبة بنجاح.',
  },
  {
    q: 'ما هي طرق الدفع المتاحة؟',
    a: 'نقبل الدفع عبر بطاقات الائتمان والخصم المباشر، إضافةً إلى المحافظ الإلكترونية.',
  },
  {
    q: 'كيف أعيد تعيين كلمة المرور؟',
    a: 'تواصل معنا عبر البريد الإلكتروني وسنساعدك في إعادة تعيين كلمة المرور.',
  },
];

export default function FAQPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-3xl font-bold text-accent-900 mb-2">الأسئلة الشائعة</h1>
          <p className="text-accent-500 mb-10">إجابات على أكثر الأسئلة شيوعاً لدى طلابنا</p>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-accent-200 shadow-soft p-6">
                <h3 className="font-semibold text-accent-800 mb-2">{faq.q}</h3>
                <p className="text-sm text-accent-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-primary-50 border border-primary-100 rounded-xl p-6 text-center">
            <p className="text-accent-700 font-medium mb-1">لم تجد إجابة لسؤالك؟</p>
            <p className="text-sm text-accent-500">
              تواصل معنا على{' '}
              <a href="mailto:info@alsabbagh.com" className="text-primary-600 font-semibold hover:underline">
                info@alsabbagh.com
              </a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
