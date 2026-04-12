import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-3xl font-bold text-accent-900 mb-2">سياسة الخصوصية</h1>
          <p className="text-accent-500 mb-10">آخر تحديث: يناير 2025</p>

          <div className="space-y-8 bg-white rounded-xl border border-accent-200 shadow-soft p-8">
            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">١. المعلومات التي نجمعها</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                نجمع المعلومات التي تقدمها لنا مباشرةً عند إنشاء حساب أو التسجيل في الكورسات، كالاسم والبريد الإلكتروني وبيانات الدفع اللازمة لإتمام عملية الاشتراك.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٢. كيف نستخدم معلوماتك</h2>
              <ul className="text-sm text-accent-600 leading-relaxed space-y-2 list-disc list-inside">
                <li>تقديم الخدمات التعليمية وإدارة حسابك</li>
                <li>معالجة المدفوعات وإتمام عمليات الاشتراك</li>
                <li>التواصل معك بشأن الكورسات والتحديثات</li>
                <li>تحسين تجربة المستخدم على المنصة</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٣. حماية المعلومات</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                نحرص على حماية بياناتك الشخصية باستخدام أحدث تقنيات التشفير وبروتوكولات الأمان. لا نقوم ببيع أو مشاركة معلوماتك الشخصية مع أطراف ثالثة دون موافقتك.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٤. ملفات تعريف الارتباط (Cookies)</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                نستخدم ملفات تعريف الارتباط لتحسين تجربتك على المنصة، مثل تذكّر بيانات تسجيل الدخول وتخصيص المحتوى المعروض لك.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٥. التواصل معنا</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                إذا كان لديك أي استفسار حول سياسة الخصوصية، تواصل معنا على:{' '}
                <a href="mailto:info@alsabbagh.com" className="text-primary-600 font-semibold hover:underline">
                  info@alsabbagh.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
