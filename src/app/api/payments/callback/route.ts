import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Payment } from '@/models';
import { verifyCallbackHmac } from '@/lib/paymob';

// GET /api/payments/callback - Paymob post-payment redirect handler
// Paymob redirects here after payment with result query params.
// This route has NO side-effects; enrollment is handled by the webhook.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const base = (process.env.NEXTAUTH_URL || '').replace(/\/$/, '');

  // Verify HMAC when present (soft check — no data mutations happen here)
  const hmacValid = verifyCallbackHmac(searchParams);
  if (!hmacValid) {
    console.warn('Paymob callback: HMAC verification failed or missing', {
      hmac: searchParams.get('hmac'),
      merchantOrderId: searchParams.get('merchant_order_id'),
    });
    // Still redirect the user to an informative page rather than showing a raw error
  }

  const success = searchParams.get('success') === 'true';
  const pending = searchParams.get('pending') === 'true';
  const merchantOrderId = searchParams.get('merchant_order_id');

  // Try to find the associated course slug for a better redirect target
  let courseSlug: string | null = null;
  try {
    await connectDB();
    if (merchantOrderId) {
      const payment = await Payment.findById(merchantOrderId)
        .populate('course', 'slug')
        .lean<{ course: { slug: string } | null }>();
      courseSlug = payment?.course?.slug ?? null;
    }
  } catch (err) {
    console.error('Paymob callback: DB lookup failed', err);
  }

  if (success && !pending) {
    // Payment succeeded — send user to their course or student dashboard
    const destination = courseSlug
      ? `${base}/courses/${courseSlug}?payment=success`
      : `${base}/dashboard/student?payment=success`;
    return NextResponse.redirect(destination);
  }

  if (pending) {
    // Fawry/wallet — payment created but awaiting confirmation
    const destination = courseSlug
      ? `${base}/courses/${courseSlug}?payment=pending`
      : `${base}/dashboard/student?payment=pending`;
    return NextResponse.redirect(destination);
  }

  // Payment failed
  const destination = courseSlug
    ? `${base}/courses/${courseSlug}?payment=failed`
    : `${base}/dashboard/student?payment=failed`;
  return NextResponse.redirect(destination);
}
