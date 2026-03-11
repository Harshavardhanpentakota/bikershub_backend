import { Router, Request, Response } from 'express';
import multer from 'multer';
import Product from '../models/Product';
import { protect, adminOnly } from '../middleware/auth';
import { uploadImages } from '../middleware/upload';

const router = Router();
const csvUpload = multer({ storage: multer.memoryStorage() }).single('file');

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

/* ── GET /api/products/bulk-import/template  (Admin) ─────── */
router.get('/bulk-import/template', protect, adminOnly, (_req: Request, res: Response) => {
  const csvHeader = 'name,description,price,category,brand,stock,images,tags\n';
  const csvExample =
    'Racing Helmet Pro,"Full-face motorcycle helmet with visor",199.99,Helmets,RacePro,50,' +
    'https://cdn.example.com/img1.jpg,"helmet,racing,safety"\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
  res.send(csvHeader + csvExample);
});

/* ── POST /api/products/bulk-import  (Admin) ─────────────── */
router.post('/bulk-import', protect, adminOnly, csvUpload, async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const text   = req.file.buffer.toString('utf-8');
    const rows   = parseCSV(text);
    if (rows.length < 2)
      return res.status(422).json({ message: 'CSV has no data rows', imported: 0, skipped: 0, errors: [] });

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const idx = (col: string) => headers.indexOf(col);

    const results: { imported: number; skipped: number; errors: { row: number; reason: string }[] } =
      { imported: 0, skipped: 0, errors: [] };

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every(c => !c)) continue;   // skip blank lines

      const get = (col: string) => row[idx(col)]?.trim() ?? '';

      const name        = get('name');
      const description = get('description');
      const priceRaw    = get('price');
      const category    = get('category');
      const brand       = get('brand');
      const stockRaw    = get('stock');

      if (!name || !priceRaw) {
        results.errors.push({ row: i + 1, reason: `Missing required field: ${!name ? 'name' : 'price'}` });
        results.skipped++;
        continue;
      }

      const price = parseFloat(priceRaw);
      const stock = parseInt(stockRaw, 10) || 0;
      if (isNaN(price)) {
        results.errors.push({ row: i + 1, reason: 'Invalid price value' });
        results.skipped++;
        continue;
      }

      const imagesRaw = get('images');
      const tagsRaw   = get('tags');
      const images    = imagesRaw ? imagesRaw.split('|').map(s => s.trim()).filter(Boolean) : [];
      const tags      = tagsRaw   ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean)   : [];

      try {
        await Product.create({
          name, description, price, category, brand,
          stockQuantity: stock,
          inStock: stock > 0,
          images, tags, image: images[0] ?? '',
        });
        results.imported++;
      } catch (err: any) {
        results.errors.push({ row: i + 1, reason: err.message });
        results.skipped++;
      }
    }

    const statusCode = results.errors.length > 0 && results.imported === 0 ? 422 : 201;
    res.status(statusCode).json(results);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Minimal RFC-4180-compatible CSV parser */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) {
        inQuote = true;
      } else if (ch === '"' && inQuote) {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = false;
      } else if (ch === ',' && !inQuote) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    rows.push(cols);
  }
  return rows;
}

export default router;
