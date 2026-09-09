#!/usr/bin/env python3
"""
Adds Student -> My Academics, Fees & Payments, Results:
  1. ai.routes.ts        -> new 'student_results_summary' quick action
                            (the 'student_fees' action already exists --
                            reused as-is, no change needed there)
  2. student.routes.ts   -> new file: GET /academics, GET /fees, GET /results
  3. index.ts             -> import + mount at /student
  4. StudentAcademics.tsx, StudentFees.tsx, StudentResults.tsx -> new pages
  5. App.tsx              -> imports + routes

All three use data that already exists (Enrollment/UnitRegistration,
Invoice/FeePayment, ExamResult) -- no schema change, no migration needed.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

AI_ROUTES_PATH = os.path.join(BACKEND, "routes", "ai.routes.ts")
STUDENT_ROUTES_PATH = os.path.join(BACKEND, "routes", "student.routes.ts")
INDEX_TS_PATH = os.path.join(BACKEND, "index.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "student")


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
# 1. ai.routes.ts -- new student_results_summary quick action
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "student_results_summary"):
    print(f"[SKIP] student_results_summary already present -> {AI_ROUTES_PATH}")
else:
    anchor = (
        "      return `Here is attendance across this teacher's units this term:"
        "\\n${lines.join('\\n')}\\n\\nFlag students with frequent absences and any noticeable trends.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    new_block = (
        "      return `Here is attendance across this teacher's units this term:"
        "\\n${lines.join('\\n')}\\n\\nFlag students with frequent absences and any noticeable trends.`;\n"
        "    },\n"
        "  },\n\n"
        "  student_results_summary: {\n"
        "    roles: ['STUDENT'],\n"
        "    systemPrompt:\n"
        "      'You help a TVET student understand their own exam results. Be encouraging, clear, and specific "
        "about strengths and areas to improve.',\n"
        "    build: async (userId) => {\n"
        "      const results = await prisma.examResult.findMany({\n"
        "        where: { studentId: userId },\n"
        "        include: { exam: { include: { unit: true } } },\n"
        "        orderBy: { createdAt: 'desc' },\n"
        "      });\n"
        "      if (results.length === 0) return 'This student has no recorded exam results yet.';\n\n"
        "      const lines = results.map(\n"
        "        (r) => `- ${r.exam.name} (${r.exam.unit.name}): ${r.score}/${r.exam.maxScore}`\n"
        "      );\n\n"
        "      return `Here are this student's exam results:\\n${lines.join('\\n')}\\n\\n"
        "Summarize their performance, highlight strengths, and suggest 1-2 areas to focus on.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    replace_once(AI_ROUTES_PATH, anchor, new_block, "ai.routes.ts student_results_summary action")

# ------------------------------------------------------------------
# 2. student.routes.ts -- new file
# ------------------------------------------------------------------
if os.path.exists(STUDENT_ROUTES_PATH):
    print(f"[SKIP] {STUDENT_ROUTES_PATH} already exists -- not overwriting")
else:
    student_routes_content = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- My Academics: enrollment + this term's unit registrations ----------
router.get('/academics', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: req.user!.userId },
    include: { program: { include: { department: true } } },
  });

  const term = await prisma.term.findFirst({ where: { isActive: true } });

  const registrations = term
    ? await prisma.unitRegistration.findMany({
        where: { studentId: req.user!.userId, termId: term.id },
        include: { unit: true },
      })
    : [];

  res.json({
    term: term?.name || null,
    enrollments: enrollments.map((e) => ({
      programName: e.program.name,
      programLevel: e.program.level,
      departmentName: e.program.department.name,
      status: e.status,
    })),
    registrations: registrations.map((r) => ({
      unitName: r.unit.name,
      status: r.status,
    })),
  });
});

// ---------- Fees & Payments: my invoices + payments ----------
router.get('/fees', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { studentId: req.user!.userId },
    include: { payments: true, term: true },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = invoices.map((inv) => {
    const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return {
      id: inv.id,
      description: inv.description,
      termName: inv.term.name,
      amount: inv.amount,
      paid,
      balance: Number(inv.amount) - paid,
      status: inv.status,
      dueDate: inv.dueDate,
    };
  });

  res.json({ invoices: shaped });
});

// ---------- Results: my exam results ----------
router.get('/results', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const results = await prisma.examResult.findMany({
    where: { studentId: req.user!.userId },
    include: { exam: { include: { unit: true, term: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = results.map((r) => ({
    id: r.id,
    examName: r.exam.name,
    unitName: r.exam.unit.name,
    termName: r.exam.term.name,
    score: r.score,
    maxScore: r.exam.maxScore,
    grade: r.grade,
    remarks: r.remarks,
  }));

  res.json({ results: shaped });
});

export default router;
"""
    os.makedirs(os.path.dirname(STUDENT_ROUTES_PATH), exist_ok=True)
    with open(STUDENT_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(student_routes_content)
    print(f"[OK] Created {STUDENT_ROUTES_PATH}")

# ------------------------------------------------------------------
# 3. index.ts -- import + mount
# ------------------------------------------------------------------
if already_applied(INDEX_TS_PATH, "studentRoutes"):
    print(f"[SKIP] studentRoutes already wired into {INDEX_TS_PATH}")
else:
    index_import_anchor = "import teacherRoutes from './routes/teacher.routes';\n"
    index_import_new = (
        "import teacherRoutes from './routes/teacher.routes';\n"
        "import studentRoutes from './routes/student.routes';\n"
    )
    replace_once(INDEX_TS_PATH, index_import_anchor, index_import_new, "index.ts import")

    index_mount_anchor = "app.use('/teacher', teacherRoutes);\n"
    index_mount_new = (
        "app.use('/teacher', teacherRoutes);\n"
        "app.use('/student', studentRoutes);\n"
    )
    replace_once(INDEX_TS_PATH, index_mount_anchor, index_mount_new, "index.ts app.use")

# ------------------------------------------------------------------
# 4. Frontend pages
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

academics_path = os.path.join(PAGES_DIR, "StudentAcademics.tsx")
if os.path.exists(academics_path):
    print(f"[SKIP] {academics_path} already exists -- not overwriting")
else:
    academics_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface EnrollmentRow {
  programName: string;
  programLevel: string | null;
  departmentName: string;
  status: string;
}

interface RegistrationRow {
  unitName: string;
  status: string;
}

export default function StudentAcademics() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/student/academics', { token })
      .then((data) => {
        setTerm(data.term);
        setEnrollments(data.enrollments);
        setRegistrations(data.registrations);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your academics'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PortalLayout title="My Academics">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Academics</h2>
          <p className="text-sm text-gray-500 mt-1">Your programme enrollment and unit registrations.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-5 border-b border-gray-200 font-semibold text-gray-900">Programme Enrollment</div>
              <div className="divide-y divide-gray-100">
                {enrollments.length === 0 && <p className="text-sm text-gray-400 p-4">No enrollment on record.</p>}
                {enrollments.map((e, i) => (
                  <div key={i} className="px-5 py-4">
                    <div className="font-medium text-gray-900">
                      {e.programName} {e.programLevel || ''}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{e.departmentName}</div>
                    <span className="inline-block mt-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{e.status}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-5 border-b border-gray-200 font-semibold text-gray-900">
                {term ? `Registered Units (${term})` : 'Registered Units'}
              </div>
              <div className="divide-y divide-gray-100">
                {registrations.length === 0 && (
                  <p className="text-sm text-gray-400 p-4">No unit registrations this term.</p>
                )}
                {registrations.map((r, i) => (
                  <div key={i} className="px-5 py-4 flex items-center justify-between">
                    <span className="text-sm text-gray-800">{r.unitName}</span>
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{r.status}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(academics_path, "w", encoding="utf-8") as f:
        f.write(academics_content)
    print(f"[OK] Created {academics_path}")

fees_path = os.path.join(PAGES_DIR, "StudentFees.tsx")
if os.path.exists(fees_path):
    print(f"[SKIP] {fees_path} already exists -- not overwriting")
else:
    fees_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface InvoiceRow {
  id: string;
  description: string;
  termName: string;
  amount: string;
  paid: number;
  balance: number;
  status: string;
  dueDate: string | null;
}

export default function StudentFees() {
  const { token } = useAuth();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/student/fees', { token })
      .then((data) => setInvoices(data.invoices))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your fees'))
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
        body: { action: 'student_fees' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Fees & Payments">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Fees & Payments</h2>
            <p className="text-sm text-gray-500 mt-1">Your invoices and payments on record.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Explain My Balance'}
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
        ) : invoices.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No invoices on record yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900">{inv.description}</div>
                  <div className="text-xs text-gray-500 mt-1">{inv.termName}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-800">Balance: KES {inv.balance}</div>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{inv.status}</span>
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
    with open(fees_path, "w", encoding="utf-8") as f:
        f.write(fees_content)
    print(f"[OK] Created {fees_path}")

results_path = os.path.join(PAGES_DIR, "StudentResults.tsx")
if os.path.exists(results_path):
    print(f"[SKIP] {results_path} already exists -- not overwriting")
else:
    results_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ResultRow {
  id: string;
  examName: string;
  unitName: string;
  termName: string;
  score: string;
  maxScore: string;
  grade: string | null;
  remarks: string | null;
}

export default function StudentResults() {
  const { token } = useAuth();

  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/student/results', { token })
      .then((data) => setResults(data.results))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your results'))
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
        body: { action: 'student_results_summary' },
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
            <p className="text-sm text-gray-500 mt-1">Your exam results on record.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Summarize My Performance'}
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
        ) : results.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No results on record yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {results.map((r) => (
              <div key={r.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{r.examName}</div>
                  <div className="text-xs text-gray-500 mt-1">{r.unitName} · {r.termName}</div>
                </div>
                <div className="text-sm text-gray-800">{r.score}/{r.maxScore}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(results_path, "w", encoding="utf-8") as f:
        f.write(results_content)
    print(f"[OK] Created {results_path}")

# ------------------------------------------------------------------
# 5. App.tsx -- imports + routes
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "StudentAcademics"):
    print(f"[SKIP] Student pages already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import StudentAssignments from './pages/student/StudentAssignments';\n"
    app_import_new = (
        "import StudentAssignments from './pages/student/StudentAssignments';\n"
        "import StudentAcademics from './pages/student/StudentAcademics';\n"
        "import StudentFees from './pages/student/StudentFees';\n"
        "import StudentResults from './pages/student/StudentResults';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx imports")

    app_route_anchor = (
        '                <Route path="/student/assignments" element={<StudentAssignments />} />\n'
    )
    app_route_new = (
        '                <Route path="/student/assignments" element={<StudentAssignments />} />\n'
        '                <Route path="/student/academics" element={<StudentAcademics />} />\n'
        '                <Route path="/student/fees" element={<StudentFees />} />\n'
        '                <Route path="/student/results" element={<StudentResults />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx routes")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
