import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order';
import { protect } from '../middleware/auth';
import { createShiprocketOrder } from '../services/shiprocket';

const router = Router();

// Lazily created so dotenv has already loaded by the time it's first used
let _razorpay: Razorpay | null = null;
function getRazorpay(): Razorpay {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return _razorpay;
}

/* ── POST /api/payment/create-order ──────────────────────── */
router.post('/create-order', protect, async (req: Request, res: Response) => {
  try {
    const { amount, orderId } = req.body; // amount in INR rupees

    const options = {
      amount:   Math.round(amount * 100), // convert to paise
      currency: 'INR',
      receipt:  orderId,
    };

    const rzpOrder = await getRazorpay().orders.create(options);

    await Order.findByIdAndUpdate(orderId, { razorpayOrderId: rzpOrder.id });

    res.json({ razorpayOrderId: rzpOrder.id, amount: rzpOrder.amount });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/payment/verify ───────────────────────────── */
router.post('/verify', protect, async (req: Request, res: Response) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

    const body     = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex');

    if (expected !== razorpaySignature)
      return res.status(400).json({ message: 'Payment verification failed' });

    const order = await Order.findByIdAndUpdate(
      orderId,
      { paymentStatus: 'paid', razorpayPaymentId },
      { new: true },
    ).populate('user', 'email name');

    // Create Shiprocket order now that payment is confirmed (non-blocking)
    if (order && process.env.SHIPROCKET_EMAIL) {
      const user = order.user as any;
      const addr = order.shippingAddress;
      createShiprocketOrder({
        orderId:       order._id.toString(),
        orderDate:     (order as any).createdAt?.toISOString() ?? new Date().toISOString(),
        customerName:  addr.name,
        customerEmail: user?.email ?? '',
        phone:         addr.phone,
        address:       addr.street,
        city:          addr.city,
        state:         addr.state,
        pincode:       addr.zip,
        country:       (addr as any).country || 'India',
        paymentMethod: 'Prepaid',
        subtotal:      order.subtotal,
        shippingCost:  order.shippingCost,
        items: order.items.map((i: any) => ({
          name:  i.name,
          sku:   (i.product?.toString() ?? 'UNKNOWN').slice(-8),
          units: i.quantity,
          price: i.price,
        })),
      })
        .then(sr => Order.findByIdAndUpdate(order._id, {
          shiprocketOrderId:    String(sr.order_id),
          shiprocketShipmentId: String(sr.shipment_id),
          ...(sr.awb_code     ? { shiprocketAwb:     sr.awb_code     } : {}),
          ...(sr.courier_name ? { shiprocketCourier: sr.courier_name } : {}),
        }))
        .catch(err => console.error('[Shiprocket] Prepaid order creation failed:', err.message));
    }

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
