import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { protect, adminOnly } from '../middleware/auth';
import { uploadHomeImage } from '../middleware/upload';
import { mirrorImageToCloudinary } from '../utils/cloudinaryMirror';
import HomeCategory from '../models/HomeCategory';
import FeaturedCollection from '../models/FeaturedCollection';
import TrendingCard from '../models/TrendingCard';
import LimitedTimeOffer from '../models/LimitedTimeOffer';
import HeroSlide from '../models/HeroSlide';

const router = Router();

/** Turns a raw Mongoose ValidationError into a short human-readable message
 *  instead of leaking field-path/enum internals straight to the client. */
function friendlyMessage(err: unknown): string {
  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.values(err.errors).map((e) => e.path);
    return `Please fill in: ${fields.join(', ')}`;
  }
  return err instanceof Error ? err.message : 'Server error';
}

/**
 * All four homepage content types (categories, featured collections,
 * trending cards, limited-time offers) share the same shape: an ordered
 * list of small content records, publicly readable, admin-editable.
 * This factory wires one Express sub-router per model instead of
 * repeating the same 4 routes x 4 models by hand.
 */
function buildCrudRouter(Model: mongoose.Model<any>, allowedFields: string[]) {
  const sub = Router();

  sub.get('/', async (_req: Request, res: Response) => {
    try {
      const items = await Model.find().sort({ order: 1 }).lean();
      res.json({ items });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
    }
  });

  sub.post('/', protect, adminOnly, async (req: Request, res: Response) => {
    try {
      const data: Record<string, unknown> = {};
      for (const f of allowedFields) if (req.body[f] !== undefined) data[f] = req.body[f];
      if (allowedFields.includes('image') && data.image !== undefined) {
        data.image = await mirrorImageToCloudinary(data.image, 'bikershub/home');
      }

      const maxOrder = await Model.findOne().sort({ order: -1 }).select('order').lean();
      data.order = ((maxOrder as any)?.order ?? -1) + 1;

      const created = await Model.create(data);
      res.status(201).json({ item: created });
    } catch (err: unknown) {
      const status = err instanceof mongoose.Error.ValidationError ? 400 : 500;
      res.status(status).json({ message: friendlyMessage(err) });
    }
  });

  sub.put('/:id', protect, adminOnly, async (req: Request, res: Response) => {
    try {
      const data: Record<string, unknown> = {};
      for (const f of allowedFields) if (req.body[f] !== undefined) data[f] = req.body[f];
      if (allowedFields.includes('image') && data.image !== undefined) {
        data.image = await mirrorImageToCloudinary(data.image, 'bikershub/home');
      }

      const updated = await Model.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
      if (!updated) { res.status(404).json({ message: 'Not found' }); return; }
      res.json({ item: updated });
    } catch (err: unknown) {
      const status = err instanceof mongoose.Error.ValidationError ? 400 : 500;
      res.status(status).json({ message: friendlyMessage(err) });
    }
  });

  sub.delete('/:id', protect, adminOnly, async (req: Request, res: Response) => {
    try {
      const deleted = await Model.findByIdAndDelete(req.params.id);
      if (!deleted) { res.status(404).json({ message: 'Not found' }); return; }
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
    }
  });

  // Swap this item's `order` with its immediate neighbor to move it up/down one slot.
  sub.put('/:id/move', protect, adminOnly, async (req: Request, res: Response) => {
    try {
      const direction = req.body.direction === 'up' ? 'up' : 'down';
      const current = await Model.findById(req.params.id);
      if (!current) { res.status(404).json({ message: 'Not found' }); return; }

      const neighbor = await Model.findOne({
        order: direction === 'up' ? { $lt: current.order } : { $gt: current.order },
      }).sort({ order: direction === 'up' ? -1 : 1 });

      if (!neighbor) { res.json({ items: await Model.find().sort({ order: 1 }).lean() }); return; }

      const tmp = current.order;
      current.order = neighbor.order;
      neighbor.order = tmp;
      await current.save();
      await neighbor.save();

      res.json({ items: await Model.find().sort({ order: 1 }).lean() });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
    }
  });

  return sub;
}

router.use('/categories', buildCrudRouter(HomeCategory, ['name', 'categoryValue', 'icon', 'image']));
router.use('/collections', buildCrudRouter(FeaturedCollection, ['title', 'description', 'cta', 'path', 'image', 'badge']));
router.use('/trending', buildCrudRouter(TrendingCard, ['title', 'subtitle', 'path', 'image', 'span']));
router.use('/limited-time', buildCrudRouter(LimitedTimeOffer, ['title', 'subtitle', 'cta', 'path', 'image', 'badge', 'endsAt']));
router.use('/hero', buildCrudRouter(HeroSlide, ['image', 'badge', 'title', 'description', 'cta1Label', 'cta1Path', 'cta2Label', 'cta2Path', 'align']));

// POST /api/home/upload-image  (multipart, field name "image") — returns { url }
router.post('/upload-image', protect, adminOnly, uploadHomeImage, (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File & { path?: string };
  if (!file) { res.status(400).json({ message: 'No image uploaded' }); return; }
  res.status(201).json({ url: file.path });
});

export default router;
