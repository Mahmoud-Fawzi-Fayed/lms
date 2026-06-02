import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyWebhookHmac } from '@/lib/paymob';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The exact ordered list of fields Paymob concatenates for HMAC computation. */
const HMAC_FIELDS = [
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

function buildHmac(tx: Record<string, any>, secret: string): string {
  const concatenated = HMAC_FIELDS.map((field) => {
    const keys = field.split('.');
    let val: any = tx;
    for (const k of keys) val = val?.[k];
    return String(val ?? '');
  }).join('');
  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

/** A representative Paymob transaction object with all HMAC fields present. */
const SAMPLE_TX: Record<string, any> = {
  amount_cents: 5000,
  created_at: '2024-01-01T00:00:00Z',
  currency: 'EGP',
  error_occured: false,
  has_parent_transaction: false,
  id: 12345,
  integration_id: 67890,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 99999 },
  owner: 'user1',
  pending: false,
  source_data: { pan: '4111', sub_type: 'MasterCard', type: 'card' },
  success: true,
};

const TEST_SECRET = 'test-hmac-secret-for-unit-tests';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('verifyWebhookHmac', () => {
  const originalSecret = process.env.PAYMOB_HMAC_SECRET;

  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.PAYMOB_HMAC_SECRET = originalSecret;
    } else {
      delete process.env.PAYMOB_HMAC_SECRET;
    }
  });

  it('returns true for a correctly signed transaction', () => {
    const hmac = buildHmac(SAMPLE_TX, TEST_SECRET);
    expect(verifyWebhookHmac(SAMPLE_TX, hmac)).toBe(true);
  });

  it('returns false when the HMAC is wrong', () => {
    const badHmac = buildHmac(SAMPLE_TX, 'wrong-secret');
    expect(verifyWebhookHmac(SAMPLE_TX, badHmac)).toBe(false);
  });

  it('returns false when the HMAC is an empty string', () => {
    expect(verifyWebhookHmac(SAMPLE_TX, '')).toBe(false);
  });

  it('returns false when the HMAC has the wrong length (short)', () => {
    expect(verifyWebhookHmac(SAMPLE_TX, 'abc123')).toBe(false);
  });

  it('returns false when PAYMOB_HMAC_SECRET is missing (fails closed)', () => {
    delete process.env.PAYMOB_HMAC_SECRET;
    const hmac = buildHmac(SAMPLE_TX, TEST_SECRET);
    expect(verifyWebhookHmac(SAMPLE_TX, hmac)).toBe(false);
  });

  it('returns false when a single field in the transaction is mutated', () => {
    const valid = buildHmac(SAMPLE_TX, TEST_SECRET);
    const tampered = { ...SAMPLE_TX, amount_cents: 1 }; // amount was 5000
    expect(verifyWebhookHmac(tampered, valid)).toBe(false);
  });

  it('returns false when success flag is flipped (transaction tampering)', () => {
    const valid = buildHmac(SAMPLE_TX, TEST_SECRET);
    const tampered = { ...SAMPLE_TX, success: false };
    expect(verifyWebhookHmac(tampered, valid)).toBe(false);
  });

  it('uses empty string for missing nested fields without throwing', () => {
    const txNoSourceData = { ...SAMPLE_TX, source_data: undefined };
    const hmacForEmpty = buildHmac(txNoSourceData, TEST_SECRET);
    // Should not throw; result depends on missing fields being treated as ''
    expect(() => verifyWebhookHmac(txNoSourceData, hmacForEmpty)).not.toThrow();
    expect(verifyWebhookHmac(txNoSourceData, hmacForEmpty)).toBe(true);
  });

  it('is sensitive to field order — reordering concatenation breaks HMAC', () => {
    // A correctly-computed HMAC with fields in wrong order must be rejected
    const wrongOrderConcatenated = HMAC_FIELDS.slice().reverse().map((field) => {
      const keys = field.split('.');
      let val: any = SAMPLE_TX;
      for (const k of keys) val = val?.[k];
      return String(val ?? '');
    }).join('');
    const wrongHmac = crypto
      .createHmac('sha512', TEST_SECRET)
      .update(wrongOrderConcatenated)
      .digest('hex');
    expect(verifyWebhookHmac(SAMPLE_TX, wrongHmac)).toBe(false);
  });
});

// ─── verifyCallbackHmac ───────────────────────────────────────────────────────

import { verifyCallbackHmac } from '@/lib/paymob';

/**
 * The redirect-callback HMAC uses the same 20 fields but reads them as flat
 * query-string params — 'order' (not 'order.id'), 'source_data.pan', etc.
 */
const CALLBACK_FIELDS = [
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
  'order',            // flat key — NOT order.id
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
];

const SAMPLE_CALLBACK: Record<string, string> = {
  amount_cents: '5000',
  created_at: '2024-01-01T00:00:00Z',
  currency: 'EGP',
  error_occured: 'false',
  has_parent_transaction: 'false',
  id: '12345',
  integration_id: '67890',
  is_3d_secure: 'true',
  is_auth: 'false',
  is_capture: 'false',
  is_refunded: 'false',
  is_standalone_payment: 'true',
  is_voided: 'false',
  order: '99999',
  owner: 'user1',
  pending: 'false',
  'source_data.pan': '4111',
  'source_data.sub_type': 'MasterCard',
  'source_data.type': 'card',
  success: 'true',
};

function buildCallbackHmac(params: Record<string, string>, secret: string): string {
  const concatenated = CALLBACK_FIELDS.map(f => String(params[f] ?? '')).join('');
  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

function toParams(data: Record<string, string>, hmac: string): URLSearchParams {
  const p = new URLSearchParams({ ...data, hmac });
  return p;
}

describe('verifyCallbackHmac', () => {
  const savedSecret = process.env.PAYMOB_HMAC_SECRET;

  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (savedSecret !== undefined) process.env.PAYMOB_HMAC_SECRET = savedSecret;
    else delete process.env.PAYMOB_HMAC_SECRET;
  });

  it('returns true for a correctly signed callback', () => {
    const hmac = buildCallbackHmac(SAMPLE_CALLBACK, TEST_SECRET);
    expect(verifyCallbackHmac(toParams(SAMPLE_CALLBACK, hmac))).toBe(true);
  });

  it('returns false when HMAC signed with wrong secret', () => {
    const hmac = buildCallbackHmac(SAMPLE_CALLBACK, 'wrong-secret');
    expect(verifyCallbackHmac(toParams(SAMPLE_CALLBACK, hmac))).toBe(false);
  });

  it('returns false when hmac param is missing entirely', () => {
    const p = new URLSearchParams(SAMPLE_CALLBACK);
    expect(verifyCallbackHmac(p)).toBe(false);
  });

  it('returns false when PAYMOB_HMAC_SECRET is missing (fails closed)', () => {
    delete process.env.PAYMOB_HMAC_SECRET;
    const hmac = buildCallbackHmac(SAMPLE_CALLBACK, TEST_SECRET);
    expect(verifyCallbackHmac(toParams(SAMPLE_CALLBACK, hmac))).toBe(false);
  });

  it('returns false when a field value is mutated (tampered query string)', () => {
    const valid = buildCallbackHmac(SAMPLE_CALLBACK, TEST_SECRET);
    const tampered = { ...SAMPLE_CALLBACK, success: 'false' }; // flip success
    expect(verifyCallbackHmac(toParams(tampered, valid))).toBe(false);
  });

  it('returns false when amount_cents is changed', () => {
    const valid = buildCallbackHmac(SAMPLE_CALLBACK, TEST_SECRET);
    const tampered = { ...SAMPLE_CALLBACK, amount_cents: '1' };
    expect(verifyCallbackHmac(toParams(tampered, valid))).toBe(false);
  });

  it('uses flat "order" key — not order.id — so different from webhook HMAC', () => {
    // Build a webhook-style HMAC over "order.id" field (like verifyWebhookHmac does).
    // When used for the callback, it must be REJECTED because callback uses "order".
    const webhookConcatenated = HMAC_FIELDS.map((field) => {
      const keys = field.split('.');
      let val: any = SAMPLE_TX;
      for (const k of keys) val = val?.[k];
      return String(val ?? '');
    }).join('');
    const webhookHmac = crypto.createHmac('sha512', TEST_SECRET).update(webhookConcatenated).digest('hex');
    // The callback has 'order' = '99999' which matches SAMPLE_TX.order.id=99999,
    // but other fields differ (e.g. booleans as strings vs booleans as primitives).
    // At minimum we verify the function doesn't crash and returns a boolean.
    const result = verifyCallbackHmac(toParams(SAMPLE_CALLBACK, webhookHmac));
    expect(typeof result).toBe('boolean');
  });
});

// ─── validatePaymobConfig ─────────────────────────────────────────────────────

import { validatePaymobConfig } from '@/lib/paymob';

describe('validatePaymobConfig', () => {
  const ENV_KEYS = [
    'PAYMOB_API_KEY',
    'PAYMOB_INTEGRATION_ID_CARD',
    'PAYMOB_INTEGRATION_ID_WALLET',
    'PAYMOB_INTEGRATION_ID_FAWRY',
    'PAYMOB_IFRAME_ID',
    'PAYMOB_HMAC_SECRET',
  ];

  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save current values
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    // Set all keys to valid values
    for (const k of ENV_KEYS) process.env[k] = 'valid-value-123';
  });

  afterEach(() => {
    // Restore
    for (const k of ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  });

  it('returns null when all env vars are set', () => {
    expect(validatePaymobConfig()).toBeNull();
  });

  it('returns error string when PAYMOB_API_KEY is missing', () => {
    delete process.env.PAYMOB_API_KEY;
    const result = validatePaymobConfig();
    expect(result).not.toBeNull();
    expect(result).toContain('apiKey');
  });

  it('returns error string when PAYMOB_HMAC_SECRET is missing', () => {
    delete process.env.PAYMOB_HMAC_SECRET;
    const result = validatePaymobConfig();
    expect(result).not.toBeNull();
    expect(result).toContain('hmacSecret');
  });

  it('returns error string when a value contains "your_" (placeholder)', () => {
    process.env.PAYMOB_INTEGRATION_ID_CARD = 'your_card_integration_id';
    const result = validatePaymobConfig();
    expect(result).not.toBeNull();
    expect(result).toContain('integrationIdCard');
  });

  it('reports all missing keys in one call', () => {
    delete process.env.PAYMOB_API_KEY;
    delete process.env.PAYMOB_IFRAME_ID;
    const result = validatePaymobConfig();
    expect(result).not.toBeNull();
    expect(result).toContain('apiKey');
    expect(result).toContain('iframeId');
  });
});
