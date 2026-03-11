import { Router, Request, Response } from 'express';
import Review from '../models/Review';
import Product from '../models/Product';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

/* ── GET /api/reviews/product/:productId ─────────────────── */
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const { rating, page = '1', limit = '20' } = req.query as Record<string, string>;

    const query: Record<string, unknown> = { product: req.params.productId };
    if (rating) query.rating = Number(rating);

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Review.find(query).populate('user', 'name').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Review.countDocuments(query),
    ]);

    res.json({ items, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/reviews/product/:productId ────────────────── */
router.post('/product/:productId', protect, async (req: Request, res: Response) => {
  try {
    const { rating, comment } = req.body;

    // Check for duplicate (unique index will also catch this)
    const existing = await Review.findOne({
      product: req.params.productId,
      user:    req.user!._id,
    });
    if (existing)
      return res.status(400).json({ message: 'You have already reviewed this product' });

    const review = await Review.create({
      product:  req.params.productId,
      user:     req.user!._id,
      userName: req.user!.name,
      rating,
      comment,
    });

    // Update product aggregate rating
    const reviews = await Review.find({ product: req.params.productId });
    const avgRating  = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    await Product.findByIdAndUpdate(req.params.productId, {
      rating:      Math.round(avgRating * 10) / 10,
      reviewCount: reviews.length,
    });

    res.status(201).json(review);
  } catch (err: any) {
    if (err.code === 11000)
      return res.status(400).json({ message: 'You have already reviewed this product' });
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /admin/reviews  [ADMIN] ────────────────────────── */
router.get('/admin/all', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const {
      productId, rating, search, from, to,
      page = '1', limit = '20',
    } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};
    if (productId) query.product = productId;
    if (rating)    query.rating  = Number(rating);
    if (from || to) {
      query.createdAt = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to   ? { $lte: new Date(to)   } : {}),
      };
    }
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { comment:  { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Review.find(query)
        .populate('user', 'name email')
        .populate('product', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Review.countDocuments(query),
    ]);

    res.json({ items, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT /api/reviews/:id/flag  [ADMIN] ─────────────────── */
router.put('/:id/flag', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { flagged: true, flagReason: reason },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT /api/reviews/:id/unflag  [ADMIN] ───────────────── */
router.put('/:id/unflag', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { flagged: false, $unset: { flagReason: '' } },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── DELETE /api/reviews/:id ─────────────────────────────── */
router.delete('/:id', protect, async (req: Request, res: Response) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (review.user.toString() !== req.user!._id.toString() && req.user!.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    const productId = review.product;
    await review.deleteOne();

    // Recalculate product rating
    const remaining = await Review.find({ product: productId });
    const avgRating = remaining.length
      ? remaining.reduce((s, r) => s + r.rating, 0) / remaining.length
      : 0;
    await Product.findByIdAndUpdate(productId, {
      rating:      Math.round(avgRating * 10) / 10,
      reviewCount: remaining.length,
    });

    res.json({ message: 'Review deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
