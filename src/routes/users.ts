import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import { protect } from '../middleware/auth';

const router = Router();

/* ── GET  /api/users/me ───────────────────────────────────── */
router.get('/me', protect, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id).select('-password').populate('wishlist');
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT  /api/users/me ───────────────────────────────────── */
router.put('/me', protect, async (req: Request, res: Response) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user!._id,
      { name, phone },
      { new: true, runValidators: true }
    ).select('-password');
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT  /api/users/me/password ─────────────────────────── */
router.put('/me/password', protect, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user!._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET  /api/users/me/addresses ────────────────────────── */
router.get('/me/addresses', protect, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id).select('addresses');
    res.json(user?.addresses ?? []);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/users/me/addresses ────────────────────────── */
router.post('/me/addresses', protect, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, street, city, state, zip, phone, isDefault } = req.body;

    if (isDefault) {
      // Demote all other defaults
      user.addresses.forEach(a => { a.isDefault = false; });
    }

    user.addresses.push({ name, street, city, state, zip, phone, isDefault: !!isDefault } as any);
    await user.save();
    res.status(201).json(user.addresses);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT  /api/users/me/addresses/:id ────────────────────── */
router.put('/me/addresses/:id', protect, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const address = (user.addresses as any).id(req.params.id) as typeof user.addresses[0] | null;
    if (!address) return res.status(404).json({ message: 'Address not found' });

    const { name, street, city, state, zip, phone, isDefault } = req.body;
    if (isDefault) user.addresses.forEach(a => { a.isDefault = false; });

    Object.assign(address, { name, street, city, state, zip, phone, isDefault: !!isDefault });
    await user.save();
    res.json(user.addresses);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── DELETE /api/users/me/addresses/:id ──────────────────── */
router.delete('/me/addresses/:id', protect, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.addresses = user.addresses.filter(
      a => a.id.toString() !== req.params.id
    ) as any;
    await user.save();
    res.json(user.addresses);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET  /api/users/me/wishlist ─────────────────────────── */
router.get('/me/wishlist', protect, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id).populate('wishlist').select('wishlist');
    res.json(user?.wishlist ?? []);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/users/me/wishlist/:productId  (toggle) ───── */
router.post('/me/wishlist/:productId', protect, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const productId = new mongoose.Types.ObjectId(req.params.productId);
    const index     = user.wishlist.findIndex(id => id.equals(productId));

    if (index >= 0) {
      user.wishlist.splice(index, 1);    // remove
    } else {
      user.wishlist.push(productId);     // add
    }

    await user.save();
    res.json({ wishlist: user.wishlist, added: index < 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
