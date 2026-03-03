# BikersHub API Documentation

Base URL: `http://localhost:5000/api`

All protected routes require the header:
```
Authorization: Bearer <token>
```

---

## Table of Contents
- [Auth](#auth)
- [Products](#products)
- [Cart](#cart)
- [Orders](#orders)
- [Users](#users)
- [Reviews](#reviews)
- [Payment](#payment)

---

## Auth

### POST `/auth/register`
Register a new user.

**Request Body**
```json
{
  "name": "Prasad",
  "email": "prasad@example.com",
  "password": "secret123"
}
```

**Response `201`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "name": "Prasad",
    "email": "prasad@example.com",
    "role": "customer"
  }
}
```

**Error `400`** — Email already registered
```json
{ "message": "Email already registered" }
```

---

### POST `/auth/login`
Login with email and password.

**Request Body**
```json
{
  "email": "prasad@example.com",
  "password": "secret123"
}
```

**Response `200`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "name": "Prasad",
    "email": "prasad@example.com",
    "role": "customer"
  }
}
```

**Error `401`**
```json
{ "message": "Invalid credentials" }
```

---

### POST `/auth/logout` 🔒
Logout (client should delete the token from storage).

**Response `200`**
```json
{ "message": "Logged out successfully" }
```

---

### POST `/auth/forgot-password`
Send a password reset link.

**Request Body**
```json
{ "email": "prasad@example.com" }
```

**Response `200`**
```json
{ "message": "Password reset link sent (check console in dev)" }
```

---

### POST `/auth/reset-password`
Reset password using the token received via email.

**Request Body**
```json
{
  "token": "reset_token_from_email",
  "password": "newpassword123"
}
```

**Response `200`**
```json
{ "message": "Password reset successful" }
```

---

## Products

### GET `/products`
List products with optional filters and pagination.

**Query Parameters**
| Param      | Type   | Description                              |
|------------|--------|------------------------------------------|
| `category` | string | Filter by category (e.g. `Helmets`)      |
| `search`   | string | Full-text search on name/description     |
| `brand`    | string | Filter by bike brand (e.g. `Royal Enfield`) |
| `model`    | string | Filter by bike model (e.g. `Bullet 350`) |
| `page`     | number | Page number (default: `1`)               |
| `limit`    | number | Items per page (default: `20`)           |

**Example**
```
GET /products?category=Helmets&page=1&limit=10
GET /products?search=full+face
GET /products?brand=Royal+Enfield&model=Bullet+350
```

**Response `200`**
```json
{
  "products": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Full-Face Helmet Pro",
      "price": 3499,
      "originalPrice": 4999,
      "discount": 30,
      "rating": 4.5,
      "reviewCount": 128,
      "image": "https://res.cloudinary.com/.../helmet.jpg",
      "images": ["https://res.cloudinary.com/.../helmet.jpg"],
      "category": "Helmets",
      "sizes": ["S", "M", "L", "XL"],
      "colors": [{ "name": "Matte Black", "hex": "#1a1a1a" }],
      "badge": "bestseller",
      "compatibleBikes": ["All"],
      "description": "Premium full-face helmet...",
      "specifications": { "Material": "ABS Shell", "Weight": "1.4 kg" },
      "inStock": true,
      "stockQuantity": 50,
      "createdAt": "2026-03-01T10:00:00.000Z",
      "updatedAt": "2026-03-01T10:00:00.000Z"
    }
  ],
  "total": 45,
  "page": 1,
  "pages": 3
}
```

---

### GET `/products/:id`
Get a single product by ID.

**Response `200`**
```json
{
  "_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "name": "Full-Face Helmet Pro",
  "price": 3499,
  "originalPrice": 4999,
  "discount": 30,
  "rating": 4.5,
  "reviewCount": 128,
  "image": "https://res.cloudinary.com/.../helmet.jpg",
  "images": ["https://res.cloudinary.com/.../helmet.jpg"],
  "category": "Helmets",
  "sizes": ["S", "M", "L", "XL"],
  "colors": [{ "name": "Matte Black", "hex": "#1a1a1a" }],
  "badge": "bestseller",
  "compatibleBikes": ["All"],
  "description": "Premium full-face helmet...",
  "specifications": { "Material": "ABS Shell", "Weight": "1.4 kg" },
  "inStock": true,
  "stockQuantity": 50
}
```

**Error `404`**
```json
{ "message": "Product not found" }
```

---

### POST `/products` 🔒 Admin
Create a new product. Send as `multipart/form-data`.

**Form Fields**
| Field             | Type     | Required |
|-------------------|----------|----------|
| `name`            | string   | ✅        |
| `price`           | number   | ✅        |
| `category`        | string   | ✅        |
| `image` (field)   | string   | ✅ (or upload) |
| `images`          | file[]   | optional (up to 5) |
| `originalPrice`   | number   | optional |
| `discount`        | number   | optional |
| `description`     | string   | optional |
| `sizes`           | string[] | optional |
| `badge`           | string   | `new` \| `bestseller` \| `discount` |
| `compatibleBikes` | string[] | optional |
| `inStock`         | boolean  | optional |
| `stockQuantity`   | number   | optional |

**Response `201`** — returns the created product object.

---

### PUT `/products/:id` 🔒 Admin
Update a product. Same `multipart/form-data` fields as POST (all optional).

**Response `200`** — returns the updated product object.

---

### DELETE `/products/:id` 🔒 Admin

**Response `200`**
```json
{ "message": "Product deleted" }
```

---

## Cart

### GET `/cart` 🔒
Get the current user's cart.

**Response `200`**
```json
{
  "_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "user": "665f1a2b3c4d5e6f7a8b9c01",
  "items": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c10",
      "product": {
        "_id": "665f1a2b3c4d5e6f7a8b9c0d",
        "name": "Full-Face Helmet Pro",
        "image": "https://res.cloudinary.com/.../helmet.jpg",
        "price": 3499
      },
      "name": "Full-Face Helmet Pro",
      "image": "https://res.cloudinary.com/.../helmet.jpg",
      "price": 3499,
      "quantity": 2,
      "selectedSize": "L",
      "selectedColor": "Matte Black"
    }
  ]
}
```

---

### POST `/cart/add` 🔒
Add an item to the cart (increments quantity if the same product+size+color already exists).

**Request Body**
```json
{
  "productId": "665f1a2b3c4d5e6f7a8b9c0d",
  "quantity": 1,
  "selectedSize": "L",
  "selectedColor": "Matte Black"
}
```

**Response `200`** — returns updated cart object.

---

### PUT `/cart/update` 🔒
Update the quantity of a cart item. Set `quantity` to `0` to remove.

**Request Body**
```json
{
  "productId": "665f1a2b3c4d5e6f7a8b9c0d",
  "quantity": 3
}
```

**Response `200`** — returns updated cart object.

---

### DELETE `/cart/remove/:productId` 🔒
Remove a specific item from the cart.

**Response `200`** — returns updated cart object.

---

### DELETE `/cart/clear` 🔒
Clear all items from the cart.

**Response `200`**
```json
{ "message": "Cart cleared" }
```

---

## Orders

### POST `/orders` 🔒
Place a new order.

**Request Body**
```json
{
  "items": [
    {
      "product": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Full-Face Helmet Pro",
      "image": "https://res.cloudinary.com/.../helmet.jpg",
      "price": 3499,
      "quantity": 1,
      "selectedSize": "L",
      "selectedColor": "Matte Black"
    }
  ],
  "shippingAddress": {
    "name": "Prasad",
    "street": "123 Main St",
    "city": "Hyderabad",
    "state": "Telangana",
    "zip": "500001",
    "phone": "9876543210"
  },
  "shippingMethod": "standard",
  "paymentMethod": "razorpay"
}
```

> `shippingMethod`: `"standard"` (free) | `"express"` (₹149)  
> `paymentMethod`: `"cod"` | `"razorpay"` | `"upi"`

**Response `201`**
```json
{
  "_id": "665f1a2b3c4d5e6f7a8b9c20",
  "user": "665f1a2b3c4d5e6f7a8b9c01",
  "items": [...],
  "shippingAddress": { "name": "Prasad", "street": "123 Main St", ... },
  "shippingMethod": "standard",
  "paymentMethod": "razorpay",
  "paymentStatus": "pending",
  "subtotal": 3499,
  "shippingCost": 0,
  "total": 3499,
  "status": "processing",
  "createdAt": "2026-03-03T10:00:00.000Z"
}
```

---

### GET `/orders/my` 🔒
Get the logged-in user's order history (newest first).

**Response `200`**
```json
[
  {
    "_id": "665f1a2b3c4d5e6f7a8b9c20",
    "items": [...],
    "total": 3499,
    "status": "processing",
    "paymentStatus": "pending",
    "createdAt": "2026-03-03T10:00:00.000Z"
  }
]
```

---

### GET `/orders/:id` 🔒
Get a single order by ID (owner or admin only).

**Response `200`** — full order object (same shape as POST response).

**Error `403`**
```json
{ "message": "Forbidden" }
```

---

### PUT `/orders/:id/cancel` 🔒
Cancel an order (only if status is `processing`).

**Response `200`** — updated order with `"status": "cancelled"`.

**Error `400`**
```json
{ "message": "Cannot cancel a shipped order" }
```

---

### GET `/orders` 🔒 Admin
List all orders with optional filters.

**Query Parameters**
| Param    | Type   | Description                                         |
|----------|--------|-----------------------------------------------------|
| `status` | string | `processing` \| `shipped` \| `delivered` \| `cancelled` |
| `page`   | number | default `1`                                         |
| `limit`  | number | default `20`                                        |

**Response `200`**
```json
{
  "orders": [...],
  "total": 120,
  "page": 1,
  "pages": 6
}
```

---

### PUT `/orders/:id/status` 🔒 Admin
Update order status.

**Request Body**
```json
{
  "status": "shipped",
  "trackingId": "TRK123456789"
}
```

**Response `200`** — updated order object.

---

## Users

### GET `/users/me` 🔒
Get the current user's profile (includes populated wishlist).

**Response `200`**
```json
{
  "_id": "665f1a2b3c4d5e6f7a8b9c01",
  "name": "Prasad",
  "email": "prasad@example.com",
  "phone": "9876543210",
  "role": "customer",
  "addresses": [...],
  "wishlist": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Full-Face Helmet Pro",
      "price": 3499,
      "image": "https://res.cloudinary.com/.../helmet.jpg"
    }
  ],
  "createdAt": "2026-03-01T10:00:00.000Z"
}
```

---

### PUT `/users/me` 🔒
Update profile name or phone.

**Request Body**
```json
{
  "name": "Prasad Kumar",
  "phone": "9876543210"
}
```

**Response `200`** — updated user object (no password).

---

### PUT `/users/me/password` 🔒
Change password.

**Request Body**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

**Response `200`**
```json
{ "message": "Password updated" }
```

**Error `401`**
```json
{ "message": "Current password is incorrect" }
```

---

### GET `/users/me/addresses` 🔒
Get all saved addresses.

**Response `200`**
```json
[
  {
    "_id": "665f1a2b3c4d5e6f7a8b9c30",
    "name": "Prasad",
    "street": "123 Main St",
    "city": "Hyderabad",
    "state": "Telangana",
    "zip": "500001",
    "phone": "9876543210",
    "isDefault": true
  }
]
```

---

### POST `/users/me/addresses` 🔒
Add a new address.

**Request Body**
```json
{
  "name": "Prasad",
  "street": "123 Main St",
  "city": "Hyderabad",
  "state": "Telangana",
  "zip": "500001",
  "phone": "9876543210",
  "isDefault": true
}
```

**Response `201`** — array of all addresses.

---

### PUT `/users/me/addresses/:id` 🔒
Update an existing address.

**Request Body** — same fields as POST (all optional).

**Response `200`** — array of all addresses.

---

### DELETE `/users/me/addresses/:id` 🔒
Delete an address.

**Response `200`** — array of remaining addresses.

---

### GET `/users/me/wishlist` 🔒
Get wishlist (populated product objects).

**Response `200`**
```json
[
  {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "name": "Full-Face Helmet Pro",
    "price": 3499,
    "image": "https://res.cloudinary.com/.../helmet.jpg",
    "category": "Helmets",
    "rating": 4.5
  }
]
```

---

### POST `/users/me/wishlist/:productId` 🔒
Toggle a product in/out of the wishlist.

**Response `200`**
```json
{
  "wishlist": ["665f1a2b3c4d5e6f7a8b9c0d"],
  "added": true
}
```

> `added: true` means the product was added; `false` means it was removed.

---

## Reviews

### GET `/reviews/product/:productId`
Get all reviews for a product (public, newest first).

**Response `200`**
```json
[
  {
    "_id": "665f1a2b3c4d5e6f7a8b9c40",
    "product": "665f1a2b3c4d5e6f7a8b9c0d",
    "user": { "_id": "665f1a2b3c4d5e6f7a8b9c01", "name": "Prasad" },
    "userName": "Prasad",
    "rating": 5,
    "comment": "Excellent helmet, great fit!",
    "verified": false,
    "createdAt": "2026-03-02T08:00:00.000Z"
  }
]
```

---

### POST `/reviews/product/:productId` 🔒
Add a review for a product (one review per user per product).

**Request Body**
```json
{
  "rating": 5,
  "comment": "Excellent helmet, great fit!"
}
```

**Response `201`** — the created review object.

**Error `400`**
```json
{ "message": "You have already reviewed this product" }
```

> After posting a review, the product's `rating` and `reviewCount` are automatically updated.

---

### DELETE `/reviews/:id` 🔒
Delete a review (owner or admin only).

**Response `200`**
```json
{ "message": "Review deleted" }
```

---

## Payment

### POST `/payment/create-order` 🔒
Create a Razorpay order before opening the payment modal.

**Request Body**
```json
{
  "amount": 3499,
  "orderId": "665f1a2b3c4d5e6f7a8b9c20"
}
```

> `amount` is in **INR (rupees)** — the backend converts to paise automatically.

**Response `200`**
```json
{
  "razorpayOrderId": "order_PmXXXXXXXXXXXX",
  "amount": 349900
}
```

---

### POST `/payment/verify` 🔒
Verify the Razorpay payment signature and mark the order as paid.

**Request Body**
```json
{
  "razorpayOrderId": "order_PmXXXXXXXXXXXX",
  "razorpayPaymentId": "pay_PmXXXXXXXXXXXX",
  "razorpaySignature": "abc123hmac...",
  "orderId": "665f1a2b3c4d5e6f7a8b9c20"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Payment verified successfully"
}
```

**Error `400`**
```json
{ "message": "Payment verification failed" }
```

---

## Error Responses

All endpoints return errors in this shape:

```json
{ "message": "Human-readable error description" }
```

| Status | Meaning                          |
|--------|----------------------------------|
| `400`  | Bad request / validation error   |
| `401`  | Not authenticated / invalid token |
| `403`  | Forbidden (not admin / not owner) |
| `404`  | Resource not found               |
| `500`  | Internal server error            |

---

## Frontend Integration Checklist

- [ ] Store JWT token in `localStorage` after login/register
- [ ] Attach `Authorization: Bearer <token>` header to all 🔒 requests
- [ ] After placing an order with `paymentMethod: "razorpay"`, call `POST /payment/create-order` → open Razorpay modal → call `POST /payment/verify`
- [ ] Clear cart after successful order placement
- [ ] On logout, delete the token from `localStorage` and redirect to login
