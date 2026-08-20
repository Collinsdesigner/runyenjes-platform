import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Payment {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
}

interface Invoice {
  id: string;
  description: string;
  amount: string;
  status: string;
  dueDate: string | null;
  student: { id: string; name: string; email: string; admissionNumber: string | null };
  term: { id: string; name: string };
  payments: Payment[];
}

export default function FinanceInvoices() {
  const { token } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeTermId, setActiveTermId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [studentId, setStudentId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payReference, setPayReference] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [invoiceData, term] = await Promise.all([
        api('/finance/invoices', { token }),
        api('/terms/active').catch(() => null),
      ]);
      setInvoices(invoiceData);
      if (term?.id) setActiveTermId(term.id);
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

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!studentId || !description || !amount) {
      setError('Student ID, description and amount are required');
      return;
    }
    if (!activeTermId) {
      setError('No active term is open right now — open one from Registrar > Terms first');
      return;
    }
    try {
      await api('/finance/invoices', {
        method: 'POST',
        token,
        body: {
          studentId: studentId.trim(),
          termId: activeTermId,
          description,
          amount: Number(amount),
          dueDate: dueDate || undefined,
        },
      });
      setMessage('Invoice created');
      setStudentId('');
      setDescription('');
      setAmount('');
      setDueDate('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invoice');
    }
  }

  async function handleRecordPayment(invoiceId: string) {
    setError('');
    setMessage('');
    if (!payAmount || !payMethod) {
      setError('Payment amount and method are required');
      return;
    }
    try {
      await api(`/finance/invoices/${invoiceId}/payments`, {
        method: 'POST',
        token,
        body: { amount: Number(payAmount), method: payMethod, reference: payReference || undefined },
      });
      setMessage('Payment recorded');
      setPayingId(null);
      setPayAmount('');
      setPayMethod('CASH');
      setPayReference('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    }
  }

  return (
    <PortalLayout title="Invoices & Payments">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices & Payments</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bill a student for the active term, then record payments as they come in.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateInvoice} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Invoice</h3>
          <p className="text-xs text-gray-400">
            Student ID is the student's account ID (ask Registrar/Admin for it, or pull it from Admin &gt; Users).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Student ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Amount (KES)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
              placeholder="Description (e.g. Term 2 tuition fee)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Invoice
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Student</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Paid</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading...</td>
                </tr>
              )}
              {!loading && invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">No invoices yet</td>
                </tr>
              )}
              {invoices.map((inv) => {
                const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                return (
                  <>
                    <tr key={inv.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">{inv.student?.name}</td>
                      <td className="px-4 py-2">{inv.description}</td>
                      <td className="px-4 py-2">{inv.amount}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{inv.status}</span>
                      </td>
                      <td className="px-4 py-2">{paid}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          className="text-rgreen text-xs font-medium"
                          onClick={() => setPayingId(payingId === inv.id ? null : inv.id)}
                        >
                          {payingId === inv.id ? 'Cancel' : 'Record payment'}
                        </button>
                      </td>
                    </tr>
                    {payingId === inv.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2 items-center">
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-32"
                              placeholder="Amount"
                              type="number"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                            />
                            <select
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value)}
                            >
                              <option value="CASH">Cash</option>
                              <option value="MPESA">M-Pesa</option>
                              <option value="BANK">Bank</option>
                              <option value="CHEQUE">Cheque</option>
                              <option value="OTHER">Other</option>
                            </select>
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-40"
                              placeholder="Reference (optional)"
                              value={payReference}
                              onChange={(e) => setPayReference(e.target.value)}
                            />
                            <button
                              className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                              onClick={() => handleRecordPayment(inv.id)}
                            >
                              Save Payment
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
