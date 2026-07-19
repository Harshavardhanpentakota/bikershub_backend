import { Router, Request, Response } from 'express';
import BikeCatalog from '../models/BikeCatalog';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

/* ── GET /api/bikes ───────────────────────────────────────────
   Returns { brands: { "Yamaha": ["FZ-S", "MT-15", ...], ... } }
   Single shared source of truth (BikeCatalog collection, seeded from
   data/bikes_master.csv) — used by both the admin compatible-bikes
   picker and the customer-facing "Shop by Bike" dropdown.
──────────────────────────────────────────────────────────────── */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const catalog = await BikeCatalog.find().sort({ brand: 1 }).lean();

    const brands: Record<string, string[]> = {};
    for (const entry of catalog) {
      brands[entry.brand] = [...entry.models].sort();
    }

    res.json({ brands });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ message: msg });
  }
});

/* ── Admin management ─────────────────────────────────────────
   All mutations below require an authenticated admin. The catalog
   is small (26 brands / ~300 models) so every route just returns
   the full updated { brands } map for the admin UI to re-render.
──────────────────────────────────────────────────────────────── */

async function fullCatalog(): Promise<Record<string, string[]>> {
  const catalog = await BikeCatalog.find().sort({ brand: 1 }).lean();
  const brands: Record<string, string[]> = {};
  for (const entry of catalog) brands[entry.brand] = [...entry.models].sort();
  return brands;
}

// POST /api/bikes/brands  { brand }
router.post('/brands', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const brand = String(req.body.brand || '').trim();
    if (!brand) { res.status(400).json({ message: 'brand is required' }); return; }

    const exists = await BikeCatalog.findOne({ brand: new RegExp(`^${brand}$`, 'i') });
    if (exists) { res.status(409).json({ message: 'Brand already exists' }); return; }

    await BikeCatalog.create({ brand, models: [] });
    res.status(201).json({ brands: await fullCatalog() });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
  }
});

// PUT /api/bikes/brands/:brand  { brand: newName }  — rename
router.put('/brands/:brand', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const newName = String(req.body.brand || '').trim();
    if (!newName) { res.status(400).json({ message: 'brand is required' }); return; }

    const doc = await BikeCatalog.findOne({ brand: req.params.brand });
    if (!doc) { res.status(404).json({ message: 'Brand not found' }); return; }

    doc.brand = newName;
    await doc.save();
    res.json({ brands: await fullCatalog() });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
  }
});

// DELETE /api/bikes/brands/:brand
router.delete('/brands/:brand', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const result = await BikeCatalog.findOneAndDelete({ brand: req.params.brand });
    if (!result) { res.status(404).json({ message: 'Brand not found' }); return; }
    res.json({ brands: await fullCatalog() });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
  }
});

// POST /api/bikes/brands/:brand/models  { model }
router.post('/brands/:brand/models', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const model = String(req.body.model || '').trim();
    if (!model) { res.status(400).json({ message: 'model is required' }); return; }

    const doc = await BikeCatalog.findOne({ brand: req.params.brand });
    if (!doc) { res.status(404).json({ message: 'Brand not found' }); return; }

    if (doc.models.some((m) => m.toLowerCase() === model.toLowerCase())) {
      res.status(409).json({ message: 'Model already exists for this brand' });
      return;
    }
    doc.models.push(model);
    await doc.save();
    res.status(201).json({ brands: await fullCatalog() });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
  }
});

// DELETE /api/bikes/brands/:brand/models/:model
router.delete('/brands/:brand/models/:model', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const doc = await BikeCatalog.findOne({ brand: req.params.brand });
    if (!doc) { res.status(404).json({ message: 'Brand not found' }); return; }

    const before = doc.models.length;
    doc.models = doc.models.filter((m) => m !== req.params.model);
    if (doc.models.length === before) { res.status(404).json({ message: 'Model not found' }); return; }

    await doc.save();
    res.json({ brands: await fullCatalog() });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
  }
});

export default router;
