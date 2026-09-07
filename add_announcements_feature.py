#!/usr/bin/env python3
"""
Adds the Announcements feature end-to-end:
  1. schema.prisma      -> Announcement model + User back-relation
  2. index.ts            -> import + mount the new route
  3. announcements.routes.ts -> new backend route file
  4. App.tsx             -> import + two routes (registrar + admin)
  5. Announcements.tsx   -> new frontend page

Run from anywhere; paths are absolute (~ expanded).
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

SCHEMA_PATH = os.path.join(ROOT, "backend", "prisma", "schema.prisma")
INDEX_TS_PATH = os.path.join(BACKEND, "index.ts")
ROUTES_DIR = os.path.join(BACKEND, "routes")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "announcements")


def replace_once(path, old, new, label):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    count = content.count(old)
    if count == 0:
        raise SystemExit(f"[FAIL] Anchor not found for '{label}' in {path}\n"
                          f"       Looked for:\n{old!r}")
    if count > 1:
        raise SystemExit(f"[FAIL] Anchor for '{label}' appears {count} times in {path} "
                          f"(expected exactly once) -- refusing to guess which one.")

    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] {label} -> {path}")


# ------------------------------------------------------------------
# 1. schema.prisma -- add Announcement model + User back-relation
# ------------------------------------------------------------------
schema_relation_anchor = '  jobPostings JobPosting[] @relation("JobPostingPostedBy")\n'
schema_relation_new = (
    '  jobPostings JobPosting[] @relation("JobPostingPostedBy")\n'
    '  announcementsPosted Announcement[] @relation("AnnouncementPostedBy")\n'
)
replace_once(SCHEMA_PATH, schema_relation_anchor, schema_relation_new,
             "User back-relation for Announcement")

schema_model_anchor = (
    "// ─────────────────────────────────────────────\n"
    "// ASSIGNMENTS\n"
    "// ─────────────────────────────────────────────\n"
)
schema_model_new = (
    "// ─────────────────────────────────────────────\n"
    "// ANNOUNCEMENTS\n"
    "// ─────────────────────────────────────────────\n"
    "// Posted by Registrar/Admin, visible platform-wide. Lean v1: no\n"
    "// audience targeting yet -- every logged-in user sees every announcement.\n\n"
    "model Announcement {\n"
    "  id          String   @id @default(uuid())\n"
    "  title       String\n"
    "  body        String\n"
    "  postedById  String\n"
    '  postedBy    User     @relation("AnnouncementPostedBy", fields: [postedById], references: [id])\n\n'
    "  createdAt   DateTime @default(now())\n"
    "  updatedAt   DateTime @updatedAt\n\n"
    "  @@index([postedById])\n"
    "}\n\n"
    "// ─────────────────────────────────────────────\n"
    "// ASSIGNMENTS\n"
    "// ─────────────────────────────────────────────\n"
)
replace_once(SCHEMA_PATH, schema_model_anchor, schema_model_new,
             "Announcement model insertion")

# ------------------------------------------------------------------
# 2. backend/src/index.ts -- import + mount
# ------------------------------------------------------------------
index_import_anchor = "import jobRoutes from './routes/job.routes';\n"
index_import_new = (
    "import jobRoutes from './routes/job.routes';\n"
    "import announcementsRoutes from './routes/announcements.routes';\n"
)
replace_once(INDEX_TS_PATH, index_import_anchor, index_import_new,
             "index.ts import")

index_mount_anchor = "app.use('/jobs', jobRoutes);\n"
index_mount_new = (
    "app.use('/jobs', jobRoutes);\n"
    "app.use('/announcements', announcementsRoutes);\n"
)
replace_once(INDEX_TS_PATH, index_mount_anchor, index_mount_new,
             "index.ts app.use")

# ------------------------------------------------------------------
# 3. backend/src/routes/announcements.routes.ts -- new file
# ------------------------------------------------------------------
os.makedirs(ROUTES_DIR, exist_ok=True)
announcements_route_path = os.path.join(ROUTES_DIR, "announcements.routes.ts")

if os.path.exists(announcements_route_path):
    print(f"[SKIP] {announcements_route_path} already exists -- not overwriting")
else:
    announcements_route_content = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Only Registrar/Admin can post announcements.
const CAN_POST = ['REGISTRAR', 'ADMIN'];

// ---------- Any authenticated user: read every announcement ----------
router.get('/', requireAuth, async (req, res) => {
  const announcements = await prisma.announcement.findMany({
    include: { postedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(announcements);
});

// ---------- Registrar/Admin: post an announcement ----------
router.post('/', requireAuth, async (req, res) => {
  if (!CAN_POST.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Registrar or Admin can post announcements' });
  }

  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      postedById: req.user!.userId,
    },
  });

  res.status(201).json(announcement);
});

// ---------- Poster or Admin: delete an announcement ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

  const isOwner = announcement.postedById === req.user!.userId;
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'You can only manage your own announcements' });
  }

  await prisma.announcement.delete({ where: { id } });
  res.status(204).send();
});

export default router;
"""
    with open(announcements_route_path, "w", encoding="utf-8") as f:
        f.write(announcements_route_content)
    print(f"[OK] Created {announcements_route_path}")

# ------------------------------------------------------------------
# 4. frontend/src/App.tsx -- import + two routes
# ------------------------------------------------------------------
app_import_anchor = "import JobBoard from './pages/jobs/JobBoard';\n"
app_import_new = (
    "import JobBoard from './pages/jobs/JobBoard';\n"
    "import Announcements from './pages/announcements/Announcements';\n"
)
replace_once(APP_TSX_PATH, app_import_anchor, app_import_new,
             "App.tsx import")

app_route_anchor = '                <Route path="/jobs" element={<JobBoard />} />\n'
app_route_new = (
    '                <Route path="/jobs" element={<JobBoard />} />\n'
    '                <Route path="/registrar/announcements" element={<Announcements />} />\n'
    '                <Route path="/admin/communication" element={<Announcements />} />\n'
)
replace_once(APP_TSX_PATH, app_route_anchor, app_route_new,
             "App.tsx routes")

# ------------------------------------------------------------------
# 5. frontend/src/pages/announcements/Announcements.tsx -- new file
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)
announcements_page_path = os.path.join(PAGES_DIR, "Announcements.tsx")

if os.path.exists(announcements_page_path):
    print(f"[SKIP] {announcements_page_path} already exists -- not overwriting")
else:
    announcements_page_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  postedById?: string;
  postedBy?: { id: string; name: string; role: string };
}

const CAN_POST_ROLES = ['REGISTRAR', 'ADMIN'];

export default function Announcements() {
  const { token, user } = useAuth();
  const canPost = user ? CAN_POST_ROLES.includes(user.role) : false;
  const isAdmin = user?.role === 'ADMIN';

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/announcements', { token });
      setAnnouncements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load announcements');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }
    try {
      await api('/announcements', {
        method: 'POST',
        token,
        body: { title: title.trim(), body: body.trim() },
      });
      setMessage('Announcement posted');
      setTitle('');
      setBody('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post announcement');
    }
  }

  async function handleDelete(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/announcements/${id}`, { method: 'DELETE', token });
      setMessage('Announcement deleted');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete announcement');
    }
  }

  return (
    <PortalLayout title="Announcements">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Announcements</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canPost
              ? 'Post an announcement for everyone on the platform to see.'
              : 'Announcements from the Registrar and Administration.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        {canPost && (
          <form onSubmit={handlePost} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Post an Announcement</h3>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Announcement body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
              Post Announcement
            </button>
          </form>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        <div className="space-y-3">
          {!loading && announcements.length === 0 && (
            <p className="text-sm text-gray-400">No announcements yet.</p>
          )}
          {announcements.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <h4 className="font-semibold text-gray-900">{a.title}</h4>
                <span className="text-xs text-gray-400">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{a.body}</p>
              {a.postedBy && (
                <p className="text-xs text-gray-400 mt-2">
                  Posted by {a.postedBy.name} ({a.postedBy.role})
                </p>
              )}
              {(isAdmin || a.postedById === user?.id) && (
                <button
                  className="text-red-600 text-xs font-medium mt-2"
                  onClick={() => handleDelete(a.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
"""
    with open(announcements_page_path, "w", encoding="utf-8") as f:
        f.write(announcements_page_content)
    print(f"[OK] Created {announcements_page_path}")

print("\nDone. Next: cd into backend, run `npx prisma migrate dev --name add_announcements`,")
print("then `npx tsc --noEmit` in both backend/ and frontend/.")
