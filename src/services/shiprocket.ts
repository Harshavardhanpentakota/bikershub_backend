/**
 * Shiprocket API service
 * Docs: https://apiv2.shiprocket.in/v1/external
 *
 * Required env vars:
 *   SHIPROCKET_EMAIL    – Shiprocket account email
 *   SHIPROCKET_PASSWORD – Shiprocket account password
 *   SHIPROCKET_PICKUP_LOCATION – (optional) pickup location name, default "Primary"
 */

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

/* ── Token cache ────────────────────────────────────────────── */
let _token: string | null = null;
let _tokenExpiry: number = 0;   // epoch ms

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email:    process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shiprocket auth failed: ${res.status} ${body}`);
  }

  const data = await res.json() as { token: string };
  _token       = data.token;
  // Shiprocket tokens expire in 10 days; refresh after 9 days to be safe
  _tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return _token;
}

async function srFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> ?? {}),
    },
  });

  if (res.status === 401) {
    // Force token refresh once on 401
    _token = null;
    const freshToken = await getToken();
    const retry = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshToken}`,
        ...(options.headers as Record<string, string> ?? {}),
      },
    });
    if (!retry.ok) {
      const body = await retry.text();
      throw new Error(`Shiprocket API error: ${retry.status} ${body}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shiprocket API error: ${res.status} ${body}`);
  }

  return res.json() as Promise<T>;
}

/* ── Types ────────────────────────────────────────────────── */
export interface ShiprocketOrderPayload {
  orderId:       string;   // your DB order _id
  orderDate:     string;   // ISO date string
  customerName:  string;
  customerEmail: string;
  phone:         string;
  address:       string;
  city:          string;
  state:         string;
  pincode:       string;
  country:       string;
  paymentMethod: 'COD' | 'Prepaid';
  subtotal:      number;
  shippingCost:  number;
  items: {
    name:     string;
    sku:      string;
    units:    number;
    price:    number;
  }[];
}

export interface ShiprocketOrderResponse {
  order_id:    number;
  shipment_id: number;
  status:      string;
  awb_code?:   string;
  courier_name?: string;
}

/* ── Create order ──────────────────────────────────────────── */
export async function createShiprocketOrder(
  payload: ShiprocketOrderPayload,
): Promise<ShiprocketOrderResponse> {
  const nameParts = payload.customerName.trim().split(' ');
  const firstName = nameParts[0] ?? payload.customerName;
  const lastName  = nameParts.slice(1).join(' ') || '.';

  const body = {
    order_id:    payload.orderId,
    order_date:  new Date(payload.orderDate).toISOString().replace('T', ' ').slice(0, 19),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION ?? 'Primary',

    billing_customer_name:  firstName,
    billing_last_name:      lastName,
    billing_address:        payload.address,
    billing_address_2:      '',
    billing_city:           payload.city,
    billing_pincode:        payload.pincode,
    billing_state:          payload.state,
    billing_country:        payload.country || 'India',
    billing_email:          payload.customerEmail,
    billing_phone:          payload.phone,
    billing_isd_code:       '+91',

    shipping_is_billing: 1,

    order_items: payload.items.map((item, idx) => ({
      name:          item.name,
      sku:           item.sku || `SKU-${idx + 1}`,
      units:         item.units,
      selling_price: item.price,
      discount:      '',
      tax:           '',
      hsn:           '',
    })),

    payment_method:       payload.paymentMethod,
    shipping_charges:     payload.shippingCost,
    giftwrap_charges:     0,
    transaction_charges:  0,
    total_discount:       0,
    sub_total:            payload.subtotal,

    // Default package dimensions — update per your products
    length:  15,
    breadth: 15,
    height:  10,
    weight:  0.5,
  };

  return srFetch<ShiprocketOrderResponse>('/orders/create/adhoc', {
    method: 'POST',
    body:   JSON.stringify(body),
  });
}

/* ── List orders ──────────────────────────────────────────── */
export async function listShiprocketOrders(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return srFetch<any>(`/orders${qs ? `?${qs}` : ''}`);
}

/* ── Get single order ─────────────────────────────────────── */
export async function getShiprocketOrder(shiprocketOrderId: number | string) {
  return srFetch<any>(`/orders/show/${shiprocketOrderId}`);
}

/* ── Cancel order ─────────────────────────────────────────── */
export async function cancelShiprocketOrder(ids: (number | string)[]) {
  return srFetch<any>('/orders/cancel', {
    method: 'POST',
    body:   JSON.stringify({ ids }),
  });
}

/* ── Track by AWB ─────────────────────────────────────────── */
export async function trackByAwb(awb: string) {
  return srFetch<any>(`/courier/track/awb/${awb}`);
}

/* ── Get couriers for shipment ────────────────────────────── */
export async function getAvailableCouriers(shipmentId: number | string) {
  return srFetch<any>(`/courier/serviceability/?shipment_id=${shipmentId}&order_id=&cod=0`);
}

/* ── Assign AWB (auto-assign cheapest) ───────────────────── */
export async function generateAwb(shipmentId: number | string) {
  return srFetch<any>('/courier/assign/awb/shipments', {
    method: 'POST',
    body:   JSON.stringify({ shipment_id: String(shipmentId) }),
  });
}

/* ── Generate pickup ──────────────────────────────────────── */
export async function generatePickup(shipmentIds: (number | string)[]) {
  return srFetch<any>('/courier/generate/pickup', {
    method: 'POST',
    body:   JSON.stringify({ shipment_id: shipmentIds }),
  });
}

/* ── Generate label ───────────────────────────────────────── */
export async function generateLabel(shipmentIds: (number | string)[]) {
  return srFetch<any>('/courier/generate/label', {
    method: 'POST',
    body:   JSON.stringify({ shipment_id: shipmentIds }),
  });
}
