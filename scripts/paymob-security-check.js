require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const MONGODB_URI = process.env.MONGODB_URI;
const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in environment');
}

if (!HMAC_SECRET) {
  throw new Error('Missing PAYMOB_HMAC_SECRET in environment');
}

const hmacFields = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
];

function getNested(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function signTransaction(transaction) {
  const concatenated = hmacFields.map((field) => String(getNested(transaction, field) ?? '')).join('');
  return crypto.createHmac('sha512', HMAC_SECRET).update(concatenated).digest('hex');
}

function buildTransaction({ orderId, merchantOrderId, amountCents, currency = 'EGP', success = true, pending = false, sourceType = 'card' }) {
  return {
    amount_cents: amountCents,
    created_at: new Date().toISOString(),
    currency,
    error_occured: false,
    has_parent_transaction: false,
    id: Number(String(Date.now()).slice(-9)),
    integration_id: Number(process.env.PAYMOB_INTEGRATION_ID_CARD || '0'),
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: {
      id: orderId,
      merchant_order_id: merchantOrderId,
    },
    owner: 1152592,
    pending,
    source_data: {
      pan: '2345',
      sub_type: sourceType === 'cash' ? 'Fawry' : 'MasterCard',
      type: sourceType,
    },
    success,
  };
}

async function postWebhook(transaction, hmac) {
  const response = await fetch(`${BASE_URL}/api/webhooks/paymob`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ obj: transaction, hmac }),
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function createPendingPayment(db, { userId, courseId, amount, method = 'card' }) {
  const paymentId = new mongoose.Types.ObjectId();
  const paymobOrderId = `security-order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  await db.collection('payments').insertOne({
    _id: paymentId,
    user: userId,
    course: courseId,
    amount,
    currency: 'EGP',
    method,
    status: 'pending',
    paymobOrderId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { paymentId, paymobOrderId };
}

async function cleanup(db, ids, baselineEnrollmentCount) {
  await db.collection('payments').deleteMany({ _id: { $in: ids.payments } });
  await db.collection('enrollments').deleteMany({ _id: { $in: ids.enrollments } });
  if (baselineEnrollmentCount != null) {
    await db.collection('courses').updateOne({ _id: ids.courseId }, { $set: { enrollmentCount: baselineEnrollmentCount } });
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const student = await db.collection('users').findOne({ email: 'student.g4@lms.com' }, { projection: { _id: 1 } });
  const otherStudent = await db.collection('users').findOne({ email: 'student.g5@lms.com' }, { projection: { _id: 1 } });
  const course = await db.collection('courses').findOne({ slug: 'seed-intro-js' }, { projection: { _id: 1, discountPrice: 1, price: 1, enrollmentCount: 1 } });

  if (!student || !otherStudent || !course) {
    throw new Error('Required seeded data not found. Run npm run seed first.');
  }

  const amount = course.discountPrice ?? course.price;
  const amountCents = Math.round(amount * 100);
  const baselineEnrollmentCount = course.enrollmentCount || 0;
  const ids = { payments: [], enrollments: [], courseId: course._id };
  const results = [];

  try {
    await db.collection('enrollments').deleteMany({ user: student._id, course: course._id });

    // 1. Valid payment activates only payer access.
    const valid = await createPendingPayment(db, { userId: student._id, courseId: course._id, amount });
    ids.payments.push(valid.paymentId);
    const validTx = buildTransaction({ orderId: valid.paymobOrderId, merchantOrderId: valid.paymentId.toString(), amountCents, success: true, pending: false, sourceType: 'card' });
    const validRes = await postWebhook(validTx, signTransaction(validTx));
    const validPayment = await db.collection('payments').findOne({ _id: valid.paymentId });
    const payerEnrollment = await db.collection('enrollments').findOne({ user: student._id, course: course._id, status: 'active' });
    const otherEnrollment = await db.collection('enrollments').findOne({ user: otherStudent._id, course: course._id, payment: valid.paymentId });
    if (payerEnrollment) ids.enrollments.push(payerEnrollment._id);
    results.push({
      name: 'valid_payment_activates_only_payer',
      pass: validRes.status === 200 && validPayment?.status === 'paid' && !!payerEnrollment && !otherEnrollment,
      details: { status: validRes.status, paymentStatus: validPayment?.status, payerEnrollment: !!payerEnrollment, otherEnrollment: !!otherEnrollment },
    });

    // 2. Duplicate webhook must not increase enrollment count twice.
    const countBeforeDuplicate = (await db.collection('courses').findOne({ _id: course._id }, { projection: { enrollmentCount: 1 } }))?.enrollmentCount;
    const dupRes = await postWebhook(validTx, signTransaction(validTx));
    const countAfterDuplicate = (await db.collection('courses').findOne({ _id: course._id }, { projection: { enrollmentCount: 1 } }))?.enrollmentCount;
    results.push({
      name: 'duplicate_webhook_is_idempotent',
      pass: dupRes.status === 200 && countBeforeDuplicate === countAfterDuplicate,
      details: { status: dupRes.status, countBeforeDuplicate, countAfterDuplicate },
    });

    // 3. Invalid HMAC must be rejected and not grant access.
    const invalidHmac = await createPendingPayment(db, { userId: student._id, courseId: course._id, amount });
    ids.payments.push(invalidHmac.paymentId);
    const invalidHmacTx = buildTransaction({ orderId: invalidHmac.paymobOrderId, merchantOrderId: invalidHmac.paymentId.toString(), amountCents });
    const invalidHmacRes = await postWebhook(invalidHmacTx, 'bad-hmac');
    const invalidHmacPayment = await db.collection('payments').findOne({ _id: invalidHmac.paymentId });
    results.push({
      name: 'invalid_hmac_rejected',
      pass: invalidHmacRes.status === 401 && invalidHmacPayment?.status === 'pending',
      details: { status: invalidHmacRes.status, paymentStatus: invalidHmacPayment?.status },
    });

    // 4. Amount mismatch must fail and not grant access.
    const wrongAmount = await createPendingPayment(db, { userId: student._id, courseId: course._id, amount });
    ids.payments.push(wrongAmount.paymentId);
    const wrongAmountTx = buildTransaction({ orderId: wrongAmount.paymobOrderId, merchantOrderId: wrongAmount.paymentId.toString(), amountCents: amountCents - 100 });
    const wrongAmountRes = await postWebhook(wrongAmountTx, signTransaction(wrongAmountTx));
    const wrongAmountPayment = await db.collection('payments').findOne({ _id: wrongAmount.paymentId });
    results.push({
      name: 'amount_mismatch_rejected',
      pass: wrongAmountRes.status === 400 && wrongAmountPayment?.status === 'failed',
      details: { status: wrongAmountRes.status, paymentStatus: wrongAmountPayment?.status },
    });

    // 5. Pending transaction must not grant access.
    const pending = await createPendingPayment(db, { userId: student._id, courseId: course._id, amount, method: 'fawry' });
    ids.payments.push(pending.paymentId);
    const pendingTx = buildTransaction({ orderId: pending.paymobOrderId, merchantOrderId: pending.paymentId.toString(), amountCents, success: false, pending: true, sourceType: 'cash' });
    const pendingRes = await postWebhook(pendingTx, signTransaction(pendingTx));
    const pendingPayment = await db.collection('payments').findOne({ _id: pending.paymentId });
    const pendingEnrollment = await db.collection('enrollments').findOne({ payment: pending.paymentId });
    results.push({
      name: 'pending_transaction_does_not_grant_access',
      pass: pendingRes.status === 200 && pendingPayment?.status === 'pending' && !pendingEnrollment,
      details: { status: pendingRes.status, paymentStatus: pendingPayment?.status, enrollmentCreated: !!pendingEnrollment },
    });

    console.log(JSON.stringify(results, null, 2));

    const failed = results.filter((item) => !item.pass);
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await cleanup(db, ids, baselineEnrollmentCount);
    await mongoose.connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
