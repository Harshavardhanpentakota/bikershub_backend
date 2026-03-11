import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import { Parser } from "json2csv";
import Product from "./models/Product";

dotenv.config();

async function exportProducts() {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("MongoDB Connected");

    const products = await Product.find().lean();

    const formattedProducts = products.map((p: any) => ({
      name: p.name,
      price: p.price,
      originalPrice: p.originalPrice ?? "",
      discount: p.discount ?? "",
      rating: p.rating,
      reviewCount: p.reviewCount,
      image: p.image,
      images: p.images?.join("|") ?? "",
      category: p.category,
      sizes: p.sizes?.join("|") ?? "",
      colors: p.colors?.map((c: any) => `${c.name}:${c.hex}`).join("|") ?? "",
      badge: p.badge ?? "",
      compatibleBikes: p.compatibleBikes?.join("|") ?? "",
      description: p.description ?? "",
      specifications: JSON.stringify(p.specifications || {}),
      inStock: p.inStock,
      stockQuantity: p.stockQuantity,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    const parser = new Parser();
    const csv = parser.parse(formattedProducts);

    fs.writeFileSync("products.csv", csv);

    console.log("✅ products.csv generated");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Export failed:", error);
  }
}

exportProducts();