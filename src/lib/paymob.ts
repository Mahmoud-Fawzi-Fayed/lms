import axios from 'axios';
import crypto from 'crypto';

const PAYMOB_BASE = 'https://accept.paymob.com/api';

interface PaymobConfig {
  apiKey: string;
  integrationIdCard: string;
  integrationIdWallet: string;
  integrationIdFawry: string;
  iframeId: string;
  hmacSecret: string;
}

function getConfig(): PaymobConfig {
  const config = {
    apiKey: process.env.PAYMOB_API_KEY!,
    integrationIdCard: process.env.PAYMOB_INTEGRATION_ID_CARD!,
    integrationIdWallet: process.env.PAYMOB_INTEGRATION_ID_WALLET!,
    integrationIdFawry: process.env.PAYMOB_INTEGRATION_ID_FAWRY!,
    iframeId: process.env.PAYMOB_IFRAME_ID!,
    hmacSecret: process.env.PAYMOB_HMAC_SECRET!,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value || value.includes('your_'))
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`إعدادات Paymob غير مكتملة: ${missing.join(', ')}`);
  }

  return config;
}

function getIntegrationIdByMethod(config: PaymobConfig, method: 'card' | 'fawry' | 'wallet') {
  switch (method) {
    case 'card':
      return config.integrationIdCard;
    case 'wallet':
      return config.integrationIdWallet;
    case 'fawry':
      return config.integrationIdFawry;
  }
}

// Step 1: Authenticate with Paymob
async function authenticate(): Promise<string> {
  const config = getConfig();
  const response = await axios.post(`${PAYMOB_BASE}/auth/tokens`, {
    api_key: config.apiKey,
  });
  return response.data.token;
}

// Step 2: Create order
async function createOrder(
  token: string,
  amountCents: number,
  merchantOrderId: string
): Promise<number> {
  const response = await axios.post(`${PAYMOB_BASE}/ecommerce/orders`, {
    auth_token: token,
    delivery_needed: false,
    amount_cents: amountCents,
    merchant_order_id: merchantOrderId,
    items: [],
  });
  return response.data.id;
}

// Step 3: Generate payment key
async function generatePaymentKey(
  token: string,
  orderId: number,
  amountCents: number,
  integrationId: string,
  billingData: any
): Promise<string> {
  const response = await axios.post(`${PAYMOB_BASE}/acceptance/payment_keys`, {
    auth_token: token,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: orderId,
    billing_data: billingData,
    currency: 'EGP',
    integration_id: parseInt(integrationId),
  });
  return response.data.token;
}

// Main: Initiate payment
export async function initiatePayment(params: {
  amountEGP: number;
  method: 'card' | 'fawry' | 'wallet';
  orderId: string;
  user: {
    email: string;
    name: string;
    phone?: string;
  };
}): Promise<{
  paymentUrl?: string;
  paymentKey?: string;
  paymobOrderId: number;
  fawryRef?: string;
  iframeUrl?: string;
}> {
  const config = getConfig();
  const amountCents = Math.round(params.amountEGP * 100);

  // Step 1: Auth
  const authToken = await authenticate();

  // Step 2: Create order
  const paymobOrderId = await createOrder(authToken, amountCents, params.orderId);

  // Step 3: Get integration ID based on method
  const integrationId = getIntegrationIdByMethod(config, params.method);

  const nameParts = params.user.name.split(' ');
  const billingData = {
    first_name: nameParts[0] || 'N/A',
    last_name: nameParts.slice(1).join(' ') || 'N/A',
    email: params.user.email,
    phone_number: params.user.phone || '+201000000000',
    apartment: 'NA',
    floor: 'NA',
    street: 'NA',
    building: 'NA',
    shipping_method: 'NA',
    postal_code: 'NA',
    city: 'Cairo',
    country: 'EG',
    state: 'Cairo',
  };

  // Step 3: Payment key
  const paymentKey = await generatePaymentKey(
    authToken,
    paymobOrderId,
    amountCents,
    integrationId,
    billingData
  );

  const result: any = {
    paymentKey,
    paymobOrderId,
    iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${config.iframeId}?payment_token=${paymentKey}`,
  };

  return result;
}

// Verify webhook HMAC signature
export function verifyWebhookHmac(
  data: Record<string, any>,
  receivedHmac: string
): boolean {
  const config = getConfig();

  // Paymob HMAC verification - concatenate specific fields in order
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
    .map(field => {
      const keys = field.split('.');
      let val: any = data;
      for (const k of keys) {
        val = val?.[k];
      }
      return String(val ?? '');
    })
    .join('');

  const calculatedHmac = crypto
    .createHmac('sha512', config.hmacSecret)
    .update(concatenated)
    .digest('hex');

  if (!receivedHmac || receivedHmac.length !== calculatedHmac.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHmac),
    Buffer.from(receivedHmac)
  );
}
