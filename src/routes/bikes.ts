import { Router, Request, Response } from 'express';
import Product from '../models/Product';

const router = Router();

/**
 * Known bike brands — sorted longest-first so greedy prefix matching works
 * (e.g. "Royal Enfield" must match before a hypothetical single-word "Royal")
 */
const KNOWN_BRANDS = [
  'Royal Enfield',
  'Kawasaki',
  'Suzuki',
  'Yamaha',
  'Honda',
  'Bajaj',
  'Hero',
  'TVS',
  'KTM',
  'Jawa',
  'Triumph',
  'Harley-Davidson',
  'Ducati',
  'BMW',
].sort((a, b) => b.length - a.length);

/* ── GET /api/bikes ───────────────────────────────────────────
   Returns { brands: { "Yamaha": ["FZ-S", "MT-15", ...], ... } }
   Derived from the distinct compatibleBikes values stored on products.
──────────────────────────────────────────────────────────────── */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const all: string[] = await Product.distinct('compatibleBikes');

    const brandsMap: Record<string, Set<string>> = {};

    for (const entry of all) {
      if (!entry || entry.toLowerCase() === 'all') continue;

      const brand = KNOWN_BRANDS.find(b =>
        entry.toLowerCase().startsWith(b.toLowerCase())
      );
      if (!brand) continue;

      const model = entry.slice(brand.length).trim();
      if (!brandsMap[brand]) brandsMap[brand] = new Set();
      if (model) brandsMap[brand].add(model);
    }

    // Convert sets → sorted arrays
    const brands: Record<string, string[]> = {};
    for (const [b, models] of Object.entries(brandsMap)) {
      brands[b] = Array.from(models).sort();
    }

    // Return brands sorted alphabetically
    const sorted: Record<string, string[]> = {};
    for (const key of Object.keys(brands).sort()) {
      sorted[key] = brands[key];
    }

    res.json({ brands: sorted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ message: msg });
  }
});

export default router;
