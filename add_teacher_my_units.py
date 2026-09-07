#!/usr/bin/env python3
"""
Adds Teacher -> My Units:
  1. backend/src/routes/teacher.routes.ts -> new file: GET /teacher/units
  2. index.ts                              -> import + mount
  3. frontend/src/pages/teacher/TeacherUnits.tsx -> new page
  4. App.tsx                               -> import + route

Uses existing UnitLecturer + UnitRegistration data -- no schema change,
no migration needed. Links each unit into the already-built AI Unit Tutor
at /library/units/:unitId/tutor rather than duplicating AI logic here.

Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

INDEX_TS_PATH = os.path.join(BACKEND, "index.ts")
ROUTES_DIR = os.path.join(BACKEND, "routes")
TEACHER_ROUTES_PATH = os.path.join(ROUTES_DIR, "teacher.routes.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "teacher")
TEACHER_UNITS_PATH = os.path.join(PAGES_DIR, "TeacherUnits.tsx")


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
# 1. backend/src/routes/teacher.routes.ts -- new file
# ------------------------------------------------------------------
os.makedirs(ROUTES_DIR, exist_ok=True)

if os.path.exists(TEACHER_ROUTES_PATH):
    print(f"[SKIP] {TEACHER_ROUTES_PATH} already exists -- not overwriting")
else:
    teacher_routes_content = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Teacher: my assigned units for the active term ----------
// Real data only -- UnitLecturer assignments + a live UnitRegistration
// count per unit. No placeholder data, no new models needed.
router.get('/units', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) {
    return res.json({ term: null, units: [] });
  }

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
    include: { unit: { include: { program: true } } },
  });

  const unitIds = assignments.map((a) => a.unitId);

  const registrationCounts = unitIds.length
    ? await prisma.unitRegistration.groupBy({
        by: ['unitId'],
        where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
        _count: { unitId: true },
      })
    : [];

  const countMap = new Map(registrationCounts.map((r) => [r.unitId, r._count.unitId]));

  const units = assignments.map((a) => ({
    unitId: a.unitId,
    unitName: a.unit.name,
    programmeName: a.unit.program.name,
    programmeLevel: a.unit.program.level,
    studentCount: countMap.get(a.unitId) || 0,
  }));

  res.json({ term: term.name, units });
});

export default router;
"""
    with open(TEACHER_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(teacher_routes_content)
    print(f"[OK] Created {TEACHER_ROUTES_PATH}")

# ------------------------------------------------------------------
# 2. backend/src/index.ts -- import + mount
# ------------------------------------------------------------------
if already_applied(INDEX_TS_PATH, "teacherRoutes"):
    print(f"[SKIP] teacherRoutes already wired into {INDEX_TS_PATH}")
else:
    index_import_anchor = "import assignmentsRoutes from './routes/assignments.routes';\n"
    index_import_new = (
        "import assignmentsRoutes from './routes/assignments.routes';\n"
        "import teacherRoutes from './routes/teacher.routes';\n"
    )
    replace_once(INDEX_TS_PATH, index_import_anchor, index_import_new, "index.ts import")

    index_mount_anchor = "app.use('/assignments', assignmentsRoutes);\n"
    index_mount_new = (
        "app.use('/assignments', assignmentsRoutes);\n"
        "app.use('/teacher', teacherRoutes);\n"
    )
    replace_once(INDEX_TS_PATH, index_mount_anchor, index_mount_new, "index.ts app.use")

# ------------------------------------------------------------------
# 3. frontend/src/pages/teacher/TeacherUnits.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(TEACHER_UNITS_PATH):
    print(f"[SKIP] {TEACHER_UNITS_PATH} already exists -- not overwriting")
else:
    teacher_units_content = """import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UnitRow {
  unitId: string;
  unitName: string;
  programmeName: string;
  programmeLevel: string | null;
  studentCount: number;
}

export default function TeacherUnits() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/units', { token })
      .then((data) => {
        setTerm(data.term);
        setUnits(data.units);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your units'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PortalLayout title="My Units">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Units</h2>
          <p className="text-sm text-gray-500 mt-1">
            {term ? `Units you are assigned to teach this term (${term}).` : 'No active academic term right now.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            Loading your units...
          </div>
        ) : units.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            You are not assigned to any units this term yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {units.map((u) => (
              <div key={u.unitId} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900">{u.unitName}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {u.programmeName} {u.programmeLevel || ''}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {u.studentCount} student{u.studentCount === 1 ? '' : 's'} registered
                </p>
                <Link
                  to={`/library/units/${u.unitId}/tutor`}
                  className="inline-block mt-3 text-xs font-medium text-rgreen"
                >
                  Open AI Unit Tutor for this unit →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(TEACHER_UNITS_PATH, "w", encoding="utf-8") as f:
        f.write(teacher_units_content)
    print(f"[OK] Created {TEACHER_UNITS_PATH}")

# ------------------------------------------------------------------
# 4. frontend/src/App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "TeacherUnits"):
    print(f"[SKIP] TeacherUnits already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import TeacherAssignments from './pages/teacher/TeacherAssignments';\n"
    app_import_new = (
        "import TeacherAssignments from './pages/teacher/TeacherAssignments';\n"
        "import TeacherUnits from './pages/teacher/TeacherUnits';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx import")

    app_route_anchor = (
        '                <Route path="/teacher/assignments" element={<TeacherAssignments />} />\n'
    )
    app_route_new = (
        '                <Route path="/teacher/assignments" element={<TeacherAssignments />} />\n'
        '                <Route path="/teacher/units" element={<TeacherUnits />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx route")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
