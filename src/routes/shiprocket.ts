/**
 * Shiprocket admin routes — /api/admin/shiprocket/*
 * All routes require admin authentication.
 */
import { Router, Request, Response } from 'express';
import Order from '../models/Order';
import { protect, adminOnly } from '../middleware/auth';
import {
  listShiprocketOrders,
  getShiprocketOrder,
  cancelShiprocketOrder,
  trackByAwb,
  generateAwb,
  generatePickup,
  generateLabel,
} from '../services/shiprocket';

const router = Router();
router.use(protect, adminOnly);

/* ── GET /api/admin/shiprocket/orders ───────────────────── */
// Returns our DB orders enriched with Shiprocket info
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', status, search } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};
    if (status && status !== 'all') query.status = status;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Order.countDocuments(query),
    ]);

    const filtered = search
      ? items.filter((o: any) =>
          o.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
          o.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
          o._id.toString().includes(search))
      : items;

    res.json({ items: filtered, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/admin/shiprocket/stats ────────────────────── */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [total, withShiprocket, pendingAwb, shipped] = await Promise.all([
      Order.countDocuments({}),
      Order.countDocuments({ shiprocketOrderId: { $exists: true, $ne: null } }),
      Order.countDocuments({ shiprocketOrderId: { $exists: true }, shiprocketAwb: { $exists: false } }),
      Order.countDocuments({ status: 'shipped' }),
    ]);

    res.json({ total, withShiprocket, pendingAwb, shipped });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/admin/shiprocket/sr-orders ─────────────────── */
// Fetch orders directly from Shiprocket API
router.get('/sr-orders', async (req: Request, res: Response) => {
  try {
    const params: Record<string, string> = {};
    if (req.query.page)  params.page  = req.query.page  as string;
    if (req.query.per_page) params.per_page = req.query.per_page as string;
    if (req.query.sort_by)  params.sort_by  = req.query.sort_by  as string;
    if (req.query.sort)     params.sort      = req.query.sort      as string;

    const data = await listShiprocketOrders(params);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/admin/shiprocket/sr-orders/:shiprocketOrderId ─ */
router.get('/sr-orders/:shiprocketOrderId', async (req: Request, res: Response) => {
  try {
    const data = await getShiprocketOrder(req.params.shiprocketOrderId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/admin/shiprocket/orders/:id/generate-awb ─── */
router.post('/orders/:id/generate-awb', async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.shiprocketShipmentId)
      return res.status(400).json({ message: 'No Shiprocket shipment linked to this order' });

    const result = await generateAwb(order.shiprocketShipmentId);
    const awb    = result?.awb_assign_status_message?.awb ?? result?.response?.data?.awb_code;
    const courier = result?.awb_assign_status_message?.courier_name ?? result?.response?.data?.courier_name;

    if (awb) {
      await Order.findByIdAndUpdate(order._id, {
        shiprocketAwb:     awb,
        ...(courier ? { shiprocketCourier: courier } : {}),
      });
    }

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/admin/shiprocket/orders/:id/request-pickup ─ */
router.post('/orders/:id/request-pickup', async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.shiprocketShipmentId)
      return res.status(400).json({ message: 'No Shiprocket shipment linked to this order' });

    const result = await generatePickup([order.shiprocketShipmentId]);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/admin/shiprocket/orders/:id/generate-label ─ */
router.post('/orders/:id/generate-label', async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.shiprocketShipmentId)
      return res.status(400).json({ message: 'No Shiprocket shipment linked to this order' });

    const result = await generateLabel([order.shiprocketShipmentId]);
    res.json({ success: true, label_url: result?.label_url, result });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/admin/shiprocket/orders/:id/cancel ──────── */
router.post('/orders/:id/cancel', async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.shiprocketOrderId)
      return res.status(400).json({ message: 'No Shiprocket order linked' });

    const result = await cancelShiprocketOrder([order.shiprocketOrderId]);
    await Order.findByIdAndUpdate(order._id, { status: 'cancelled' });
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/admin/shiprocket/track/:awb ───────────────── */
router.get('/track/:awb', async (req: Request, res: Response) => {
  try {
    const data = await trackByAwb(req.params.awb);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
