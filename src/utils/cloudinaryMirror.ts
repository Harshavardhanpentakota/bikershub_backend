import cloudinary from '../config/cloudinary';

const OUR_CLOUD_MARKER = `res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;

/**
 * Any image URL an admin pastes (product image, homepage banner, etc.) gets
 * mirrored into our own Cloudinary account instead of being stored as-is —
 * keeps us from depending on some third-party host staying up/unchanged.
 * Already-ours and non-http values pass through untouched; a fetch failure
 * falls back to the original URL rather than blocking the save.
 */
export async function mirrorImageToCloudinary(url: unknown, folder: string): Promise<unknown> {
  if (typeof url !== 'string' || !url.trim()) return url;
  if (!/^https?:\/\//i.test(url)) return url; // already a data URI, relative path, etc.
  if (url.includes(OUR_CLOUD_MARKER)) return url; // already hosted on our Cloudinary

  try {
    const result = await cloudinary.uploader.upload(url, { folder });
    return result.secure_url;
  } catch (err) {
    console.error(`[cloudinaryMirror] failed to mirror ${url}:`, err instanceof Error ? err.message : err);
    return url;
  }
}

export async function mirrorImagesToCloudinary(urls: unknown, folder: string): Promise<unknown> {
  if (!Array.isArray(urls)) return urls;
  return Promise.all(urls.map((u) => mirrorImageToCloudinary(u, folder)));
}
