import { Router, Request, Response } from 'express';
import Order from '../models/Order';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

/* ── POST /api/orders ─────────────────────────────────────── */
router.post('/', protect, async (req: Request, res: Response) => {
  try {
    const { items, shippingAddress, shippingMethod = 'standard', paymentMethod = 'cod' } = req.body;

    if (!items?.length) return res.status(400).json({ message: 'Order must have at least one item' });

    const shippingCost = shippingMethod === 'express' ? 149 : 0;
    const subtotal     = items.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const total        = subtotal + shippingCost;

    const order = await Order.create({
      user: req.user!._id,
      items,
      shippingAddress,
      shippingMethod,
      paymentMethod,
      subtotal,
      shippingCost,
      total,
    });

    res.status(201).json(order);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/orders/my ───────────────────────────────────── */
router.get('/my', protect, async (req: Request, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user!._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/orders  (Admin) ─────────────────────────────── */
router.get('/', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const {
      status, userId, search,
      from, to,
      page = '1', limit = '20',
    } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (userId) query.user   = userId;
    if (from || to) {
      query.createdAt = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to   ? { $lte: new Date(to)   } : {}),
      };
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name email')
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 }),
      Order.countDocuments(query),
    ]);

    // search by user name/email after populate
    const filtered = search
      ? items.filter((o: any) =>
          o.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
          o.user?.email?.toLowerCase().includes(search.toLowerCase()))
      : items;

    res.json({ items: filtered, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/orders/:id ─────────────────────────────────── */
router.get('/:id', protect, async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Only owner or admin can view
    if (order.user.toString() !== req.user!._id.toString() && req.user!.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT /api/orders/:id/cancel ──────────────────────────── */
router.put('/:id/cancel', protect, async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.user.toString() !== req.user!._id.toString())
      return res.status(403).json({ message: 'Forbidden' });

    if (['shipped', 'delivered'].includes(order.status))
      return res.status(400).json({ message: `Cannot cancel a ${order.status} order` });

    order.status = 'cancelled';
    await order.save();
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT /api/orders/:id/status  (Admin) ─────────────────── */
router.put('/:id/status', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const { status, trackingId } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, ...(trackingId ? { trackingId } : {}) },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── DELETE /api/orders/:id  (Admin) ────────────────────── */
router.delete('/:id', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
