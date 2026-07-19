import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary';

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bikershub/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'fill' }],
  } as object,
});

export const uploadImages = multer({ storage }).array('images', 5);

const homeStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bikershub/home',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  } as object,
});

export const uploadHomeImage = multer({ storage: homeStorage }).single('image');
