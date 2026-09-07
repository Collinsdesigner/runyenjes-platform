#!/usr/bin/env python3
"""
Adds Teacher -> Students:
  1. backend/src/routes/teacher.routes.ts -> new route: GET /teacher/students
  2. frontend/src/pages/teacher/TeacherStudents.tsx -> new page
  3. App.tsx -> import + route

AI: reuses the EXISTING 'teacher_class_performance' quick action already
in ai.routes.ts (POST /ai/assist) -- no new AI prompt/logic needed here,
just a button that calls it.

Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

TEACHER_ROUTES_PATH = os.path.join(BACKEND, "routes", "teacher.routes.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "teacher")
TEACHER_STUDENTS_PATH = os.path.join(PAGES_DIR, "TeacherStudents.tsx")


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
# 1. teacher.routes.ts -- add GET /teacher/students
# ------------------------------------------------------------------
if already_applied(TEACHER_ROUTES_PATH, "/students"):
    print(f"[SKIP] /teacher/students already present -> {TEACHER_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ---------- Teacher: roster of students across my units this term ----------
router.get('/students', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) {
    return res.json({ term: null, students: [] });
  }

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
  });
  const unitIds = assignments.map((a) => a.unitId);

  if (unitIds.length === 0) {
    return res.json({ term: term.name, students: [] });
  }

  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
    include: {
      student: { select: { id: true, name: true, admissionNumber: true } },
      unit: { select: { name: true } },
    },
  });

  const studentMap = new Map<string, { studentId: string; name: string; admissionNumber: string | null; units: string[] }>();

  for (const r of registrations) {
    const existing = studentMap.get(r.studentId);
    if (existing) {
      existing.units.push(r.unit.name);
    } else {
      studentMap.set(r.studentId, {
        studentId: r.studentId,
        name: r.student.name,
        admissionNumber: r.student.admissionNumber,
        units: [r.unit.name],
      });
    }
  }

  res.json({ term: term.name, students: Array.from(studentMap.values()) });
});

export default router;
'''
    replace_once(TEACHER_ROUTES_PATH, anchor, new_block, "teacher.routes.ts /students route")

# ------------------------------------------------------------------
# 2. frontend/src/pages/teacher/TeacherStudents.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(TEACHER_STUDENTS_PATH):
    print(f"[SKIP] {TEACHER_STUDENTS_PATH} already exists -- not overwriting")
else:
    teacher_students_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StudentRow {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  units: string[];
}

export default function TeacherStudents() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/students', { token })
      .then((data) => {
        setTerm(data.term);
        setStudents(data.students);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your students'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAskAI() {
    setAiLoading(true);
    setAiError('');
    setAiReply('');
    try {
      const data = await api('/ai/assist', {
        method: 'POST',
        token,
        body: { action: 'teacher_class_performance' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Students">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Students</h2>
            <p className="text-sm text-gray-500 mt-1">
              {term ? `Students registered in your units this term (${term}).` : 'No active academic term right now.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Class Performance Summary'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {aiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{aiError}</div>
        )}
        {aiReply && (
          <div className="bg-green-50 border border-green-200 text-gray-800 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            Loading students...
          </div>
        ) : students.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No students registered in your units this term yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {students.map((s) => (
              <div key={s.studentId} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{s.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {s.admissionNumber || 'No admission number'} · {s.units.join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(TEACHER_STUDENTS_PATH, "w", encoding="utf-8") as f:
        f.write(teacher_students_content)
    print(f"[OK] Created {TEACHER_STUDENTS_PATH}")

# ------------------------------------------------------------------
# 3. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "TeacherStudents"):
    print(f"[SKIP] TeacherStudents already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import TeacherUnits from './pages/teacher/TeacherUnits';\n"
    app_import_new = (
        "import TeacherUnits from './pages/teacher/TeacherUnits';\n"
        "import TeacherStudents from './pages/teacher/TeacherStudents';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx import")

    app_route_anchor = '                <Route path="/teacher/units" element={<TeacherUnits />} />\n'
    app_route_new = (
        '                <Route path="/teacher/units" element={<TeacherUnits />} />\n'
        '                <Route path="/teacher/students" element={<TeacherStudents />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx route")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
