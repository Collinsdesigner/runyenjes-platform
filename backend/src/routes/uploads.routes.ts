import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { uploadImage } from '../services/media.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ---------- Upload an image (logged-in members only) ----------
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image was uploaded' });
    }

    const url = await uploadImage(req.file, 'posts');

    res.status(201).json({ url });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

export default router;
