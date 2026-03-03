import { Router, Request, Response } from 'express';
import Review from '../models/Review';
import Product from '../models/Product';
import { protect } from '../middleware/auth';

const router = Router();

/* ── GET /api/reviews/product/:productId ─────────────────── */
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    res.json(reviews);
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
