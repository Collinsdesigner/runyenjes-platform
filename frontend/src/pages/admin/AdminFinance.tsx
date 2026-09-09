import { useEffect, useState } from 'react';
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
