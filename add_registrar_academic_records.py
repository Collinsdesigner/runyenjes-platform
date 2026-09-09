#!/usr/bin/env python3
"""
Adds Registrar -> Academic Records:
  1. registrar.routes.ts -> new GET /programmes/:programId/students
                            (real Enrollment data, more accurate than the
                            application-derived programme on the flat
                            Student Records list)
  2. RegistrarAcademicRecords.tsx -> new page: dept -> programme -> student
                            list, linking into the EXISTING
                            /registrar/students/:studentId/academic page
  3. App.tsx -> import + route at /registrar/academic

No schema change, no migration needed.
Safe to re-run: checks whether already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

REGISTRAR_ROUTES_PATH = os.path.join(BACKEND, "routes", "registrar.routes.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "registrar")
ACADEMIC_RECORDS_PATH = os.path.join(PAGES_DIR, "RegistrarAcademicRecords.tsx")


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
# 1. registrar.routes.ts -- new route
# ------------------------------------------------------------------
if already_applied(REGISTRAR_ROUTES_PATH, "/programmes/:programId/students"):
    print(f"[SKIP] /programmes/:programId/students already present -> {REGISTRAR_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''/**
 * Students actually enrolled (real Enrollment records) in a given programme.
 * More accurate than the flat Student Records list, which derives "programme"
 * from an admitted Application rather than the Enrollment table itself.
 */
router.get(
  '/programmes/:programId/students',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { programId } = req.params;

    const enrollments = await prisma.enrollment.findMany({
      where: { programId },
      include: {
        student: {
          select: { id: true, name: true, email: true, admissionNumber: true, status: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    const result = enrollments.map((e) => ({
      studentId: e.studentId,
      name: e.student.name,
      email: e.student.email,
      admissionNumber: e.student.admissionNumber,
      status: e.status,
    }));

    res.json(result);
  }
);

export default router;
'''
    replace_once(REGISTRAR_ROUTES_PATH, anchor, new_block, "registrar.routes.ts programme students route")

# ------------------------------------------------------------------
# 2. RegistrarAcademicRecords.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(ACADEMIC_RECORDS_PATH):
    print(f"[SKIP] {ACADEMIC_RECORDS_PATH} already exists -- not overwriting")
else:
    academic_records_content = """import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Programme {
  id: string;
  name: string;
  level: string | null;
}

interface Department {
  id: string;
  name: string;
  programs: Programme[];
}

interface EnrolledStudent {
  studentId: string;
  name: string;
  email: string;
  admissionNumber: string | null;
  status: string;
}

export default function RegistrarAcademicRecords() {
  const { token } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedProgramme, setSelectedProgramme] = useState<string | null>(null);

  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/academic/structure', { token })
      .then(setDepartments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load academic structure'))
      .finally(() => setLoading(false));
  }, [token]);

  async function selectProgramme(programId: string) {
    setSelectedProgramme(programId);
    setStudentsLoading(true);
    setError('');
    try {
      const data = await api(`/registrar/programmes/${programId}/students`, { token });
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load enrolled students');
    } finally {
      setStudentsLoading(false);
    }
  }

  const department = departments.find((d) => d.id === selectedDepartment);
  const programme = department?.programs.find((p) => p.id === selectedProgramme);

  return (
    <PortalLayout title="Academic Records">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Academic Records</h2>
          <p className="text-sm text-gray-500 mt-1">
            Browse by department and programme to see who is actually enrolled.
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Departments</div>
              <div className="divide-y divide-gray-100">
                {departments.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedDepartment(d.id);
                      setSelectedProgramme(null);
                      setStudents([]);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedDepartment === d.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Programmes</div>
              {!department ? (
                <p className="text-sm text-gray-400 p-4">Select a department.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {department.programs.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProgramme(p.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                        selectedProgramme === p.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                      }`}
                    >
                      {p.name} {p.level || ''}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">
                {programme ? `Enrolled — ${programme.name}` : 'Enrolled Students'}
              </div>
              {!programme ? (
                <p className="text-sm text-gray-400 p-4">Select a programme.</p>
              ) : studentsLoading ? (
                <p className="text-sm text-gray-400 p-4">Loading...</p>
              ) : students.length === 0 ? (
                <p className="text-sm text-gray-400 p-4">No students enrolled in this programme yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {students.map((s) => (
                    <Link
                      key={s.studentId}
                      to={`/registrar/students/${s.studentId}/academic`}
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="font-medium text-gray-900 text-sm">{s.name}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {s.admissionNumber || 'No admission number'} · {s.status}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(ACADEMIC_RECORDS_PATH, "w", encoding="utf-8") as f:
        f.write(academic_records_content)
    print(f"[OK] Created {ACADEMIC_RECORDS_PATH}")

# ------------------------------------------------------------------
# 3. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "RegistrarAcademicRecords"):
    print(f"[SKIP] RegistrarAcademicRecords already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import RegistrarStudentAcademic from './pages/registrar/RegistrarStudentAcademic';\n"
    app_import_new = (
        "import RegistrarStudentAcademic from './pages/registrar/RegistrarStudentAcademic';\n"
        "import RegistrarAcademicRecords from './pages/registrar/RegistrarAcademicRecords';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx import")

    # Anchored without leading whitespace -- this file mixes indentation
    # styles across routes, so match on content only, not exact spacing.
    with open(APP_TSX_PATH, "r", encoding="utf-8") as f:
        app_content = f.read()

    route_marker = '<Route path="/registrar/students/:studentId/academic" element={<RegistrarStudentAcademic />} />\n'
    marker_count = app_content.count(route_marker)
    if marker_count == 0:
        raise SystemExit(
            "[FAIL] Could not find the /registrar/students/:studentId/academic route line in App.tsx.\n"
            "       Paste the exact line (run: grep -n 'studentId/academic' App.tsx) so the anchor can be corrected."
        )
    if marker_count > 1:
        raise SystemExit("[FAIL] That route line appears more than once in App.tsx -- refusing to guess which one.")

    new_route_line = route_marker + '                <Route path="/registrar/academic" element={<RegistrarAcademicRecords />} />\n'
    app_content = app_content.replace(route_marker, new_route_line)
    with open(APP_TSX_PATH, "w", encoding="utf-8") as f:
        f.write(app_content)
    print(f"[OK] App.tsx route -> {APP_TSX_PATH}")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
