#!/usr/bin/env python3
"""
Adds editable Report Notes (Registrar/Admin can write and save commentary,
with AIAssistBox available to help polish it -- AI assists, doesn't own,
the writing):
  1. schema.prisma      -> new ReportNote singleton model + User back-relation
  2. reports.routes.ts  -> GET/PUT /reports/notes
  3. Reports.tsx        -> editable textarea + Save + AIAssistBox, wired in

Needs a migration (new model) -- run prisma migrate dev after this.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

SCHEMA_PATH = os.path.join(ROOT, "backend", "prisma", "schema.prisma")
REPORTS_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "reports.routes.ts")
REPORTS_PAGE_PATH = os.path.join(ROOT, "frontend", "src", "pages", "reports", "Reports.tsx")


def already_applied(path, marker):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        return marker in f.read()


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
# 1. schema.prisma -- ReportNote singleton + User back-relation
# ------------------------------------------------------------------
if already_applied(SCHEMA_PATH, "ReportNote"):
    print(f"[SKIP] ReportNote already present -> {SCHEMA_PATH}")
else:
    user_anchor = '  attendanceRecorded  AttendanceRecord[] @relation("AttendanceRecordedBy")\n'
    user_new = (
        '  attendanceRecorded  AttendanceRecord[] @relation("AttendanceRecordedBy")\n'
        "  reportNotesUpdated ReportNote[]\n"
    )
    replace_once(SCHEMA_PATH, user_anchor, user_new, "User relation for ReportNote")

    model_anchor = (
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    model_new = (
        "// ─────────────────────────────────────────────\n"
        "// REPORT NOTES\n"
        "// ─────────────────────────────────────────────\n"
        "// Single shared note (like SiteSettings) that Registrar/Admin can write\n"
        "// and revise, shown alongside the auto-generated Reports stats/AI summary.\n\n"
        "model ReportNote {\n"
        "  id          Int      @id @default(1)\n"
        '  content     String   @default("")\n'
        "  updatedById String?\n"
        "  updatedBy   User?    @relation(fields: [updatedById], references: [id])\n"
        "  updatedAt   DateTime @default(now()) @updatedAt\n"
        "}\n\n"
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    replace_once(SCHEMA_PATH, model_anchor, model_new, "ReportNote model")

# ------------------------------------------------------------------
# 2. reports.routes.ts -- GET/PUT /notes
# ------------------------------------------------------------------
if already_applied(REPORTS_ROUTES_PATH, "/notes"):
    print(f"[SKIP] /notes routes already present -> {REPORTS_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ---------- Get the shared report notes ----------
router.get('/notes', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const note = await prisma.reportNote.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, content: '' },
  });
  res.json({ content: note.content, updatedAt: note.updatedAt });
});

// ---------- Update the shared report notes ----------
router.put('/notes', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { content } = req.body;
  if (content === undefined) {
    return res.status(400).json({ error: 'content is required' });
  }

  const note = await prisma.reportNote.upsert({
    where: { id: 1 },
    update: { content, updatedById: req.user!.userId },
    create: { id: 1, content, updatedById: req.user!.userId },
  });

  res.json({ content: note.content, updatedAt: note.updatedAt });
});

export default router;
'''
    replace_once(REPORTS_ROUTES_PATH, anchor, new_block, "reports.routes.ts /notes routes")

# ------------------------------------------------------------------
# 3. Reports.tsx -- editable notes section + AIAssistBox
# ------------------------------------------------------------------
if already_applied(REPORTS_PAGE_PATH, "AIAssistBox"):
    print(f"[SKIP] Report Notes already wired into {REPORTS_PAGE_PATH}")
else:
    import_anchor = "import { useAuth } from '../../context/AuthContext';\n"
    import_new = (
        "import { useAuth } from '../../context/AuthContext';\n"
        "import AIAssistBox from '../../components/ai/AIAssistBox';\n"
    )
    replace_once(REPORTS_PAGE_PATH, import_anchor, import_new, "Reports.tsx AIAssistBox import")

    state_anchor = "  const [aiError, setAiError] = useState('');\n"
    state_new = (
        "  const [aiError, setAiError] = useState('');\n\n"
        "  const [notes, setNotes] = useState('');\n"
        "  const [notesSaving, setNotesSaving] = useState(false);\n"
        "  const [notesMessage, setNotesMessage] = useState('');\n"
    )
    replace_once(REPORTS_PAGE_PATH, state_anchor, state_new, "Reports.tsx notes state")

    effect_anchor = '''  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/reports/overview', { token })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load reports'))
      .finally(() => setLoading(false));
  }, [token]);
'''
    effect_new = effect_anchor + '''
  useEffect(() => {
    if (!token) return;
    api('/reports/notes', { token })
      .then((data) => setNotes(data.content || ''))
      .catch(() => {});
  }, [token]);

  async function handleSaveNotes() {
    setNotesSaving(true);
    setNotesMessage('');
    try {
      await api('/reports/notes', { method: 'PUT', token, body: { content: notes } });
      setNotesMessage('Notes saved');
    } catch (err) {
      setNotesMessage(err instanceof Error ? err.message : 'Could not save notes');
    } finally {
      setNotesSaving(false);
    }
  }
'''
    replace_once(REPORTS_PAGE_PATH, effect_anchor, effect_new, "Reports.tsx notes load + save")

    jsx_anchor = '''        {data && ('''
    jsx_new = '''        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Report Notes</h3>
            {notesMessage && <span className="text-xs text-gray-500">{notesMessage}</span>}
          </div>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Write your own commentary on this term's figures..."
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <AIAssistBox
            task="improve"
            label="Ask AI to polish these notes"
            getInput={() => notes}
            onApply={(result) => setNotes(result)}
            emptyMessage="Write your notes first, then ask AI to polish them."
          />
          <button
            type="button"
            onClick={handleSaveNotes}
            disabled={notesSaving}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {notesSaving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>

        {data && ('''
    replace_once(REPORTS_PAGE_PATH, jsx_anchor, jsx_new, "Reports.tsx notes render")

print("\\nDone. Next: cd backend && npx prisma migrate dev --name add_report_notes, then npx tsc --noEmit in both backend/ and frontend/.")
