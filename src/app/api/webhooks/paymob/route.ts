import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Payment, Enrollment, Course, ExamEnrollment } from '@/models';
import { verifyWebhookHmac } from '@/lib/paymob';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// POST /api/webhooks/paymob - Paymob transaction webhook (auto-validation)
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { obj: transaction, hmac: receivedHmac } = body;

    if (!transaction || !receivedHmac) {
      console.error('Webhook: Missing transaction or HMAC');
      return jsonError('بيانات الإشعار غير صحيحة', 400);
    }

    // Verify HMAC to ensure request is from Paymob
    const isValid = verifyWebhookHmac(transaction, receivedHmac);
    if (!isValid) {
      console.error('Webhook: HMAC verification failed');
      return jsonError('توقيع غير صالح', 401);
    }

    const paymobOrderId = transaction.order?.id?.toString();
    const isSuccess = transaction.success === true;
    const isPending = transaction.pending === true;
    const transactionId = transaction.id?.toString();
    const sourceType = transaction.source_data?.type; // card, wallet, cash (fawry)
    const merchantOrderId = transaction.order?.merchant_order_id?.toString();

    if (!paymobOrderId) {
      console.error('Webhook: Missing Paymob order id');
      return jsonError('معرف الطلب مفقود', 400);
    }

    // Find the payment record
    const payment = await Payment.findOne({ paymobOrderId });

    if (!payment) {
      console.error(`Webhook: Payment not found for order ${paymobOrderId}`);
      return jsonError('الدفع غير موجود', 404);
    }

    // Already processed
    if (payment.status === 'paid') {
      return NextResponse.json({ message: 'تمت المعالجة مسبقاً' });
    }

    const expectedAmountCents = Math.round(payment.amount * 100);
    const receivedAmountCents = Number(transaction.amount_cents ?? 0);
    const receivedCurrency = String(transaction.currency ?? '').toUpperCase();
    const expectedCurrency = String(payment.currency ?? 'EGP').toUpperCase();

    if (merchantOrderId && merchantOrderId !== payment._id.toString()) {
      payment.status = 'failed';
      payment.metadata = {
        ...(payment.metadata || {}),
        validationError: 'merchant_order_mismatch',
        merchantOrderId,
      };
      await payment.save();
      return jsonError('عدم تطابق معرف طلب التاجر', 400);
    }

    if (receivedAmountCents !== expectedAmountCents) {
      payment.status = 'failed';
      payment.metadata = {
        ...(payment.metadata || {}),
        validationError: 'amount_mismatch',
        expectedAmountCents,
        receivedAmountCents,
      };
      await payment.save();
      return jsonError('عدم تطابق المبلغ', 400);
    }

    if (receivedCurrency !== expectedCurrency) {
      payment.status = 'failed';
      payment.metadata = {
        ...(payment.metadata || {}),
        validationError: 'currency_mismatch',
        expectedCurrency,
        receivedCurrency,
      };
      await payment.save();
      return jsonError('عدم تطابق العملة', 400);
    }

    payment.paymobTransactionId = transactionId;
    payment.metadata = {
      ...(payment.metadata || {}),
      source_type: sourceType,
      source_subtype: transaction.source_data?.sub_type,
      is_3d_secure: transaction.is_3d_secure,
      merchant_order_id: merchantOrderId,
      raw_response: {
        success: transaction.success,
        error_occured: transaction.error_occured,
        pending: transaction.pending,
      },
    };

    if (transaction.source_data?.type === 'cash') {
      payment.fawryReferenceNumber = transaction.source_data?.pan;
    }

    // Do not activate access for pending or failed transactions.
    if (isSuccess && !isPending && transaction.error_occured !== true) {
      payment.status = 'paid';
      payment.paidAt = new Date();
      await payment.save();

      if (payment.exam) {
        await ExamEnrollment.findOneAndUpdate(
          { user: payment.user, exam: payment.exam },
          {
            user: payment.user,
            exam: payment.exam,
            payment: payment._id,
            status: 'active',
            enrolledAt: new Date(),
          },
          { upsert: true, new: true }
        );

        console.log(
          `Payment SUCCESS: User ${payment.user} enrolled in standalone exam ${payment.exam}`
        );

        return NextResponse.json({ message: 'تمت معالجة الإشعار بنجاح' });
      }

      // Auto-activate enrollment
      const existingEnrollment = await Enrollment.findOne({
        user: payment.user,
        course: payment.course,
      });

      const wasActive = existingEnrollment?.status === 'active';

      if (existingEnrollment) {
        existingEnrollment.status = 'active';
        existingEnrollment.payment = payment._id;
        existingEnrollment.enrolledAt = new Date();
        await existingEnrollment.save();
      } else {
        await Enrollment.create({
          user: payment.user,
          course: payment.course,
          payment: payment._id,
          status: 'active',
          enrolledAt: new Date(),
        });
      }

      // Increment enrollment count only on first activation.
      if (!wasActive) {
        await Course.findByIdAndUpdate(payment.course, {
          $inc: { enrollmentCount: 1 },
        });
      }

      console.log(
        `Payment SUCCESS: User ${payment.user} enrolled in course ${payment.course}`
      );
    } else if (isPending) {
      payment.status = 'pending';
      await payment.save();
      console.log(`Payment PENDING: Order ${paymobOrderId}`);
    } else {
      payment.status = 'failed';
      await payment.save();
      console.log(`Payment FAILED: Order ${paymobOrderId}`);
    }

    return NextResponse.json({ message: 'تمت معالجة الإشعار بنجاح' });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return jsonError('فشلت معالجة إشعار الدفع', 500);
  }
}
