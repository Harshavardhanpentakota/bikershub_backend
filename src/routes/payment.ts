import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order';
import { protect } from '../middleware/auth';

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

    await Order.findByIdAndUpdate(orderId, {
      paymentStatus:     'paid',
      razorpayPaymentId,
    });

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
