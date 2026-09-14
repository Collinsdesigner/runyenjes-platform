#!/usr/bin/env python3
"""
Adds Teacher -> Early Warning Dashboard:
  1. teacher.routes.ts -> new GET /teacher/early-warning (real computed
     risk data: absence rate, missing assignments, average score --
     cross-referencing three models we already built)
  2. ai.routes.ts -> new 'teacher_early_warning_summary' quick action
     (narrative + suggested next steps over the same computed data)
  3. PortalLayout.tsx -> new nav item under TEACHER's Teaching section
  4. TeacherEarlyWarning.tsx -> new page
  5. App.tsx -> import + route at /teacher/early-warning

No schema change, no migration needed.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

TEACHER_ROUTES_PATH = os.path.join(BACKEND, "routes", "teacher.routes.ts")
AI_ROUTES_PATH = os.path.join(BACKEND, "routes", "ai.routes.ts")
PORTAL_LAYOUT_PATH = os.path.join(FRONTEND, "components", "portal", "PortalLayout.tsx")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "teacher")
PAGE_PATH = os.path.join(PAGES_DIR, "TeacherEarlyWarning.tsx")


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
# 1. teacher.routes.ts -- GET /early-warning
# ------------------------------------------------------------------
if already_applied(TEACHER_ROUTES_PATH, "/early-warning"):
    print(f"[SKIP] /early-warning route already present -> {TEACHER_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ---------- Teacher: early warning -- students at risk across my units ----------
// Cross-references Attendance, Assignments, and Results to flag students
// who need attention. Real computed numbers, not an AI guess.
router.get('/early-warning', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json({ term: null, students: [], totalStudents: 0 });

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
  });
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return res.json({ term: term.name, students: [], totalStudents: 0 });

  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
    include: { student: { select: { id: true, name: true, admissionNumber: true } } },
  });

  const studentMap = new Map<string, { studentId: string; name: string; admissionNumber: string | null }>();
  for (const r of registrations) {
    if (!studentMap.has(r.studentId)) {
      studentMap.set(r.studentId, {
        studentId: r.studentId,
        name: r.student.name,
        admissionNumber: r.student.admissionNumber,
      });
    }
  }
  const studentIds = Array.from(studentMap.keys());

  const [attendanceRecords, assignmentsIssued, examResults] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { unitId: { in: unitIds }, termId: term.id, studentId: { in: studentIds } },
    }),
    prisma.assignment.findMany({ where: { unitId: { in: unitIds }, termId: term.id } }),
    prisma.examResult.findMany({
      where: { studentId: { in: studentIds } },
      include: { exam: { select: { unitId: true, maxScore: true } } },
    }),
  ]);

  const assignmentIds = assignmentsIssued.map((a) => a.id);
  const submissions = assignmentIds.length
    ? await prisma.assignmentSubmission.findMany({
        where: { assignmentId: { in: assignmentIds }, studentId: { in: studentIds } },
      })
    : [];

  const allResults = studentIds.map((studentId) => {
    const info = studentMap.get(studentId)!;

    const myAttendance = attendanceRecords.filter((a) => a.studentId === studentId);
    const absences = myAttendance.filter((a) => a.status === 'ABSENT').length;
    const totalSessions = myAttendance.length;
    const absenceRate = totalSessions > 0 ? absences / totalSessions : 0;

    const mySubmittedIds = new Set(
      submissions.filter((s) => s.studentId === studentId).map((s) => s.assignmentId)
    );
    const missingAssignments = assignmentsIssued.filter((a) => !mySubmittedIds.has(a.id)).length;

    const myResults = examResults.filter((r) => r.studentId === studentId && unitIds.includes(r.exam.unitId));
    const averageScorePercent = myResults.length
      ? myResults.reduce((sum, r) => sum + (Number(r.score) / Number(r.exam.maxScore)) * 100, 0) / myResults.length
      : null;

    const reasons: string[] = [];
    if (totalSessions >= 3 && absenceRate > 0.3) {
      reasons.push(`Absent ${absences} of ${totalSessions} recorded sessions`);
    }
    if (missingAssignments >= 2) {
      reasons.push(`${missingAssignments} assignment(s) not submitted`);
    }
    if (averageScorePercent !== null && averageScorePercent < 50) {
      reasons.push(`Average score ${averageScorePercent.toFixed(0)}%`);
    }

    return {
      studentId,
      name: info.name,
      admissionNumber: info.admissionNumber,
      absences,
      totalSessions,
      missingAssignments,
      averageScorePercent,
      atRisk: reasons.length > 0,
      reasons,
    };
  });

  const atRisk = allResults.filter((r) => r.atRisk).sort((a, b) => b.reasons.length - a.reasons.length);

  res.json({ term: term.name, students: atRisk, totalStudents: allResults.length });
});

export default router;
'''
    replace_once(TEACHER_ROUTES_PATH, anchor, new_block, "teacher.routes.ts /early-warning route")

# ------------------------------------------------------------------
# 2. ai.routes.ts -- new quick action
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "teacher_early_warning_summary"):
    print(f"[SKIP] teacher_early_warning_summary already present -> {AI_ROUTES_PATH}")
else:
    with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
        ai_content = f.read()

    marker = "// ---------- Role-specific one-click AI assist actions ----------\n"
    if marker not in ai_content or ai_content.count(marker) != 1:
        raise SystemExit(f"[FAIL] Could not find a single occurrence of the assist-actions route comment in ai.routes.ts.")

    insertion = '''  teacher_early_warning_summary: {
    roles: ['TEACHER'],
    systemPrompt:
      'You help a TVET teacher decide how to support students flagged as at-risk across attendance, ' +
      'assignments, and results. Be concise, practical, and encouraging -- suggest concrete next steps ' +
      '(e.g. who to check in with first, what kind of support each pattern suggests).',
    build: async (userId) => {
      const term = await prisma.term.findFirst({ where: { isActive: true } });
      if (!term) return 'No active academic term right now, so there is no early-warning data to summarize.';

      const assignments = await prisma.unitLecturer.findMany({ where: { lecturerId: userId, termId: term.id } });
      const unitIds = assignments.map((a) => a.unitId);
      if (unitIds.length === 0) return 'This teacher has no assigned units this term.';

      const registrations = await prisma.unitRegistration.findMany({
        where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
        include: { student: { select: { id: true, name: true } } },
      });
      const studentMap = new Map<string, string>();
      for (const r of registrations) studentMap.set(r.studentId, r.student.name);
      const studentIds = Array.from(studentMap.keys());
      if (studentIds.length === 0) return 'No students registered in this teacher\\'s units this term.';

      const [attendanceRecords, assignmentsIssued, examResults] = await Promise.all([
        prisma.attendanceRecord.findMany({ where: { unitId: { in: unitIds }, termId: term.id, studentId: { in: studentIds } } }),
        prisma.assignment.findMany({ where: { unitId: { in: unitIds }, termId: term.id } }),
        prisma.examResult.findMany({
          where: { studentId: { in: studentIds } },
          include: { exam: { select: { unitId: true, maxScore: true } } },
        }),
      ]);
      const assignmentIds = assignmentsIssued.map((a) => a.id);
      const submissions = assignmentIds.length
        ? await prisma.assignmentSubmission.findMany({ where: { assignmentId: { in: assignmentIds }, studentId: { in: studentIds } } })
        : [];

      const flagged: string[] = [];
      for (const studentId of studentIds) {
        const name = studentMap.get(studentId)!;
        const myAttendance = attendanceRecords.filter((a) => a.studentId === studentId);
        const absences = myAttendance.filter((a) => a.status === 'ABSENT').length;
        const totalSessions = myAttendance.length;
        const absenceRate = totalSessions > 0 ? absences / totalSessions : 0;
        const mySubmittedIds = new Set(submissions.filter((s) => s.studentId === studentId).map((s) => s.assignmentId));
        const missingAssignments = assignmentsIssued.filter((a) => !mySubmittedIds.has(a.id)).length;
        const myResults = examResults.filter((r) => r.studentId === studentId && unitIds.includes(r.exam.unitId));
        const avgPercent = myResults.length
          ? myResults.reduce((sum, r) => sum + (Number(r.score) / Number(r.exam.maxScore)) * 100, 0) / myResults.length
          : null;

        const reasons: string[] = [];
        if (totalSessions >= 3 && absenceRate > 0.3) reasons.push(`absent ${absences}/${totalSessions} sessions`);
        if (missingAssignments >= 2) reasons.push(`${missingAssignments} assignments missing`);
        if (avgPercent !== null && avgPercent < 50) reasons.push(`average score ${avgPercent.toFixed(0)}%`);

        if (reasons.length > 0) flagged.push(`- ${name}: ${reasons.join(', ')}`);
      }

      if (flagged.length === 0) return 'No students are currently flagged as at-risk across this teacher\\'s units. Everything looks fine.';

      return `Students flagged as at-risk across this teacher's units this term:\\n${flagged.join('\\n')}\\n\\nSuggest concrete next steps, prioritizing who needs attention first.`;
    },
  },

'''
    ai_content = ai_content.replace(marker, insertion + marker, 1)
    with open(AI_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(ai_content)
    print(f"[OK] teacher_early_warning_summary action inserted -> {AI_ROUTES_PATH}")

# ------------------------------------------------------------------
# 3. PortalLayout.tsx -- new nav item for TEACHER
# ------------------------------------------------------------------
if already_applied(PORTAL_LAYOUT_PATH, "Early Warning"):
    print(f"[SKIP] Nav item already present -> {PORTAL_LAYOUT_PATH}")
else:
    anchor = "        { label: 'AI Content Generator', path: '/teacher/content-generator', icon: '✨' },\n"
    new = (
        "        { label: 'AI Content Generator', path: '/teacher/content-generator', icon: '✨' },\n"
        "        { label: 'Early Warning', path: '/teacher/early-warning', icon: '🚨' },\n"
    )
    replace_once(PORTAL_LAYOUT_PATH, anchor, new, "PortalLayout.tsx TEACHER Early Warning nav item")

# ------------------------------------------------------------------
# 4. TeacherEarlyWarning.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(PAGE_PATH):
    print(f"[SKIP] {PAGE_PATH} already exists -- not overwriting")
else:
    page_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface RiskStudent {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  absences: number;
  totalSessions: number;
  missingAssignments: number;
  averageScorePercent: number | null;
  reasons: string[];
}

export default function TeacherEarlyWarning() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [students, setStudents] = useState<RiskStudent[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/early-warning', { token })
      .then((data) => {
        setTerm(data.term);
        setStudents(data.students);
        setTotalStudents(data.totalStudents);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load early warning data'))
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
        body: { action: 'teacher_early_warning_summary' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Early Warning">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Early Warning</h2>
            <p className="text-sm text-gray-500 mt-1">
              {term
                ? `Students flagged across attendance, assignments, and results this term (${term}). ${totalStudents} total registered.`
                : 'No active academic term right now.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Suggested Next Steps'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {aiError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{aiError}</div>}
        {aiReply && (
          <div className="bg-green-50 border border-green-200 text-gray-800 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : students.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No students currently flagged as at-risk. Either everything looks fine, or there isn't enough attendance/assignment/results data recorded yet to flag anyone.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {students.map((s) => (
              <div key={s.studentId} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.admissionNumber || 'No admission number'}</div>
                  </div>
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                    {s.reasons.length} flag{s.reasons.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {s.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600">• {r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(PAGE_PATH, "w", encoding="utf-8") as f:
        f.write(page_content)
    print(f"[OK] Created {PAGE_PATH}")

# ------------------------------------------------------------------
# 5. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "TeacherEarlyWarning"):
    print(f"[SKIP] TeacherEarlyWarning already wired into {APP_TSX_PATH}")
else:
    with open(APP_TSX_PATH, "r", encoding="utf-8") as f:
        app_content = f.read()

    import_marker = "import TeacherContentGenerator from './pages/teacher/TeacherContentGenerator';\n"
    if import_marker not in app_content:
        raise SystemExit(
            "[FAIL] Could not find the TeacherContentGenerator import line in App.tsx.\n"
            "       Run: grep -n 'TeacherContentGenerator' App.tsx and paste the output."
        )
    app_content = app_content.replace(
        import_marker,
        import_marker + "import TeacherEarlyWarning from './pages/teacher/TeacherEarlyWarning';\n",
        1,
    )

    route_marker = '<Route path="/teacher/content-generator" element={<TeacherContentGenerator />} />\n'
    if app_content.count(route_marker) != 1:
        raise SystemExit(
            "[FAIL] Could not find exactly one /teacher/content-generator route line in App.tsx."
        )
    app_content = app_content.replace(
        route_marker,
        route_marker + '                <Route path="/teacher/early-warning" element={<TeacherEarlyWarning />} />\n',
        1,
    )

    with open(APP_TSX_PATH, "w", encoding="utf-8") as f:
        f.write(app_content)
    print(f"[OK] App.tsx import + route -> {APP_TSX_PATH}")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
