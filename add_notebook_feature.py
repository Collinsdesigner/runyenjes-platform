#!/usr/bin/env python3
"""
Adds the Notebook feature end-to-end:
  1. schema.prisma   -> Note model + User back-relation
  2. index.ts         -> import + mount the new route
  3. notes.routes.ts  -> new backend route file (own-notes-only, no sharing)
  4. App.tsx          -> import + route (/notebook)
  5. Notebook.tsx      -> new frontend page

Nav link already exists in PortalLayout.tsx's commonSections -- no change
needed there.
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
PAGES_DIR = os.path.join(FRONTEND, "pages", "notebook")


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
# 1. schema.prisma -- add Note model + User back-relation
# ------------------------------------------------------------------
schema_relation_anchor = '  announcementsPosted Announcement[] @relation("AnnouncementPostedBy")\n'
schema_relation_new = (
    '  announcementsPosted Announcement[] @relation("AnnouncementPostedBy")\n'
    '  notes Note[]\n'
)
replace_once(SCHEMA_PATH, schema_relation_anchor, schema_relation_new,
             "User back-relation for Note")

schema_model_anchor = (
    "// ─────────────────────────────────────────────\n"
    "// ASSIGNMENTS\n"
    "// ─────────────────────────────────────────────\n"
)
schema_model_new = (
    "// ─────────────────────────────────────────────\n"
    "// NOTEBOOK\n"
    "// ─────────────────────────────────────────────\n"
    "// Personal notes, private to the owning user. No sharing in v1 --\n"
    "// each user only ever sees their own notes.\n\n"
    "model Note {\n"
    "  id        String   @id @default(uuid())\n"
    "  userId    String\n"
    "  user      User     @relation(fields: [userId], references: [id])\n"
    "  title     String   @default(\"Untitled note\")\n"
    "  content   String\n\n"
    "  createdAt DateTime @default(now())\n"
    "  updatedAt DateTime @updatedAt\n\n"
    "  @@index([userId])\n"
    "}\n\n"
    "// ─────────────────────────────────────────────\n"
    "// ASSIGNMENTS\n"
    "// ─────────────────────────────────────────────\n"
)
replace_once(SCHEMA_PATH, schema_model_anchor, schema_model_new,
             "Note model insertion")

# ------------------------------------------------------------------
# 2. backend/src/index.ts -- import + mount
# ------------------------------------------------------------------
index_import_anchor = "import announcementsRoutes from './routes/announcements.routes';\n"
index_import_new = (
    "import announcementsRoutes from './routes/announcements.routes';\n"
    "import notesRoutes from './routes/notes.routes';\n"
)
replace_once(INDEX_TS_PATH, index_import_anchor, index_import_new,
             "index.ts import")

index_mount_anchor = "app.use('/announcements', announcementsRoutes);\n"
index_mount_new = (
    "app.use('/announcements', announcementsRoutes);\n"
    "app.use('/notes', notesRoutes);\n"
)
replace_once(INDEX_TS_PATH, index_mount_anchor, index_mount_new,
             "index.ts app.use")

# ------------------------------------------------------------------
# 3. backend/src/routes/notes.routes.ts -- new file
# ------------------------------------------------------------------
os.makedirs(ROUTES_DIR, exist_ok=True)
notes_route_path = os.path.join(ROUTES_DIR, "notes.routes.ts")

if os.path.exists(notes_route_path):
    print(f"[SKIP] {notes_route_path} already exists -- not overwriting")
else:
    notes_route_content = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Every route here is scoped to the requesting user's own notes only --
// there is no sharing/visibility concept in v1.

// ---------- List own notes ----------
router.get('/', requireAuth, async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: 'desc' },
  });

  res.json(notes);
});

// ---------- Create a note ----------
router.post('/', requireAuth, async (req, res) => {
  const { title, content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const note = await prisma.note.create({
    data: {
      userId: req.user!.userId,
      title: title || 'Untitled note',
      content,
    },
  });

  res.status(201).json(note);
});

// ---------- Update own note ----------
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'You can only edit your own notes' });
  }

  const updated = await prisma.note.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
  });

  res.json(updated);
});

// ---------- Delete own note ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'You can only delete your own notes' });
  }

  await prisma.note.delete({ where: { id } });
  res.status(204).send();
});

export default router;
"""
    with open(notes_route_path, "w", encoding="utf-8") as f:
        f.write(notes_route_content)
    print(f"[OK] Created {notes_route_path}")

# ------------------------------------------------------------------
# 4. frontend/src/App.tsx -- import + route
# ------------------------------------------------------------------
app_import_anchor = "import Announcements from './pages/announcements/Announcements';\n"
app_import_new = (
    "import Announcements from './pages/announcements/Announcements';\n"
    "import Notebook from './pages/notebook/Notebook';\n"
)
replace_once(APP_TSX_PATH, app_import_anchor, app_import_new,
             "App.tsx import")

app_route_anchor = '                <Route path="/announcements" element={<Announcements />} />\n'
app_route_new = (
    '                <Route path="/announcements" element={<Announcements />} />\n'
    '                <Route path="/notebook" element={<Notebook />} />\n'
)
replace_once(APP_TSX_PATH, app_route_anchor, app_route_new,
             "App.tsx route")

# ------------------------------------------------------------------
# 5. frontend/src/pages/notebook/Notebook.tsx -- new file
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)
notebook_page_path = os.path.join(PAGES_DIR, "Notebook.tsx")

if os.path.exists(notebook_page_path):
    print(f"[SKIP] {notebook_page_path} already exists -- not overwriting")
else:
    notebook_page_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export default function Notebook() {
  const { token } = useAuth();

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/notes', { token });
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function startNewNote() {
    setSelectedId(null);
    setTitle('');
    setContent('');
  }

  function selectNote(note: NoteItem) {
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
  }

  async function handleSave() {
    if (!content.trim()) {
      setError('Note content cannot be empty');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (selectedId) {
        await api(`/notes/${selectedId}`, {
          method: 'PATCH',
          token,
          body: { title: title.trim() || 'Untitled note', content: content.trim() },
        });
      } else {
        const created = await api('/notes', {
          method: 'POST',
          token,
          body: { title: title.trim() || 'Untitled note', content: content.trim() },
        });
        setSelectedId(created.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    try {
      await api(`/notes/${id}`, { method: 'DELETE', token });
      if (selectedId === id) startNewNote();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete note');
    }
  }

  return (
    <PortalLayout title="Notebook">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Notebook</h2>
            <p className="text-sm text-gray-500 mt-1">Personal notes, visible only to you.</p>
          </div>
          <button
            type="button"
            onClick={startNewNote}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            + New Note
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="bg-white border border-gray-200 rounded-lg lg:col-span-1">
            <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Your Notes</div>
            <div className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto">
              {loading && <p className="text-sm text-gray-400 p-4">Loading...</p>}
              {!loading && notes.length === 0 && (
                <p className="text-sm text-gray-400 p-4">No notes yet.</p>
              )}
              {notes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => selectNote(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                    selectedId === n.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">{n.title}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(n.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg lg:col-span-2 p-5 space-y-3">
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Write your note here..."
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : selectedId ? 'Save Changes' : 'Create Note'}
              </button>
              {selectedId && (
                <button
                  type="button"
                  onClick={() => handleDelete(selectedId)}
                  className="text-red-600 text-sm font-medium"
                >
                  Delete Note
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
}
"""
    with open(notebook_page_path, "w", encoding="utf-8") as f:
        f.write(notebook_page_content)
    print(f"[OK] Created {notebook_page_path}")

print("\nDone. Next: npx prisma migrate dev --name add_notebook, then npx tsc --noEmit in both backend/ and frontend/.")
