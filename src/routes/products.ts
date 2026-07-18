import { Router, Request, Response } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import Product from '../models/Product';
import { protect, adminOnly } from '../middleware/auth';
import { uploadImages } from '../middleware/upload';
import { fuzzySearchProductIds, invalidateSearchIndex } from '../services/searchIndex';

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
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};

    if (category) query.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };

    // Fuzzy (typo-tolerant) search over an in-memory index, ranked by relevance.
    let fuzzyRank: Map<string, number> | null = null;
    if (search && search.trim()) {
      const matchedIds = await fuzzySearchProductIds(search.trim());
      if (matchedIds.length === 0) {
        res.json({ products: [], total: 0, page: 1, pages: 0 });
        return;
      }
      fuzzyRank = new Map(matchedIds.map((id, i) => [id, i]));
      query._id = { $in: matchedIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    if (badge) query.badge = badge;
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
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      sortObj[field] = desc ? -1 : 1;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip = (pageNum - 1) * limitNum;

    let products: any[];
    let total: number;

    if (fuzzyRank && !sort) {
      // Relevance order can't be expressed as a Mongo sort — fetch the (already
      // threshold-bounded) match set, rank in memory, then paginate.
      const all = await Product.find(query).lean();
      all.sort((a: any, b: any) => (fuzzyRank!.get(String(a._id)) ?? 0) - (fuzzyRank!.get(String(b._id)) ?? 0));
      total = all.length;
      products = all.slice(skip, skip + limitNum);
    } else {
      [products, total] = await Promise.all([
        Product.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
        Product.countDocuments(query),
      ]);
    }

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
      const body = parseProductBody({ ...req.body });
      const product = await Product.create({
        ...body,
        image: images[0] ?? body.image,
        images: images.length ? images : body.images,
      });
      invalidateSearchIndex();
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
      const updates = parseProductBody({ ...req.body });
      if (files.length) {
        const imageUrls = files.map(f => (f as any).path as string);
        updates.images = imageUrls;
        updates.image = imageUrls[0];
      }
      const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
      if (!product) return res.status(404).json({ message: 'Product not found' });
      invalidateSearchIndex();
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
    invalidateSearchIndex();
    res.json({ message: 'Product deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/products/bulk-import/template  (Admin) ─────── */
router.get('/bulk-import/template', protect, adminOnly, (_req: Request, res: Response) => {
  const csvHeader = 'name,description,price,originalPrice,discount,rating,reviewCount,category,compatibleBikes,sizes,colors,badge,image,images,specifications,inStock,stockQuantity,brand,tags\n';
  const csvExample =
    'Stealth Carbon Full-Face Helmet,"Premium carbon fiber full-face helmet with advanced ventilation",189.99,249.99,24,4.8,342,Helmets,All,S|M|L|XL,"Matte Black:#1a1a1a|Gloss White:#f5f5f5|Racing Orange:#FF6A2B",bestseller,https://images.unsplash.com/photo-1558618666-fcd25c85f7e7,https://images.unsplash.com/photo-1558618666-fcd25c85f7e7|https://images.unsplash.com/photo-1609634700683-85843a0c1135,"Material:Carbon Fiber|Weight:1.3 kg|Certification:DOT, ECE 22.06",true,50,Yamaha,"helmet,safety"\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
  res.send(csvHeader + csvExample);
});

/* ── POST /api/products/bulk-import-json  (Admin) ────────── */
router.post('/bulk-import-json', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const rows: any[] = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.rows) ? req.body.rows : []);
    if (rows.length === 0)
      return res.status(400).json({ message: 'No rows provided', imported: 0, skipped: 0, errors: [] });

    const results: { imported: number; skipped: number; errors: { row: number; reason: string }[] } =
      { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row.name?.trim() ?? '';
      const description = row.description?.trim() ?? '';
      const priceRaw = row.price?.toString().trim() ?? '';
      const category = row.category?.trim() ?? '';

      if (!name || !priceRaw) {
        results.errors.push({ row: i + 1, reason: `Missing required field: ${!name ? 'name' : 'price'}` });
        results.skipped++;
        continue;
      }
      const price = parseFloat(priceRaw);
      if (isNaN(price)) {
        results.errors.push({ row: i + 1, reason: 'Invalid price value' });
        results.skipped++;
        continue;
      }

      const originalPriceRaw = row.originalprice?.toString().trim() || row.originalPrice?.toString().trim() || '';
      const originalPrice = originalPriceRaw ? parseFloat(originalPriceRaw) : undefined;

      const discountRaw = row.discount?.toString().trim() || '';
      const discount = discountRaw ? parseFloat(discountRaw) : undefined;

      const ratingRaw = row.rating?.toString().trim() || '';
      const rating = ratingRaw ? parseFloat(ratingRaw) : 0;

      const reviewCountRaw = row.reviewcount?.toString().trim() || row.reviewCount?.toString().trim() || '';
      const reviewCount = reviewCountRaw ? parseInt(reviewCountRaw, 10) : 0;

      const badge = row.badge?.trim() || undefined;
      const brand = row.brand?.trim() || undefined;
      const tagsRaw = row.tags ?? '';
      const tags = typeof tagsRaw === 'string'
        ? tagsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(tagsRaw) ? tagsRaw : [];

      const stockRaw = (row.stockquantity ?? row.stockQuantity ?? row.stock ?? row.stockQuantity ?? '').toString().trim();
      const stockQuantity = stockRaw ? parseInt(stockRaw, 10) || 0 : 0;

      const inStockRaw = row.instock?.toString().toLowerCase().trim() || row.inStock?.toString().toLowerCase().trim() || '';
      let inStock = true;
      if (inStockRaw === 'false' || inStockRaw === 'no' || inStockRaw === '0') {
        inStock = false;
      } else if (inStockRaw === '' && stockRaw !== '') {
        inStock = stockQuantity > 0;
      }

      const sizesRaw = row.sizes ?? '';
      const sizes = typeof sizesRaw === 'string'
        ? sizesRaw.split(/[|,]/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(sizesRaw) ? sizesRaw : [];

      const compatibleBikesRaw = row.compatiblebikes ?? row.compatibleBikes ?? '';
      const compatibleBikes = typeof compatibleBikesRaw === 'string'
        ? compatibleBikesRaw.split(/[|,]/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(compatibleBikesRaw) ? compatibleBikesRaw : [];

      const colors = parseColors(row.colors);
      const specifications = parseSpecifications(row.specifications);

      const imagesRaw = row.images ?? '';
      const images = typeof imagesRaw === 'string'
        ? imagesRaw.split(/[|,]/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(imagesRaw) ? imagesRaw : [];

      const image = row.image?.trim() || images[0] || '';

      try {
        await Product.create({
          name, description, price, originalPrice, discount, rating, reviewCount,
          category, compatibleBikes, sizes, colors, badge, image, images,
          specifications, inStock, stockQuantity, brand, tags
        });
        results.imported++;
      } catch (err: any) {
        results.errors.push({ row: i + 1, reason: err.message });
        results.skipped++;
      }
    }
    if (results.imported > 0) invalidateSearchIndex();
    const statusCode = results.errors.length > 0 && results.imported === 0 ? 422 : 201;
    res.status(statusCode).json(results);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/products/bulk-import  (Admin) ─────────────── */
router.post('/bulk-import', protect, adminOnly, csvUpload, async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);
    if (rows.length < 2)
      return res.status(422).json({ message: 'CSV has no data rows', imported: 0, skipped: 0, errors: [] });

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const idx = (col: string) => headers.indexOf(col);

    const results: { imported: number; skipped: number; errors: { row: number; reason: string }[] } =
      { imported: 0, skipped: 0, errors: [] };

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every(c => !c)) continue;   // skip blank lines

      const get = (col: string) => {
        const index = idx(col);
        return index > -1 ? row[index]?.trim() ?? '' : '';
      };

      const name = get('name');
      const description = get('description');
      const priceRaw = get('price');
      const category = get('category');

      if (!name || !priceRaw) {
        results.errors.push({ row: i + 1, reason: `Missing required field: ${!name ? 'name' : 'price'}` });
        results.skipped++;
        continue;
      }

      const price = parseFloat(priceRaw);
      if (isNaN(price)) {
        results.errors.push({ row: i + 1, reason: 'Invalid price value' });
        results.skipped++;
        continue;
      }

      const originalPriceRaw = get('originalprice');
      const originalPrice = originalPriceRaw ? parseFloat(originalPriceRaw) : undefined;

      const discountRaw = get('discount');
      const discount = discountRaw ? parseFloat(discountRaw) : undefined;

      const ratingRaw = get('rating');
      const rating = ratingRaw ? parseFloat(ratingRaw) : 0;

      const reviewCountRaw = get('reviewcount');
      const reviewCount = reviewCountRaw ? parseInt(reviewCountRaw, 10) : 0;

      const badge = get('badge') || undefined;
      const brand = get('brand') || undefined;
      const tagsRaw = get('tags');
      const tags = tagsRaw ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

      const stockRaw = get('stockquantity') || get('stock');
      const stockQuantity = stockRaw ? parseInt(stockRaw, 10) || 0 : 0;

      const inStockRaw = get('instock');
      let inStock = true;
      if (inStockRaw === 'false' || inStockRaw === 'no' || inStockRaw === '0') {
        inStock = false;
      } else if (inStockRaw === '' && stockRaw !== '') {
        inStock = stockQuantity > 0;
      }

      const sizesRaw = get('sizes');
      const sizes = sizesRaw ? sizesRaw.split(/[|,]/).map(s => s.trim()).filter(Boolean) : [];

      const compatibleBikesRaw = get('compatiblebikes');
      const compatibleBikes = compatibleBikesRaw ? compatibleBikesRaw.split(/[|,]/).map(s => s.trim()).filter(Boolean) : [];

      const colors = parseColors(get('colors'));
      const specifications = parseSpecifications(get('specifications'));

      const imagesRaw = get('images');
      const images = imagesRaw ? imagesRaw.split(/[|,]/).map(s => s.trim()).filter(Boolean) : [];

      const image = get('image') || images[0] || '';

      try {
        await Product.create({
          name, description, price, originalPrice, discount, rating, reviewCount,
          category, compatibleBikes, sizes, colors, badge, image, images,
          specifications, inStock, stockQuantity, brand, tags
        });
        results.imported++;
      } catch (err: any) {
        results.errors.push({ row: i + 1, reason: err.message });
        results.skipped++;
      }
    }

    if (results.imported > 0) invalidateSearchIndex();
    const statusCode = results.errors.length > 0 && results.imported === 0 ? 422 : 201;
    res.status(statusCode).json(results);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/products/ai-fill  (Admin) ─────────────────── */
router.post('/ai-fill', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: 'GEMINI_API_KEY is not set in backend .env.' });
    }

    const { name, category } = req.body;
    if (!name) return res.status(400).json({ message: 'Product name is required' });

    const prompt = `You are a product database builder for BikersHub, a motorcycle gear and accessories store.
Generate realistic product details for a product named "${name}" in the category "${category || 'Accessories'}".
Return ONLY a valid JSON object matching this schema (no markdown, no code fences):
{
  "description": "Premium full-face helmet / riding gloves with high protection...",
  "price": 199.99,
  "originalPrice": 249.99,
  "discount": 20,
  "sizes": ["S", "M", "L", "XL"],
  "colors": [{"name": "Matte Black", "hex": "#1a1a1a"}],
  "compatibleBikes": ["Yamaha YZF-R15", "KTM Duke 390"],
  "specifications": {
    "Material": "Carbon Fiber",
    "Certification": "DOT Certified"
  },
  "badge": "new"
}`;

    const { GoogleGenerativeAI } = await import('@google/generative-ai' as string as any);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini returned an unexpected response format');

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/products/ai-scrape  (Admin) ────────────────── */
router.post('/ai-scrape', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: 'GEMINI_API_KEY is not set in backend .env.' });
    }

    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'Website URL is required' });

    let pageText = '';
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      const fetchRes = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      const html = await fetchRes.text();
      pageText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000);
    } catch (fetchErr: any) {
      console.warn(`Scraping URL ${url} directly failed, using site name simulation:`, fetchErr.message);
    }

    const prompt = `You are a product scraper agent for a motorcycle accessories shop.
We need to extract or generate realistic product items from a webpage.
The website URL provided is: "${url}".
${pageText ? `Here is the raw text scraped from the page: \n\n${pageText}\n\n` : `We could not reach the page directly. Please generate 4-6 realistic, high-quality products that fit a motorcycle store from this domain/brand.`}

Return ONLY a valid JSON object matching this schema (no markdown, no code fences). Generate between 4 and 6 products:
{
  "products": [
    {
      "name": "Stealth Carbon Helmet",
      "description": "Full-face carbon fiber helmet...",
      "price": 189.99,
      "originalPrice": 249.99,
      "discount": 24,
      "rating": 4.8,
      "reviewCount": 124,
      "category": "Helmets",
      "sizes": ["S", "M", "L", "XL"],
      "colors": [{"name": "Matte Black", "hex": "#1a1a1a"}],
      "badge": "bestseller",
      "compatibleBikes": ["All"],
      "specifications": {
        "Material": "Carbon Fiber",
        "Weight": "1.3 kg"
      },
      "inStock": true,
      "stockQuantity": 50,
      "image": "https://images.unsplash.com/photo-1558618666-fcd25c85f7e7?w=600&h=600&fit=crop",
      "images": ["https://images.unsplash.com/photo-1558618666-fcd25c85f7e7?w=600&h=600&fit=crop"]
    }
  ]
}`;

    const { GoogleGenerativeAI } = await import('@google/generative-ai' as string as any);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini returned an unexpected response format');

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseColors(val: any): { name: string; hex: string }[] {
  if (Array.isArray(val)) {
    return val.map(c => {
      if (c && typeof c === 'object' && 'name' in (c as object)) {
        return { name: String(c.name), hex: String((c as any).hex || '#000000') };
      }
      const parts = String(c).split(':');
      return { name: parts[0]?.trim() || '', hex: parts[1]?.trim() || '#000000' };
    }).filter(c => c.name);
  }
  if (typeof val === 'string' && val.trim()) {
    return val.split(/[|,]/).map(s => {
      const parts = s.trim().split(':');
      return { name: parts[0]?.trim() || '', hex: parts[1]?.trim() || '#000000' };
    }).filter(c => c.name);
  }
  return [];
}

function parseSpecifications(val: any): Record<string, string> {
  let specifications: Record<string, string> = {};
  if (typeof val === 'object' && val !== null) {
    specifications = val;
  } else if (typeof val === 'string' && val.trim()) {
    const trimmed = val.trim();
    if (trimmed.startsWith('{')) {
      try {
        specifications = JSON.parse(trimmed);
      } catch (e) {
        // ignore
      }
    }
    if (Object.keys(specifications).length === 0) {
      trimmed.split('|').forEach(pair => {
        const index = pair.indexOf(':');
        if (index > -1) {
          const key = pair.substring(0, index).trim();
          const val = pair.substring(index + 1).trim();
          if (key) specifications[key] = val;
        }
      });
    }
  }
  return specifications;
}

/**
 * Normalise a raw request body so that array / embedded-object fields
 * are always in the shape Mongoose expects, even when the client sends
 * them as plain strings (common with multipart/form-data).
 */
function parseProductBody(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };

  // Helper: try to JSON-parse a value; return original on failure.
  const tryJSON = (v: unknown): unknown => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  };

  // --- colors: must be { name: string; hex: string }[] ---
  if (out.colors !== undefined) {
    const parsed = tryJSON(out.colors);
    if (Array.isArray(parsed)) {
      out.colors = (parsed as unknown[]).map(c => {
        if (c && typeof c === 'object' && 'name' in (c as object)) {
          return { name: String((c as any).name), hex: String((c as any).hex || '#000000') };
        }
        const parts = String(c).split(':');
        return { name: parts[0]?.trim() || '', hex: parts[1]?.trim() || '#000000' };
      }).filter((c: any) => c.name);
    } else if (typeof parsed === 'string') {
      out.colors = parsed.split(',').map(s => {
        const parts = s.trim().split(':');
        return { name: parts[0]?.trim() || '', hex: parts[1]?.trim() || '#000000' };
      }).filter(c => c.name);
    } else if (parsed && typeof parsed === 'object') {
      out.colors = [parsed];
    }
  }

  // --- Simple string[] fields ---
  for (const field of ['sizes', 'images', 'compatibleBikes'] as const) {
    if (out[field] !== undefined) {
      const parsed = tryJSON(out[field]);
      if (Array.isArray(parsed)) {
        out[field] = parsed;
      } else if (typeof parsed === 'string') {
        out[field] = parsed.split(/[|,]/).map((s: string) => s.trim()).filter(Boolean);
      }
    }
  }

  // --- specifications: may arrive as a JSON string ---
  if (out.specifications !== undefined) {
    out.specifications = tryJSON(out.specifications);
  }

  return out;
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
