#!/usr/bin/env python3
"""
Adds Admin -> Finance:
  1. AdminFinance.tsx -> new page (reuses EXISTING /finance/invoices GET
                         and POST /finance/invoices/:id/payments -- Admin
                         is already authorized on both, no backend change)
  2. App.tsx -> import + route

No schema change, no new backend route, no migration needed.
Safe to re-run: checks whether already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")
FRONTEND = os.path.join(ROOT, "frontend", "src")

APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "admin")
ADMIN_FINANCE_PATH = os.path.join(PAGES_DIR, "AdminFinance.tsx")


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
# 1. AdminFinance.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(ADMIN_FINANCE_PATH):
    print(f"[SKIP] {ADMIN_FINANCE_PATH} already exists -- not overwriting")
else:
    admin_finance_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Payment {
  amount: string;
}

interface InvoiceRow {
  id: string;
  description: string;
  amount: string;
  status: string;
  student: { name: string; admissionNumber: string | null };
  term: { name: string };
  payments: Payment[];
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
const METHODS = ['CASH', 'MPESA', 'BANK', 'CHEQUE', 'OTHER'];

export default function AdminFinance() {
  const { token } = useAuth();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/finance/invoices', { token });
      setInvoices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invoices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function balanceOf(inv: InvoiceRow) {
    const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return Number(inv.amount) - paid;
  }

  const filtered = statusFilter === 'ALL' ? invoices : invoices.filter((i) => i.status === statusFilter);
  const totalOutstanding = invoices
    .filter((i) => ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status))
    .reduce((sum, i) => sum + balanceOf(i), 0);

  async function handleRecordPayment(invoiceId: string) {
    if (!paymentAmount) {
      setError('Enter a payment amount');
      return;
    }
    setError('');
    setMessage('');
    try {
      await api(`/finance/invoices/${invoiceId}/payments`, {
        method: 'POST',
        token,
        body: {
          amount: Number(paymentAmount),
          method: paymentMethod,
          reference: paymentReference || undefined,
        },
      });
      setMessage('Payment recorded');
      setPaymentAmount('');
      setPaymentReference('');
      setOpenInvoiceId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
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
        body: { action: 'finance_outstanding_invoices' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Finance">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Finance</h2>
            <p className="text-sm text-gray-500 mt-1">Institution-wide invoice oversight.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Outstanding Invoices'}
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

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-xs text-gray-500">Total Outstanding Balance</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">KES {totalOutstanding}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                statusFilter === s ? 'bg-rgreen text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No invoices match this filter.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {filtered.map((inv) => (
              <div key={inv.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {inv.student.name} — {inv.description}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {inv.student.admissionNumber || 'No admission number'} · {inv.term.name}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-gray-800">Balance: KES {balanceOf(inv)}</div>
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{inv.status}</span>
                  </div>
                </div>

                {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                  <div className="mt-3">
                    {openInvoiceId === inv.id ? (
                      <div className="border-t border-gray-100 pt-3 flex flex-wrap gap-2 items-center">
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="Amount"
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28"
                        />
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        >
                          {METHODS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <input
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Reference (optional)"
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleRecordPayment(inv.id)}
                          className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                        >
                          Save Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenInvoiceId(null)}
                          className="text-xs text-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenInvoiceId(inv.id)}
                        className="text-xs font-medium text-rgreen"
                      >
                        Record Payment
                      </button>
                    )}
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
    with open(ADMIN_FINANCE_PATH, "w", encoding="utf-8") as f:
        f.write(admin_finance_content)
    print(f"[OK] Created {ADMIN_FINANCE_PATH}")

# ------------------------------------------------------------------
# 2. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "AdminFinance"):
    print(f"[SKIP] AdminFinance already wired into {APP_TSX_PATH}")
else:
    app_import_anchor = "import AdminAcademic from './pages/admin/AdminAcademic';\n"
    app_import_new = (
        "import AdminAcademic from './pages/admin/AdminAcademic';\n"
        "import AdminFinance from './pages/admin/AdminFinance';\n"
    )
    replace_once(APP_TSX_PATH, app_import_anchor, app_import_new, "App.tsx import")

    app_route_anchor = '                <Route path="/admin/academic" element={<AdminAcademic />} />\n'
    app_route_new = (
        '                <Route path="/admin/academic" element={<AdminAcademic />} />\n'
        '                <Route path="/admin/finance" element={<AdminFinance />} />\n'
    )
    replace_once(APP_TSX_PATH, app_route_anchor, app_route_new, "App.tsx route")

print("\nDone. Next: npx tsc --noEmit in frontend/ (no backend/migration change needed).")
