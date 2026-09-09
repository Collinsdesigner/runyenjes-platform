#!/usr/bin/env python3
"""
Adds Reports (shared between Registrar and Admin):
  1. ai.routes.ts       -> new 'institution_reports_summary' quick action (REGISTRAR + ADMIN)
  2. reports.routes.ts  -> new file: GET /reports/overview
  3. index.ts            -> import + mount at /reports
  4. Reports.tsx         -> new page
  5. App.tsx              -> import + two routes (/registrar/reports, /admin/reports)

All read-only over data that already exists (User, Department, Program,
Unit, Application, Invoice/FeePayment) -- no schema change, no migration.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

AI_ROUTES_PATH = os.path.join(BACKEND, "routes", "ai.routes.ts")
REPORTS_ROUTES_PATH = os.path.join(BACKEND, "routes", "reports.routes.ts")
INDEX_TS_PATH = os.path.join(BACKEND, "index.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "reports")


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
# 1. ai.routes.ts -- new institution_reports_summary quick action
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "institution_reports_summary"):
    print(f"[SKIP] institution_reports_summary already present -> {AI_ROUTES_PATH}")
else:
    anchor = (
        "      return `Here are this student's exam results:"
        "\\n${lines.join('\\n')}\\n\\nSummarize their performance, highlight strengths, "
        "and suggest 1-2 areas to focus on.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    new_block = (
        "      return `Here are this student's exam results:"
        "\\n${lines.join('\\n')}\\n\\nSummarize their performance, highlight strengths, "
        "and suggest 1-2 areas to focus on.`;\n"
        "    },\n"
        "  },\n\n"
        "  institution_reports_summary: {\n"
        "    roles: ['REGISTRAR', 'ADMIN'],\n"
        "    systemPrompt:\n"
        "      'You help TVET college leadership understand institution-wide reporting figures. "
        "Give a brief narrative summary with 2-3 suggested action items. Be concise and practical.',\n"
        "    build: async () => {\n"
        "      const [students, staffCounts, departments, programmes, units, admissionsByStatus, outstandingInvoices] "
        "= await Promise.all([\n"
        "        prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),\n"
        "        prisma.user.groupBy({\n"
        "          by: ['role'],\n"
        "          where: { status: 'ACTIVE', role: { notIn: ['STUDENT', 'ALUMNI'] } },\n"
        "          _count: { role: true },\n"
        "        }),\n"
        "        prisma.department.count(),\n"
        "        prisma.program.count(),\n"
        "        prisma.unit.count(),\n"
        "        prisma.application.groupBy({ by: ['status'], _count: { status: true } }),\n"
        "        prisma.invoice.findMany({\n"
        "          where: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },\n"
        "          include: { payments: true },\n"
        "        }),\n"
        "      ]);\n\n"
        "      const staffLines = staffCounts.map((s) => `${s.role}: ${s._count.role}`).join(', ');\n"
        "      const admissionLines = admissionsByStatus.map((a) => `${a.status}: ${a._count.status}`).join(', ');\n"
        "      const outstandingBalance = outstandingInvoices.reduce((sum, inv) => {\n"
        "        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);\n"
        "        return sum + (Number(inv.amount) - paid);\n"
        "      }, 0);\n\n"
        "      return `Institution reporting figures:\\n"
        "- Active students: ${students}\\n"
        "- Active staff by role: ${staffLines || 'none'}\\n"
        "- Departments: ${departments}, Programmes: ${programmes}, Units: ${units}\\n"
        "- Applications by status: ${admissionLines || 'none'}\\n"
        "- Outstanding invoices: ${outstandingInvoices.length}, total balance: KES ${outstandingBalance}\\n\\n"
        "Write a short narrative summary with 2-3 suggested action items.`;\n"
        "    },\n"
        "  },\n"
        "};\n"
    )
    replace_once(AI_ROUTES_PATH, anchor, new_block, "ai.routes.ts institution_reports_summary action")

# ------------------------------------------------------------------
# 2. reports.routes.ts -- new file
# ------------------------------------------------------------------
if os.path.exists(REPORTS_ROUTES_PATH):
    print(f"[SKIP] {REPORTS_ROUTES_PATH} already exists -- not overwriting")
else:
    reports_routes_content = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Institution reporting overview (Registrar + Admin) ----------
router.get('/overview', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const [students, staffCounts, departments, programmes, units, admissionsByStatus, outstandingInvoices] =
    await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      prisma.user.groupBy({
        by: ['role'],
        where: { status: 'ACTIVE', role: { notIn: ['STUDENT', 'ALUMNI'] } },
        _count: { role: true },
      }),
      prisma.department.count(),
      prisma.program.count(),
      prisma.unit.count(),
      prisma.application.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.invoice.findMany({
        where: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
        include: { payments: true },
      }),
    ]);

  const outstandingBalance = outstandingInvoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + (Number(inv.amount) - paid);
  }, 0);

  res.json({
    students,
    staffByRole: staffCounts.map((s) => ({ role: s.role, count: s._count.role })),
    departments,
    programmes,
    units,
    admissionsByStatus: admissionsByStatus.map((a) => ({ status: a.status, count: a._count.status })),
    outstandingInvoiceCount: outstandingInvoices.length,
    outstandingBalance,
  });
});

export default router;
"""
    os.makedirs(os.path.dirname(REPORTS_ROUTES_PATH), exist_ok=True)
    with open(REPORTS_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(reports_routes_content)
    print(f"[OK] Created {REPORTS_ROUTES_PATH}")

# ------------------------------------------------------------------
# 3. index.ts -- import + mount
# ------------------------------------------------------------------
if already_applied(INDEX_TS_PATH, "reportsRoutes"):
    print(f"[SKIP] reportsRoutes already wired into {INDEX_TS_PATH}")
else:
    index_import_anchor = "import studentRoutes from './routes/student.routes';\n"
    index_import_new = (
        "import studentRoutes from './routes/student.routes';\n"
        "import reportsRoutes from './routes/reports.routes';\n"
    )
    replace_once(INDEX_TS_PATH, index_import_anchor, index_import_new, "index.ts import")

    index_mount_anchor = "app.use('/student', studentRoutes);\n"
    index_mount_new = (
        "app.use('/student', studentRoutes);\n"
        "app.use('/reports', reportsRoutes);\n"
    )
    replace_once(INDEX_TS_PATH, index_mount_anchor, index_mount_new, "index.ts app.use")

# ------------------------------------------------------------------
# 4. Reports.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)
reports_page_path = os.path.join(PAGES_DIR, "Reports.tsx")

if os.path.exists(reports_page_path):
    print(f"[SKIP] {reports_page_path} already exists -- not overwriting")
else:
    reports_page_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Overview {
  students: number;
  staffByRole: { role: string; count: number }[];
  departments: number;
  programmes: number;
  units: number;
  admissionsByStatus: { status: string; count: number }[];
  outstandingInvoiceCount: number;
  outstandingBalance: number;
}

export default function Reports() {
  const { token } = useAuth();

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/reports/overview', { token })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load reports'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAskAI() {
    setAiLoading(true);
    setAiError('');
    setAiReply('');
    try {
      const result = await api('/ai/assist', {
        method: 'POST',
        token,
        body: { action: 'institution_reports_summary' },
      });
      setAiReply(result.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Reports">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
            <p className="text-sm text-gray-500 mt-1">Institution-wide reporting figures.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Summarize Reports'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {aiError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{aiError}</div>}
        {aiReply && (
          <div className="bg-green-50 border border-green-200 text-gray-800 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="text-xs text-gray-500">Active Students</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{data.students}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="text-xs text-gray-500">Departments / Programmes / Units</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {data.departments} / {data.programmes} / {data.units}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="text-xs text-gray-500">Outstanding Invoices</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {data.outstandingInvoiceCount} (KES {data.outstandingBalance})
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 md:col-span-2">
              <div className="font-semibold text-gray-900 mb-3">Staff by Role</div>
              <div className="space-y-1">
                {data.staffByRole.length === 0 && <p className="text-sm text-gray-400">No active staff on record.</p>}
                {data.staffByRole.map((s) => (
                  <div key={s.role} className="flex justify-between text-sm">
                    <span className="text-gray-700">{s.role}</span>
                    <span className="text-gray-500">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="font-semibold text-gray-900 mb-3">Applications by Status</div>
              <div className="space-y-1">
                {data.admissionsByStatus.length === 0 && <p className="text-sm text-gray-400">No applications on record.</p>}
                {data.admissionsByStatus.map((a) => (
                  <div key={a.status} className="flex justify-between text-sm">
                    <span className="text-gray-700">{a.status}</span>
                    <span className="text-gray-500">{a.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(reports_page_path, "w", encoding="utf-8") as f:
        f.write(reports_page_content)
    print(f"[OK] Created {reports_page_path}")

# ------------------------------------------------------------------
# 5. App.tsx -- import + two routes
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "pages/reports/Reports"):
    print(f"[SKIP] Reports already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import Notebook from './pages/notebook/Notebook';\n"
    app_import_new = (
        "import Notebook from './pages/notebook/Notebook';\n"
        "import Reports from './pages/reports/Reports';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx import")

    app_route_anchor = '                <Route path="/notebook" element={<Notebook />} />\n'
    app_route_new = (
        '                <Route path="/notebook" element={<Notebook />} />\n'
        '                <Route path="/registrar/reports" element={<Reports />} />\n'
        '                <Route path="/admin/reports" element={<Reports />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx routes")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
