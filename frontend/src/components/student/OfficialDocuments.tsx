import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ExamCardStatus {
  eligible: boolean;
  reason: string | null;
  termName: string | null;
  paidPercent: number;
  requiredPercent: number;
  balance: number;
}

interface PaymentRow {
  id: string;
  receiptNo: string;
  paidAt: string;
  amount: number;
  method: string;
  description: string;
  termName: string;
}

interface Overview {
  resultTerms: { id: string; name: string }[];
  payments: PaymentRow[];
  examCard: ExamCardStatus;
}

const BTN = 'bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap';

export default function OfficialDocuments() {
  const { token } = useAuth();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [termId, setTermId] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/student/documents/overview', { token })
      .then((data) => setOverview(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your documents'))
      .finally(() => setLoading(false));
  }, [token]);

  async function download(key: string, path: string, filename: string) {
    setBusy(key);
    setError('');
    try {
      await downloadFile(path, token, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  const slipPath = '/student/documents/results-slip' + (termId ? '?termId=' + encodeURIComponent(termId) : '');

  return (
    <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="font-semibold text-gray-900 dark:text-gray-100">Official Documents</div>
        <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">Download your results slip, fee statement, receipts and exam card as PDF.</p>
      </div>

      {error && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 p-4 dark:text-gray-500">Loading...</p>
      ) : !overview ? null : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {/* Results slip */}
          <div className="px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Results Slip</div>
              <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                {overview.resultTerms.length === 0 ? 'No results have been recorded yet.' : 'Your recorded exam scores.'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {overview.resultTerms.length > 1 && (
                <select
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="">All terms</option>
                  {overview.resultTerms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className={BTN}
                disabled={busy !== null || overview.resultTerms.length === 0}
                onClick={() => download('slip', slipPath, 'Results_Slip.pdf')}
              >
                {busy === 'slip' ? 'Preparing...' : 'Download'}
              </button>
            </div>
          </div>

          {/* Fee statement */}
          <div className="px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Fee Statement</div>
              <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">All invoices and payments on your account.</div>
            </div>
            <button
              type="button"
              className={BTN}
              disabled={busy !== null}
              onClick={() => download('fees', '/student/documents/fee-statement', 'Fee_Statement.pdf')}
            >
              {busy === 'fees' ? 'Preparing...' : 'Download'}
            </button>
          </div>

          {/* Exam card */}
          <div className="px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Exam Card{overview.examCard.termName ? ' - ' + overview.examCard.termName : ''}
              </div>
              {overview.examCard.eligible ? (
                <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">You are cleared to download your exam card.</div>
              ) : (
                <div className="text-xs text-amber-700 mt-1 dark:text-amber-400">{overview.examCard.reason}</div>
              )}
            </div>
            <button
              type="button"
              className={BTN}
              disabled={busy !== null || !overview.examCard.eligible}
              onClick={() => download('card', '/student/documents/exam-card', 'Exam_Card.pdf')}
            >
              {busy === 'card' ? 'Preparing...' : 'Download'}
            </button>
          </div>

          {/* Receipts */}
          <div className="px-4 py-4">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Payment Receipts</div>
            {overview.payments.length === 0 ? (
              <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">No payments have been recorded yet.</div>
            ) : (
              <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg dark:divide-gray-800 dark:border-gray-800">
                {overview.payments.map((p) => (
                  <div key={p.id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        KES {p.amount.toLocaleString()} <span className="text-xs text-gray-400 dark:text-gray-500">({p.method})</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {p.receiptNo} · {p.description} · {p.termName} · {new Date(p.paidAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-sm font-medium text-rgreen disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() => download('r-' + p.id, '/student/documents/receipt/' + encodeURIComponent(p.id), p.receiptNo + '.pdf')}
                    >
                      {busy === 'r-' + p.id ? 'Preparing...' : 'Download'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
