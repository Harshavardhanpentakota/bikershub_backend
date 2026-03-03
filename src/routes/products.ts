import { Router, Request, Response } from 'express';
import Product from '../models/Product';
import { protect, adminOnly } from '../middleware/auth';
import { uploadImages } from '../middleware/upload';

const router = Router();

/* ── GET /api/products ────────────────────────────────────── */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      category,
      brand,
      model,
      compatibleBike,   // full "Brand Model" string sent by shop-by-ride / URL params
      badge,            // "bestseller" | "new" | "discount"
      isNew,            // "true"
      search,
      sort,             // field name; prefix with "-" for descending (e.g. "-discount")
      page  = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};

    if (category) query.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };
    if (search) {
      query.$or = [
        { name:        { $regex: escapeRegex(search), $options: 'i' } },
        { description: { $regex: escapeRegex(search), $options: 'i' } },
        { category:    { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }
    if (badge)    query.badge  = badge;
    if (isNew === 'true') query.isNew = true;

    // Compatible bike filtering — priority: full string > brand+model > brand-only
    if (compatibleBike) {
      const trimmed = compatibleBike.trim();
      query.compatibleBikes = {
        $elemMatch: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' },
      };
    } else if (brand && model) {
      const key = `${brand.trim()} ${model.trim()}`;
      query.compatibleBikes = {
        $elemMatch: { $regex: `^${escapeRegex(key)}$`, $options: 'i' },
      };
    } else if (brand) {
      query.compatibleBikes = {
        $elemMatch: { $regex: `^${escapeRegex(brand.trim())}`, $options: 'i' },
      };
    }

    // Sorting
    let sortObj: Record<string, 1 | -1> = {};
    if (sort) {
      const desc  = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      sortObj[field] = desc ? -1 : 1;
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(query),
    ]);

    res.json({ products, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/products/:id ────────────────────────────────── */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/products  (Admin) ──────────────────────────── */
router.post(
  '/',
  protect,
  adminOnly,
  uploadImages,
  async (req: Request, res: Response) => {
    try {
      const files = (req.files ?? []) as Express.Multer.File[];
      const images = files.map(f => (f as any).path as string);
      const product = await Product.create({
        ...req.body,
        image: images[0] ?? req.body.image,
        images,
      });
      res.status(201).json(product);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }
);

/* ── PUT /api/products/:id  (Admin) ───────────────────────── */
router.put(
  '/:id',
  protect,
  adminOnly,
  uploadImages,
  async (req: Request, res: Response) => {
    try {
      const files = (req.files ?? []) as Express.Multer.File[];
      const updates: Record<string, unknown> = { ...req.body };
      if (files.length) {
        const imageUrls = files.map(f => (f as any).path as string);
        updates.images = imageUrls;
        updates.image  = imageUrls[0];
      }
      const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
      if (!product) return res.status(404).json({ message: 'Product not found' });
      res.json(product);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }
);

/* ── DELETE /api/products/:id  (Admin) ────────────────────── */
router.delete('/:id', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default router;
