#!/usr/bin/env python3
"""
Adds Teacher -> Assessments + Results:
  1. ai.routes.ts       -> new 'teacher_unit_results_summary' quick action (TEACHER role)
  2. teacher.routes.ts  -> GET/POST /assessments, GET roster, POST results, GET /results overview
  3. TeacherAssessments.tsx -> new page: create exam + enter scores per exam
  4. TeacherResults.tsx     -> new page: read-only overview + AI summary button
  5. App.tsx -> imports + routes

Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

AI_ROUTES_PATH = os.path.join(BACKEND, "routes", "ai.routes.ts")
TEACHER_ROUTES_PATH = os.path.join(BACKEND, "routes", "teacher.routes.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "teacher")
ASSESSMENTS_PATH = os.path.join(PAGES_DIR, "TeacherAssessments.tsx")
RESULTS_PATH = os.path.join(PAGES_DIR, "TeacherResults.tsx")


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
# 1. ai.routes.ts -- new teacher_unit_results_summary quick action
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "teacher_unit_results_summary"):
    print(f"[SKIP] teacher_unit_results_summary already present -> {AI_ROUTES_PATH}")
else:
    anchor = (
        "      return `${details}\n\n"
        "Give this alumnus 3-4 practical, encouraging career development suggestions.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    new_block = (
        "      return `${details}\n\n"
        "Give this alumnus 3-4 practical, encouraging career development suggestions.`;\n"
        "    },\n"
        "  },\n\n"
        "  teacher_unit_results_summary: {\n"
        "    roles: ['TEACHER'],\n"
        "    systemPrompt:\n"
        "      'You help a TVET teacher understand exam/assessment results across the units they teach. "
        "Identify trends and flag students who may need extra support. Be concise.',\n"
        "    build: async (userId) => {\n"
        "      const term = await prisma.term.findFirst({ where: { isActive: true } });\n"
        "      if (!term) return 'No active academic term right now, so there is no results data to summarize.';\n\n"
        "      const myUnits = await prisma.unitLecturer.findMany({\n"
        "        where: { lecturerId: userId, termId: term.id },\n"
        "      });\n"
        "      const unitIds = myUnits.map((u) => u.unitId);\n"
        "      if (unitIds.length === 0) return 'This teacher has no assigned units this term.';\n\n"
        "      const exams = await prisma.exam.findMany({\n"
        "        where: { unitId: { in: unitIds }, termId: term.id },\n"
        "        include: { unit: true, results: { include: { student: { select: { name: true } } } } },\n"
        "      });\n"
        "      if (exams.length === 0) return 'No assessments recorded yet for this teacher\\'s units this term.';\n\n"
        "      const lines = exams.map((e) => {\n"
        "        if (e.results.length === 0) return `- \"${e.name}\" (${e.unit.name}): no results recorded yet`;\n"
        "        const scores = e.results.map((r) => Number(r.score));\n"
        "        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;\n"
        "        return `- \"${e.name}\" (${e.unit.name}): ${e.results.length} result(s), average ${avg.toFixed(1)}/${e.maxScore}`;\n"
        "      });\n\n"
        "      return `Here is a summary of assessments across this teacher's units this term:\\n${lines.join('\\n')}\\n\\nSummarize trends and flag any students who may need extra support.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    replace_once(AI_ROUTES_PATH, anchor, new_block, "ai.routes.ts teacher_unit_results_summary action")

# ------------------------------------------------------------------
# 2. teacher.routes.ts -- assessments + results routes
# ------------------------------------------------------------------
if already_applied(TEACHER_ROUTES_PATH, "/assessments"):
    print(f"[SKIP] /assessments routes already present -> {TEACHER_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ---------- Teacher: list assessments (exams) across my units this term ----------
router.get('/assessments', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json({ term: null, exams: [] });

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
  });
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return res.json({ term: term.name, exams: [] });

  const exams = await prisma.exam.findMany({
    where: { unitId: { in: unitIds }, termId: term.id },
    include: { unit: true, results: true },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = exams.map((e) => ({
    id: e.id,
    name: e.name,
    unitId: e.unitId,
    unitName: e.unit.name,
    examDate: e.examDate,
    maxScore: e.maxScore,
    resultCount: e.results.length,
  }));

  res.json({ term: term.name, exams: shaped });
});

// ---------- Teacher: create an assessment (exam) for one of my units ----------
router.post('/assessments', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { unitId, name, examDate, maxScore } = req.body;
  if (!unitId || !name) {
    return res.status(400).json({ error: 'unitId and name are required' });
  }

  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.status(400).json({ error: 'No active academic term right now' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId, termId: term.id },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You are not assigned to teach this unit this term' });
  }

  const exam = await prisma.exam.create({
    data: {
      unitId,
      termId: term.id,
      name,
      examDate: examDate ? new Date(examDate) : null,
      maxScore: maxScore || 100,
      createdById: req.user!.userId,
    },
  });

  res.status(201).json(exam);
});

// ---------- Teacher: roster for one of my exams, with any existing result ----------
router.get('/assessments/:examId/roster', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return res.status(404).json({ error: 'Assessment not found' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId: exam.unitId, termId: exam.termId },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You do not teach the unit for this assessment' });
  }

  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId: exam.unitId, termId: exam.termId, status: 'REGISTERED' },
    include: { student: { select: { id: true, name: true, admissionNumber: true } } },
  });

  const results = await prisma.examResult.findMany({ where: { examId } });
  const resultMap = new Map(results.map((r) => [r.studentId, r]));

  const roster = registrations.map((r) => ({
    studentId: r.studentId,
    name: r.student.name,
    admissionNumber: r.student.admissionNumber,
    score: resultMap.get(r.studentId)?.score ?? null,
    remarks: resultMap.get(r.studentId)?.remarks ?? null,
  }));

  res.json({ examName: exam.name, maxScore: exam.maxScore, roster });
});

// ---------- Teacher: record/update a result for one student on one of my exams ----------
router.post('/assessments/:examId/results', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { examId } = req.params;
  const { studentId, score, remarks } = req.body;

  if (!studentId || score === undefined || score === null) {
    return res.status(400).json({ error: 'studentId and score are required' });
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return res.status(404).json({ error: 'Assessment not found' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId: exam.unitId, termId: exam.termId },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You do not teach the unit for this assessment' });
  }

  const result = await prisma.examResult.upsert({
    where: { examId_studentId: { examId, studentId } },
    update: { score, remarks: remarks || null, recordedById: req.user!.userId },
    create: { examId, studentId, score, remarks: remarks || null, recordedById: req.user!.userId },
  });

  res.json(result);
});

// ---------- Teacher: read-only results overview across my units this term ----------
router.get('/results', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json({ term: null, exams: [] });

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
  });
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return res.json({ term: term.name, exams: [] });

  const exams = await prisma.exam.findMany({
    where: { unitId: { in: unitIds }, termId: term.id },
    include: {
      unit: true,
      results: { include: { student: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = exams.map((e) => ({
    id: e.id,
    name: e.name,
    unitName: e.unit.name,
    maxScore: e.maxScore,
    results: e.results.map((r) => ({ studentName: r.student.name, score: r.score, remarks: r.remarks })),
  }));

  res.json({ term: term.name, exams: shaped });
});

export default router;
'''
    replace_once(TEACHER_ROUTES_PATH, anchor, new_block, "teacher.routes.ts assessments+results routes")

# ------------------------------------------------------------------
# 3. TeacherAssessments.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(ASSESSMENTS_PATH):
    print(f"[SKIP] {ASSESSMENTS_PATH} already exists -- not overwriting")
else:
    assessments_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ExamRow {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  examDate: string | null;
  maxScore: number;
  resultCount: number;
}

interface RosterRow {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  score: number | null;
  remarks: string | null;
}

interface UnitOption {
  unitId: string;
  unitName: string;
}

export default function TeacherAssessments() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newUnitId, setNewUnitId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newMaxScore, setNewMaxScore] = useState('100');

  const [selectedExam, setSelectedExam] = useState<ExamRow | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [examData, unitData] = await Promise.all([
        api('/teacher/assessments', { token }),
        api('/teacher/units', { token }),
      ]);
      setTerm(examData.term);
      setExams(examData.exams);
      setUnits(unitData.units.map((u: any) => ({ unitId: u.unitId, unitName: u.unitName })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assessments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreate() {
    if (!newUnitId || !newName.trim()) {
      setError('Unit and assessment name are required');
      return;
    }
    setError('');
    setMessage('');
    try {
      await api('/teacher/assessments', {
        method: 'POST',
        token,
        body: {
          unitId: newUnitId,
          name: newName.trim(),
          examDate: newDate || undefined,
          maxScore: Number(newMaxScore) || 100,
        },
      });
      setMessage('Assessment created');
      setNewName('');
      setNewDate('');
      setNewMaxScore('100');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create assessment');
    }
  }

  async function selectExam(exam: ExamRow) {
    setSelectedExam(exam);
    setRosterLoading(true);
    setError('');
    try {
      const data = await api(`/teacher/assessments/${exam.id}/roster`, { token });
      setRoster(data.roster);
      const drafts: Record<string, string> = {};
      data.roster.forEach((r: RosterRow) => {
        drafts[r.studentId] = r.score !== null ? String(r.score) : '';
      });
      setScoreDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load roster');
    } finally {
      setRosterLoading(false);
    }
  }

  async function saveScore(studentId: string) {
    if (!selectedExam) return;
    const scoreValue = scoreDrafts[studentId];
    if (scoreValue === undefined || scoreValue === '') return;
    try {
      await api(`/teacher/assessments/${selectedExam.id}/results`, {
        method: 'POST',
        token,
        body: { studentId, score: Number(scoreValue) },
      });
      setMessage('Score saved');
      selectExam(selectedExam);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save score');
    }
  }

  return (
    <PortalLayout title="Assessments">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assessments</h2>
          <p className="text-sm text-gray-500 mt-1">
            {term ? `CATs and exams for your units this term (${term}).` : 'No active academic term right now.'}
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-gray-200 rounded-lg">
            <div className="p-5 border-b border-gray-200 space-y-3">
              <h3 className="font-semibold text-gray-900">New Assessment</h3>
              <select
                value={newUnitId}
                onChange={(e) => setNewUnitId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select unit</option>
                {units.map((u) => (
                  <option key={u.unitId} value={u.unitId}>{u.unitName}</option>
                ))}
              </select>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder='Name (e.g. "CAT 1")'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={newMaxScore}
                  onChange={(e) => setNewMaxScore(e.target.value)}
                  placeholder="Max score"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleCreate}
                className="w-full bg-rgreen text-white px-4 py-2 rounded-lg text-sm"
              >
                Create Assessment
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {loading && <p className="text-sm text-gray-400 p-4">Loading...</p>}
              {!loading && exams.length === 0 && <p className="text-sm text-gray-400 p-4">No assessments yet.</p>}
              {exams.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => selectExam(e)}
                  className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${
                    selectedExam?.id === e.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{e.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {e.unitName} · out of {e.maxScore} · {e.resultCount} result{e.resultCount === 1 ? '' : 's'} recorded
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg">
            <div className="p-5 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {selectedExam ? `Enter Scores — ${selectedExam.name}` : 'Enter Scores'}
              </h3>
              {!selectedExam && <p className="text-sm text-gray-500 mt-1">Select an assessment to enter scores.</p>}
            </div>
            {rosterLoading && <p className="text-sm text-gray-400 p-4">Loading roster...</p>}
            {!rosterLoading && selectedExam && roster.length === 0 && (
              <p className="text-sm text-gray-400 p-4">No students registered in this unit yet.</p>
            )}
            <div className="divide-y divide-gray-100">
              {roster.map((r) => (
                <div key={r.studentId} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{r.name}</div>
                    <div className="text-xs text-gray-400">{r.admissionNumber || 'No admission number'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      value={scoreDrafts[r.studentId] ?? ''}
                      onChange={(e) => setScoreDrafts({ ...scoreDrafts, [r.studentId]: e.target.value })}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      placeholder={`/${selectedExam?.maxScore ?? 100}`}
                    />
                    <button
                      type="button"
                      onClick={() => saveScore(r.studentId)}
                      className="text-xs font-medium text-rgreen"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
}
"""
    with open(ASSESSMENTS_PATH, "w", encoding="utf-8") as f:
        f.write(assessments_content)
    print(f"[OK] Created {ASSESSMENTS_PATH}")

# ------------------------------------------------------------------
# 4. TeacherResults.tsx -- new page
# ------------------------------------------------------------------
if os.path.exists(RESULTS_PATH):
    print(f"[SKIP] {RESULTS_PATH} already exists -- not overwriting")
else:
    results_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ResultRow {
  studentName: string;
  score: number;
  remarks: string | null;
}

interface ExamRow {
  id: string;
  name: string;
  unitName: string;
  maxScore: number;
  results: ResultRow[];
}

export default function TeacherResults() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/results', { token })
      .then((data) => {
        setTerm(data.term);
        setExams(data.exams);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load results'))
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
        body: { action: 'teacher_unit_results_summary' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Results">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Results</h2>
            <p className="text-sm text-gray-500 mt-1">
              {term ? `Results across your units this term (${term}).` : 'No active academic term right now.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Results Summary'}
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
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            Loading results...
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No assessments recorded yet for your units this term.
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((e) => (
              <div key={e.id} className="bg-white border border-gray-200 rounded-lg">
                <div className="p-4 border-b border-gray-200">
                  <div className="font-semibold text-gray-900">{e.name}</div>
                  <div className="text-xs text-gray-500">{e.unitName} · out of {e.maxScore}</div>
                </div>
                {e.results.length === 0 ? (
                  <p className="text-sm text-gray-400 p-4">No results recorded yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {e.results.map((r, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between text-sm">
                        <span className="text-gray-800">{r.studentName}</span>
                        <span className="text-gray-500">{r.score}/{e.maxScore}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        f.write(results_content)
    print(f"[OK] Created {RESULTS_PATH}")

# ------------------------------------------------------------------
# 5. App.tsx -- imports + routes
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "TeacherAssessments"):
    print(f"[SKIP] TeacherAssessments/TeacherResults already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import TeacherStudents from './pages/teacher/TeacherStudents';\n"
    app_import_new = (
        "import TeacherStudents from './pages/teacher/TeacherStudents';\n"
        "import TeacherAssessments from './pages/teacher/TeacherAssessments';\n"
        "import TeacherResults from './pages/teacher/TeacherResults';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx imports")

    app_route_anchor = '                <Route path="/teacher/students" element={<TeacherStudents />} />\n'
    app_route_new = (
        '                <Route path="/teacher/students" element={<TeacherStudents />} />\n'
        '                <Route path="/teacher/assessments" element={<TeacherAssessments />} />\n'
        '                <Route path="/teacher/results" element={<TeacherResults />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx routes")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- Exam/ExamResult already exist).")
