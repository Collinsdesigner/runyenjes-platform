import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { deleteImage } from '../services/media.service';

const router = Router();

// ---------- Get my own profile ----------
router.get('/me', requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      role: true,
      admissionNumber: true,
      department: { select: { name: true } },
    },
  });
  res.json(me);
});

// ---------- Update my own profile picture ----------
// The frontend first uploads the image file via POST /uploads (which returns a URL),
// then calls this with that URL to attach it to the account.
router.patch('/avatar', requireAuth, async (req, res) => {
  try {
    const { avatarUrl, avatarPublicId } = req.body;

    if (!avatarUrl || !avatarPublicId) {
      return res.status(400).json({
        error: 'avatarUrl and avatarPublicId are required',
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        avatarPublicId: true,
      },
    });

    if (existingUser?.avatarPublicId) {
      try {
        await deleteImage(existingUser.avatarPublicId);
      } catch (error) {
        console.error('Failed to delete old avatar:', error);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        avatarUrl,
        avatarPublicId,
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        avatarPublicId: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Avatar update failed:', error);
    res.status(500).json({
      error: 'Failed to update avatar',
    });
  }
});
// ---------- Delete my profile picture ----------
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        avatarPublicId: true,
      },
    });

    if (user?.avatarPublicId) {
      try {
        await deleteImage(user.avatarPublicId);
      } catch (error) {
        console.error('Failed to delete avatar from Cloudinary:', error);
      }
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        avatarUrl: null,
        avatarPublicId: null,
      },
    });

    res.json({
      message: 'Profile picture removed successfully.',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to remove profile picture.',
    });
  }
});
export default router;
