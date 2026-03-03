import { Router, Request, Response } from 'express';
import Cart from '../models/Cart';
import Product from '../models/Product';
import { protect } from '../middleware/auth';

const router = Router();

/* ── GET /api/cart ────────────────────────────────────────── */
router.get('/', protect, async (req: Request, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user!._id }).populate('items.product');
    res.json(cart ?? { user: req.user!._id, items: [] });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/cart/add ───────────────────────────────────── */
router.post('/add', protect, async (req: Request, res: Response) => {
  try {
    const { productId, quantity = 1, selectedSize, selectedColor } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    let cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) cart = new Cart({ user: req.user!._id, items: [] });

    const existingIndex = cart.items.findIndex(
      i => i.product.toString() === productId &&
           i.selectedSize === selectedSize &&
           i.selectedColor === selectedColor
    );

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({
        product:       product._id as any,
        name:          product.name,
        image:         product.image,
        price:         product.price,
        quantity,
        selectedSize:  selectedSize ?? '',
        selectedColor: selectedColor ?? '',
      });
    }

    await cart.save();
    res.json(cart);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── PUT /api/cart/update ─────────────────────────────────── */
router.put('/update', protect, async (req: Request, res: Response) => {
  try {
    const { productId, quantity } = req.body;

    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.find(i => i.product.toString() === productId);
    if (!item) return res.status(404).json({ message: 'Item not in cart' });

    if (quantity <= 0) {
      cart.items = cart.items.filter(i => i.product.toString() !== productId) as any;
    } else {
      item.quantity = quantity;
    }

    await cart.save();
    res.json(cart);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── DELETE /api/cart/remove/:productId ──────────────────── */
router.delete('/remove/:productId', protect, async (req: Request, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = cart.items.filter(
      i => i.product.toString() !== req.params.productId
    ) as any;
    await cart.save();
    res.json(cart);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── DELETE /api/cart/clear ───────────────────────────────── */
router.delete('/clear', protect, async (req: Request, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user!._id });
    if (cart) { cart.items = [] as any; await cart.save(); }
    res.json({ message: 'Cart cleared' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
