import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-3xl font-bold text-accent-900 mb-2">شروط الاستخدام</h1>
          <p className="text-accent-500 mb-10">يُرجى قراءة هذه الشروط بعناية قبل استخدام المنصة</p>

          <div className="space-y-8 bg-white rounded-xl border border-accent-200 shadow-soft p-8">
            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">١. قبول الشروط</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                باستخدام منصة أ/ محمد الصباغ التعليمية، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي من هذه الشروط، يُرجى عدم استخدام المنصة.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٢. حساب المستخدم</h2>
              <ul className="text-sm text-accent-600 leading-relaxed space-y-2 list-disc list-inside">
                <li>أنت مسؤول عن الحفاظ على سرية بيانات حسابك</li>
                <li>يجب تقديم معلومات صحيحة ودقيقة عند التسجيل</li>
                <li>يُحظر مشاركة الحساب مع أشخاص آخرين</li>
                <li>نحتفظ بالحق في إيقاف أي حساب يُخالف هذه الشروط</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٣. حقوق الملكية الفكرية</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                جميع المحتويات المنشورة على المنصة — بما في ذلك مقاطع الفيديو والمواد التعليمية والاختبارات — محمية بحقوق الملكية الفكرية. يُحظر تمامًا نسخ أو توزيع أو إعادة نشر أي محتوى دون إذن صريح مسبق.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٤. سياسة الاسترداد</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                يمكنك طلب استرداد المبلغ خلال 7 أيام من تاريخ الاشتراك في حال عدم الاستفادة من المحتوى. بعد انقضاء هذه المدة أو بعد مشاهدة أكثر من 20% من المحتوى لا يحق المطالبة بالاسترداد.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٥. السلوك المقبول</h2>
              <ul className="text-sm text-accent-600 leading-relaxed space-y-2 list-disc list-inside">
                <li>يُحظر التصرف بأي طريقة قد تضر بالمنصة أو مستخدميها</li>
                <li>يُحظر محاولة الوصول غير المصرح به لأي جزء من المنصة</li>
                <li>يُحظر نشر أي محتوى مسيء أو مضلل</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">٦. التواصل معنا</h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                لأي استفسار بشأن شروط الاستخدام، تواصل معنا على:{' '}
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
