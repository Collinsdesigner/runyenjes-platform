import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';

// Extend Express's Request type so req.user is recognized everywhere
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

// Use on routes that MUST have a logged-in member (class groups, admin actions, etc.)
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session, please log in again' });
  }
}

// Use on routes anyone can access, but that behave differently if logged in
// (e.g. the public Home feed: viewing/commenting works for everyone,
// but we still want to know who posted if they happen to be logged in)
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // invalid token on an optional route just means "treat as a guest"
    }
  }
  next();
}

// Use to restrict a route to specific roles, e.g. requireRole('ADMIN')
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}
