#!/usr/bin/env python3
"""
Adds Teacher -> Attendance:
  1. schema.prisma      -> AttendanceRecord model + AttendanceStatus enum +
                           relations on User, Unit, Term
  2. ai.routes.ts       -> new 'teacher_attendance_patterns' quick action
  3. teacher.routes.ts  -> GET roster (existing statuses for a unit+date),
                           POST bulk-save attendance for a unit+date
  4. TeacherAttendance.tsx -> new page
  5. App.tsx            -> import + route
     (nav link already exists in PortalLayout.tsx's TEACHER section --
     no change needed there)

Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

SCHEMA_PATH = os.path.join(ROOT, "backend", "prisma", "schema.prisma")
AI_ROUTES_PATH = os.path.join(BACKEND, "routes", "ai.routes.ts")
TEACHER_ROUTES_PATH = os.path.join(BACKEND, "routes", "teacher.routes.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "teacher")
ATTENDANCE_PATH = os.path.join(PAGES_DIR, "TeacherAttendance.tsx")


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
# 1. schema.prisma
# ------------------------------------------------------------------
if already_applied(SCHEMA_PATH, "AttendanceRecord"):
    print(f"[SKIP] AttendanceRecord already present -> {SCHEMA_PATH}")
else:
    # User relations
    user_anchor = "  notes Note[]\n"
    user_new = (
        "  notes Note[]\n"
        '  attendanceAsStudent AttendanceRecord[] @relation("AttendanceStudent")\n'
        '  attendanceRecorded  AttendanceRecord[] @relation("AttendanceRecordedBy")\n'
    )
    replace_once(SCHEMA_PATH, user_anchor, user_new, "User relations for AttendanceRecord")

    # Unit relation
    unit_anchor = "  aiConversations AIConversation[]\n}\n"
    unit_new = (
        "  aiConversations AIConversation[]\n"
        "  attendanceRecords AttendanceRecord[]\n"
        "}\n"
    )
    replace_once(SCHEMA_PATH, unit_anchor, unit_new, "Unit relation for AttendanceRecord")

    # Term relation
    term_anchor = "  assignments         Assignment[]\n}\n"
    term_new = (
        "  assignments         Assignment[]\n"
        "  attendanceRecords   AttendanceRecord[]\n"
        "}\n"
    )
    replace_once(SCHEMA_PATH, term_anchor, term_new, "Term relation for AttendanceRecord")

    # New model + enum, inserted before the ASSIGNMENTS section header
    # (same proven anchor used for Announcements and Notebook)
    model_anchor = (
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    model_new = (
        "// ─────────────────────────────────────────────\n"
        "// ATTENDANCE\n"
        "// ─────────────────────────────────────────────\n"
        "// One record per student, per unit, per calendar date. Recorded by\n"
        "// whichever teacher takes attendance for that session.\n\n"
        "enum AttendanceStatus {\n"
        "  PRESENT\n"
        "  ABSENT\n"
        "  LATE\n"
        "  EXCUSED\n"
        "}\n\n"
        "model AttendanceRecord {\n"
        "  id           String           @id @default(uuid())\n"
        "  unitId       String\n"
        "  unit         Unit             @relation(fields: [unitId], references: [id])\n"
        "  termId       String\n"
        "  term         Term             @relation(fields: [termId], references: [id])\n"
        "  studentId    String\n"
        '  student      User             @relation("AttendanceStudent", fields: [studentId], references: [id])\n'
        "  date         DateTime\n"
        "  status       AttendanceStatus @default(PRESENT)\n"
        "  recordedById String\n"
        '  recordedBy   User             @relation("AttendanceRecordedBy", fields: [recordedById], references: [id])\n\n'
        "  createdAt DateTime @default(now())\n"
        "  updatedAt DateTime @updatedAt\n\n"
        "  @@unique([unitId, date, studentId])\n"
        "  @@index([unitId])\n"
        "  @@index([studentId])\n"
        "}\n\n"
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    replace_once(SCHEMA_PATH, model_anchor, model_new, "AttendanceRecord model + AttendanceStatus enum")

# ------------------------------------------------------------------
# 2. ai.routes.ts -- new teacher_attendance_patterns quick action
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "teacher_attendance_patterns"):
    print(f"[SKIP] teacher_attendance_patterns already present -> {AI_ROUTES_PATH}")
else:
    anchor = (
        "      return `Here is a summary of assessments across this teacher's units this term:"
        "\\n${lines.join('\\n')}\\n\\nSummarize trends and flag any students who may need extra support.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    new_block = (
        "      return `Here is a summary of assessments across this teacher's units this term:"
        "\\n${lines.join('\\n')}\\n\\nSummarize trends and flag any students who may need extra support.`;\n"
        "    },\n"
        "  },\n\n"
        "  teacher_attendance_patterns: {\n"
        "    roles: ['TEACHER'],\n"
        "    systemPrompt:\n"
        "      'You help a TVET teacher spot attendance patterns across the units they teach. "
        "Flag students with frequent absences and any noticeable trends. Be concise.',\n"
        "    build: async (userId) => {\n"
        "      const term = await prisma.term.findFirst({ where: { isActive: true } });\n"
        "      if (!term) return 'No active academic term right now, so there is no attendance data to summarize.';\n\n"
        "      const myUnits = await prisma.unitLecturer.findMany({ where: { lecturerId: userId, termId: term.id } });\n"
        "      const unitIds = myUnits.map((u) => u.unitId);\n"
        "      if (unitIds.length === 0) return 'This teacher has no assigned units this term.';\n\n"
        "      const records = await prisma.attendanceRecord.findMany({\n"
        "        where: { unitId: { in: unitIds }, termId: term.id },\n"
        "        include: { student: { select: { name: true } } },\n"
        "      });\n"
        "      if (records.length === 0) return 'No attendance has been recorded yet for this teacher\\'s units this term.';\n\n"
        "      const absenceCounts = new Map<string, number>();\n"
        "      const totalSessions = new Map<string, number>();\n"
        "      for (const r of records) {\n"
        "        const key = r.student.name;\n"
        "        totalSessions.set(key, (totalSessions.get(key) || 0) + 1);\n"
        "        if (r.status === 'ABSENT') absenceCounts.set(key, (absenceCounts.get(key) || 0) + 1);\n"
        "      }\n\n"
        "      const lines = Array.from(totalSessions.keys()).map((name) => {\n"
        "        const absences = absenceCounts.get(name) || 0;\n"
        "        const total = totalSessions.get(name) || 0;\n"
        "        return `- ${name}: absent ${absences} of ${total} recorded sessions`;\n"
        "      });\n\n"
        "      return `Here is attendance across this teacher's units this term:\\n${lines.join('\\n')}\\n\\n"
        "Flag students with frequent absences and any noticeable trends.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    replace_once(AI_ROUTES_PATH, anchor, new_block, "ai.routes.ts teacher_attendance_patterns action")

# ------------------------------------------------------------------
# 3. teacher.routes.ts -- roster + bulk save
# ------------------------------------------------------------------
if already_applied(TEACHER_ROUTES_PATH, "/attendance"):
    print(f"[SKIP] /attendance routes already present -> {TEACHER_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ---------- Teacher: roster + existing attendance for a unit+date ----------
router.get('/attendance/roster', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { unitId, date } = req.query as { unitId?: string; date?: string };
  if (!unitId || !date) {
    return res.status(400).json({ error: 'unitId and date are required' });
  }

  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.status(400).json({ error: 'No active academic term right now' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId, termId: term.id },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You are not assigned to teach this unit this term' });
  }

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId, termId: term.id, status: 'REGISTERED' },
    include: { student: { select: { id: true, name: true, admissionNumber: true } } },
  });

  const existing = await prisma.attendanceRecord.findMany({
    where: { unitId, date: dayStart },
  });
  const statusMap = new Map(existing.map((r) => [r.studentId, r.status]));

  const roster = registrations.map((r) => ({
    studentId: r.studentId,
    name: r.student.name,
    admissionNumber: r.student.admissionNumber,
    status: statusMap.get(r.studentId) || null,
  }));

  res.json({ roster });
});

// ---------- Teacher: bulk-save attendance for a unit+date ----------
router.post('/attendance', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { unitId, date, records } = req.body;
  if (!unitId || !date || !Array.isArray(records)) {
    return res.status(400).json({ error: 'unitId, date and records[] are required' });
  }

  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.status(400).json({ error: 'No active academic term right now' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId, termId: term.id },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You are not assigned to teach this unit this term' });
  }

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  for (const rec of records) {
    if (!rec.studentId || !rec.status) continue;
    await prisma.attendanceRecord.upsert({
      where: { unitId_date_studentId: { unitId, date: dayStart, studentId: rec.studentId } },
      update: { status: rec.status, recordedById: req.user!.userId },
      create: {
        unitId,
        termId: term.id,
        studentId: rec.studentId,
        date: dayStart,
        status: rec.status,
        recordedById: req.user!.userId,
      },
    });
  }

  res.status(204).send();
});

export default router;
'''
    replace_once(TEACHER_ROUTES_PATH, anchor, new_block, "teacher.routes.ts attendance routes")

# ------------------------------------------------------------------
# 4. TeacherAttendance.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(ATTENDANCE_PATH):
    print(f"[SKIP] {ATTENDANCE_PATH} already exists -- not overwriting")
else:
    attendance_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UnitOption {
  unitId: string;
  unitName: string;
}

interface RosterRow {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  status: string | null;
}

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function TeacherAttendance() {
  const { token } = useAuth();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitId, setUnitId] = useState('');
  const [date, setDate] = useState(todayISO());

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/teacher/units', { token })
      .then((data) => setUnits(data.units.map((u: any) => ({ unitId: u.unitId, unitName: u.unitName }))))
      .catch(() => {});
  }, [token]);

  async function loadRoster() {
    if (!unitId || !date) return;
    setLoading(true);
    setError('');
    try {
      const data = await api(`/teacher/attendance/roster?unitId=${unitId}&date=${date}`, { token });
      setRoster(data.roster);
      const initialDrafts: Record<string, string> = {};
      data.roster.forEach((r: RosterRow) => {
        initialDrafts[r.studentId] = r.status || 'PRESENT';
      });
      setDrafts(initialDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load roster');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (unitId && date) loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, date]);

  async function handleSave() {
    if (!unitId || !date) return;
    setError('');
    setMessage('');
    try {
      const records = roster.map((r) => ({ studentId: r.studentId, status: drafts[r.studentId] || 'PRESENT' }));
      await api('/teacher/attendance', {
        method: 'POST',
        token,
        body: { unitId, date, records },
      });
      setMessage('Attendance saved');
      loadRoster();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save attendance');
    }
  }

  async function handleAskAI() {
    setAiLoading(true);
    setAiError('');
    setAiReply('');
    try {
      const data = await api('/ai/assist', {
        method: 'POST',
        token,
        body: { action: 'teacher_attendance_patterns' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Attendance">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Attendance</h2>
            <p className="text-sm text-gray-500 mt-1">Take attendance for one of your units, for a given date.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Attendance Patterns'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>}
        {aiError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{aiError}</div>}
        {aiReply && (
          <div className="bg-green-50 border border-green-200 text-gray-800 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Unit</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>{u.unitName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400">Loading roster...</p>}

        {!loading && unitId && roster.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No students registered in this unit yet.
          </div>
        )}

        {!loading && roster.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="divide-y divide-gray-100">
              {roster.map((r) => (
                <div key={r.studentId} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{r.name}</div>
                    <div className="text-xs text-gray-400">{r.admissionNumber || 'No admission number'}</div>
                  </div>
                  <select
                    value={drafts[r.studentId] || 'PRESENT'}
                    onChange={(e) => setDrafts({ ...drafts, [r.studentId]: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleSave}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                Save Attendance
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(ATTENDANCE_PATH, "w", encoding="utf-8") as f:
        f.write(attendance_content)
    print(f"[OK] Created {ATTENDANCE_PATH}")

# ------------------------------------------------------------------
# 5. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "TeacherAttendance"):
    print(f"[SKIP] TeacherAttendance already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import TeacherStudents from './pages/teacher/TeacherStudents';\n"
    app_import_new = (
        "import TeacherStudents from './pages/teacher/TeacherStudents';\n"
        "import TeacherAttendance from './pages/teacher/TeacherAttendance';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx import")

    app_route_anchor = '                <Route path="/teacher/students" element={<TeacherStudents />} />\n'
    app_route_new = (
        '                <Route path="/teacher/students" element={<TeacherStudents />} />\n'
        '                <Route path="/teacher/attendance" element={<TeacherAttendance />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx route")

print("\nDone. Next: cd backend && npx prisma migrate dev --name add_attendance, then npx tsc --noEmit in both backend/ and frontend/.")
