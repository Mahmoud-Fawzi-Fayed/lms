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
