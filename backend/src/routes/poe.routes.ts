// POE_ROUTES_V1
import { Router } from 'express';
import cloudinary from '../services/media.service';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// The student's phone calls this, then uploads straight to Cloudinary with the result.
// Limits (5 MB image, 50 MB or 60 s video) are checked again when the evidence is attached.
router.post('/upload-signature', requireAuth, requireRole('STUDENT'), (req, res) => {
  const kind = req.body?.kind === 'VIDEO' ? 'video' : 'image';
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `poe/${req.user!.userId}`;
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, process.env.CLOUDINARY_API_SECRET || '');
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature,
    resourceType: kind,
  });
});

export default router;
