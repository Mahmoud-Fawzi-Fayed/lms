/* eslint-disable no-console */
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3003';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lms_0xray';
const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || 'dev-test-paymob-secret-change-me';

let passed = 0;
let failed = 0;

function result(name, ok, detail = '') {
  if (ok) {
    console.log(`  [PASS] ${name}`);
    passed += 1;
    return;
  }

  console.log(`  [FAIL] ${name}${detail ? ` -> ${detail}` : ''}`);
  failed += 1;
}

function buildTransaction(overrides = {}) {
  return {
    amount_cents: '10000',
    created_at: '2026-05-27T00:00:00.000000',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 555001,
    integration_id: 111111,
    is_3d_secure: false,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: {
      id: 'paymob-order-placeholder',
      merchant_order_id: 'merchant-order-placeholder',
    },
    owner: 999999,
    pending: false,
    source_data: {
      pan: '512345******1234',
      sub_type: 'MasterCard',
      type: 'card',
    },
    success: true,
    ...overrides,
  };
}

function signTransaction(txn, secret = HMAC_SECRET) {
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

  const concatenated = hmacFields
    .map((field) => {
      const keys = field.split('.');
      let value = txn;
      for (const key of keys) {
        value = value ? value[key] : undefined;
      }
      return String(value ?? '');
    })
    .join('');

  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

async function postWebhook(payload, headers = {}) {
  const response = await fetch(`${BASE_URL}/api/webhooks/paymob`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function ensureServerReachable() {
  try {
    const response = await fetch(`${BASE_URL}/api/auth/csrf`);
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Paymob Webhook Security Checks');
  console.log('================================');
  console.log(`Base URL: ${BASE_URL}`);

  const reachable = await ensureServerReachable();
  if (!reachable) {
    console.error('Server is not reachable. Start the app first, e.g. PORT=3003 npm run dev');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const userId = new mongoose.Types.ObjectId();
  const examId = new mongoose.Types.ObjectId();

  await db.collection('users').insertOne({
    _id: userId,
    name: 'Paymob QA User',
    email: `paymob-qa-${Date.now()}@example.test`,
    password: '$2a$12$C2f7K6jSkQrXGk8Qz.yL8eRjKi0A8BbR9IOouixsAecg9GWhA5Q9S',
    phone: '01000000000',
    role: 'student',
    isActive: true,
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const paymentId = new mongoose.Types.ObjectId();
  const paymobOrderId = `pm-order-${Date.now()}`;

  await db.collection('payments').insertOne({
    _id: paymentId,
    user: userId,
    exam: examId,
    amount: 100,
    currency: 'EGP',
    method: 'card',
    paymobOrderId,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  let response = await fetch(`${BASE_URL}/api/webhooks/paymob`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'not-json',
  });
  result('Rejects non-JSON requests', response.status === 415, `status=${response.status}`);

  response = await postWebhook({}, { 'Content-Type': 'application/json' });
  result('Rejects missing transaction/HMAC', response.status === 400, `status=${response.status}`);

  const validTxnBase = buildTransaction({
    id: 9000001,
    order: { id: paymobOrderId, merchant_order_id: paymentId.toString() },
  });

  response = await postWebhook(
    { obj: validTxnBase, hmac: signTransaction(validTxnBase, 'wrong-secret') },
    { 'Content-Type': 'application/json' }
  );
  result('Rejects invalid HMAC', response.status === 401, `status=${response.status}`);

  const unknownOrderTxn = buildTransaction({
    id: 9000002,
    order: { id: `missing-${Date.now()}`, merchant_order_id: paymentId.toString() },
  });
  response = await postWebhook(
    { obj: unknownOrderTxn, hmac: signTransaction(unknownOrderTxn) },
    { 'Content-Type': 'application/json' }
  );
  result('Rejects unknown paymobOrderId', response.status === 404, `status=${response.status}`);

  const mismatchTxn = buildTransaction({
    id: 9000003,
    amount_cents: '9999',
    order: { id: paymobOrderId, merchant_order_id: paymentId.toString() },
  });
  response = await postWebhook(
    { obj: mismatchTxn, hmac: signTransaction(mismatchTxn) },
    { 'Content-Type': 'application/json' }
  );
  result('Rejects amount mismatch', response.status === 400, `status=${response.status}`);

  const mismatchPayment = await db.collection('payments').findOne({ _id: paymentId });
  result('Marks payment failed on mismatch', mismatchPayment && mismatchPayment.status === 'failed', `status=${mismatchPayment ? mismatchPayment.status : 'missing'}`);

  await db.collection('payments').updateOne({ _id: paymentId }, { $set: { status: 'pending' } });

  const successTxn = buildTransaction({
    id: 9000004,
    amount_cents: '10000',
    order: { id: paymobOrderId, merchant_order_id: paymentId.toString() },
  });
  response = await postWebhook(
    { obj: successTxn, hmac: signTransaction(successTxn) },
    { 'Content-Type': 'application/json' }
  );
  result('Accepts valid signed webhook', response.status === 200, `status=${response.status}`);

  const paidPayment = await db.collection('payments').findOne({ _id: paymentId });
  result('Marks payment paid', paidPayment && paidPayment.status === 'paid', `status=${paidPayment ? paidPayment.status : 'missing'}`);
  result('Stores paymob transaction id', paidPayment && paidPayment.paymobTransactionId === String(successTxn.id), `stored=${paidPayment ? paidPayment.paymobTransactionId : 'missing'}`);

  response = await postWebhook(
    { obj: successTxn, hmac: signTransaction(successTxn) },
    { 'Content-Type': 'application/json' }
  );
  result('Replay is idempotent', response.status === 200, `status=${response.status}`);

  const enrollCount = await db.collection('examenrollments').countDocuments({ user: userId, exam: examId, status: 'active' });
  result('Does not create duplicate exam enrollment on replay', enrollCount === 1, `count=${enrollCount}`);

  await mongoose.disconnect();

  console.log('================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
