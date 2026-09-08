#!/usr/bin/env python3
"""
Adds Teacher -> My Classes:
  1. teacher.routes.ts -> new GET /teacher/classes (groups UnitLecturer by Programme)
  2. TeacherClasses.tsx -> new page
  3. App.tsx -> import + route

No schema change -- groups existing UnitLecturer/UnitRegistration data by
Programme instead of by Unit (that's what "My Units" already shows).
Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

FRONTEND = os.path.join(ROOT, "frontend", "src")
TEACHER_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "teacher.routes.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "teacher")
TEACHER_CLASSES_PATH = os.path.join(PAGES_DIR, "TeacherClasses.tsx")


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
# 1. teacher.routes.ts -- GET /classes
# ------------------------------------------------------------------
if already_applied(TEACHER_ROUTES_PATH, "/classes"):
    print(f"[SKIP] /classes route already present -> {TEACHER_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ---------- Teacher: my classes (programme/cohort rollup of my units) ----------
router.get('/classes', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json({ term: null, classes: [] });

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
    include: { unit: { include: { program: true } } },
  });

  if (assignments.length === 0) return res.json({ term: term.name, classes: [] });

  const unitIds = assignments.map((a) => a.unitId);
  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
    select: { unitId: true, studentId: true },
  });

  const programMap = new Map<
    string,
    { programId: string; programName: string; programLevel: string | null; units: Set<string>; studentIds: Set<string> }
  >();

  for (const a of assignments) {
    const key = a.unit.program.id;
    if (!programMap.has(key)) {
      programMap.set(key, {
        programId: key,
        programName: a.unit.program.name,
        programLevel: a.unit.program.level,
        units: new Set(),
        studentIds: new Set(),
      });
    }
    programMap.get(key)!.units.add(a.unit.name);
  }

  for (const r of registrations) {
    const assignment = assignments.find((a) => a.unitId === r.unitId);
    if (!assignment) continue;
    programMap.get(assignment.unit.program.id)!.studentIds.add(r.studentId);
  }

  const classes = Array.from(programMap.values()).map((p) => ({
    programId: p.programId,
    programName: p.programName,
    programLevel: p.programLevel,
    units: Array.from(p.units),
    studentCount: p.studentIds.size,
  }));

  res.json({ term: term.name, classes });
});

export default router;
'''
    replace_once(TEACHER_ROUTES_PATH, anchor, new_block, "teacher.routes.ts /classes route")

# ------------------------------------------------------------------
# 2. TeacherClasses.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(TEACHER_CLASSES_PATH):
    print(f"[SKIP] {TEACHER_CLASSES_PATH} already exists -- not overwriting")
else:
    classes_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ClassRow {
  programId: string;
  programName: string;
  programLevel: string | null;
  units: string[];
  studentCount: number;
}

export default function TeacherClasses() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/classes', { token })
      .then((data) => {
        setTerm(data.term);
        setClasses(data.classes);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your classes'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PortalLayout title="My Classes">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Classes</h2>
          <p className="text-sm text-gray-500 mt-1">
            {term
              ? `The class cohorts you teach into this term (${term}), grouped by programme.`
              : 'No active academic term right now.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            Loading your classes...
          </div>
        ) : classes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            You are not assigned to any units this term yet, so no classes to show.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classes.map((c) => (
              <div key={c.programId} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900">
                  {c.programName} {c.programLevel || ''}
                </h3>
                <p className="text-xs text-gray-400 mt-2">
                  {c.studentCount} student{c.studentCount === 1 ? '' : 's'} across {c.units.length} unit
                  {c.units.length === 1 ? '' : 's'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.units.map((u) => (
                    <span key={u} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {u}
                    </span>
                  ))}
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
    with open(TEACHER_CLASSES_PATH, "w", encoding="utf-8") as f:
        f.write(classes_content)
    print(f"[OK] Created {TEACHER_CLASSES_PATH}")

# ------------------------------------------------------------------
# 3. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "TeacherClasses"):
    print(f"[SKIP] TeacherClasses already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import TeacherUnits from './pages/teacher/TeacherUnits';\n"
    app_import_new = (
        "import TeacherUnits from './pages/teacher/TeacherUnits';\n"
        "import TeacherClasses from './pages/teacher/TeacherClasses';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx import")

    app_route_anchor = '                <Route path="/teacher/units" element={<TeacherUnits />} />\n'
    app_route_new = (
        '                <Route path="/teacher/units" element={<TeacherUnits />} />\n'
        '                <Route path="/teacher/classes" element={<TeacherClasses />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx route")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
