import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Order from '../models/Order';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

/* ════════════════════════════════════════════════════════════
   ADMIN — User Management
   All routes below require authentication + admin role
   ════════════════════════════════════════════════════════════ */

/* ── GET /api/users  [ADMIN] ─────────────────────────────── */
router.get('/', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const { role, search, page = '1', limit = '20' } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};
    if (role)   query.role = role;
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      User.find(query).select('-password').skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);

    res.json({ items, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/users/:id  [ADMIN] ─────────────────────────── */
router.get('/:id', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const orders = await Order.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ ...user.toObject(), orders });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT /api/users/:id  [ADMIN] ─────────────────────────── */
router.put('/:id', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, email, role, isActive } = req.body;
    const updates: Record<string, unknown> = {};
    if (name     !== undefined) updates.name     = name;
    if (email    !== undefined) updates.email    = email;
    if (role     !== undefined) updates.role     = role;
    if (isActive !== undefined) updates.isActive = isActive;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .select('-password');
    if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
    res.json(user);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ message: 'Email already in use' });
    res.status(500).json({ message: err.message });
  }
});

/* ── DELETE /api/users/:id  [ADMIN] ─────────────────────── */
router.delete('/:id', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
    res.json({ message: 'User deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT /api/users/:id/ban  [ADMIN] ─────────────────────── */
router.put('/:id/ban', protect, adminOnly, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const { reason } = req.body;
    if (user.isActive) {
      // Ban
      user.isActive     = false;
      user.bannedReason = reason ?? 'Banned by admin';
    } else {
      // Unban
      user.isActive     = true;
      user.bannedReason = undefined;
    }
    await user.save();
    res.json({ message: user.isActive ? 'User unbanned' : 'User banned', isActive: user.isActive });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   AUTHENTICATED USER — Self-service routes
   ════════════════════════════════════════════════════════════ */
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
