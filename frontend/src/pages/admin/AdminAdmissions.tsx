import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Payment {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  status: string;
}

interface Application {
  id: string;
  applicantName: string;
  email: string;
  phone: string;
  intake: string;
  status: string;
  program: { id: string; name: string; department: { id: string; name: string } };
  payments: Payment[];
}

export default function AdminAdmissions() {
  const { token } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/applications', { token });
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load applications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleStatus(id: string, status: 'ADMITTED' | 'REJECTED' | 'WAITLISTED') {
    setError('');
    setMessage('');
    try {
      await api(`/applications/${id}/status`, { method: 'PATCH', token, body: { status } });
      setMessage(`Application ${status.toLowerCase()}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update application');
    }
  }

  async function handleVerifyPayment(paymentId: string, status: 'verified' | 'rejected') {
    setError('');
    setMessage('');
    try {
      await api(`/applications/payments/${paymentId}/verify`, { method: 'PATCH', token, body: { status } });
      setMessage(`Payment ${status}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update payment');
    }
  }

  const visible = statusFilter ? applications.filter((a) => a.status === statusFilter) : applications;

  return (
    <PortalLayout title="Admissions">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Admissions</h2>
          <p className="text-sm text-gray-500 mt-1">Review applications and verify payments.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="ADMITTED">Admitted</option>
          <option value="REJECTED">Rejected</option>
          <option value="WAITLISTED">Waitlisted</option>
          <option value="REPORTED">Reported</option>
        </select>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Applicant</th>
                <th className="px-4 py-2">Programme</th>
                <th className="px-4 py-2">Intake</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Payments</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No applications</td></tr>
              )}
              {visible.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{a.applicantName}</div>
                    <div className="text-xs text-gray-400">{a.email}</div>
                  </td>
                  <td className="px-4 py-2">{a.program?.name}</td>
                  <td className="px-4 py-2">{a.intake}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{a.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    {a.payments.length === 0 && <span className="text-xs text-gray-400">None</span>}
                    {a.payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-xs mb-1">
                        <span>
                          KES {p.amount} ({p.reference}) \u2014 {p.status}
                        </span>
                        {p.status === 'pending' && (
                          <>
                            <button
                              className="text-green-600 font-medium"
                              onClick={() => handleVerifyPayment(p.id, 'verified')}
                            >
                              Verify
                            </button>
                            <button
                              className="text-red-600 font-medium"
                              onClick={() => handleVerifyPayment(p.id, 'rejected')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {a.status === 'SUBMITTED' && (
                      <>
                        <button
                          className="text-green-600 text-xs font-medium"
                          onClick={() => handleStatus(a.id, 'ADMITTED')}
                        >
                          Admit
                        </button>
                        <button
                          className="text-amber-600 text-xs font-medium"
                          onClick={() => handleStatus(a.id, 'WAITLISTED')}
                        >
                          Waitlist
                        </button>
                        <button
                          className="text-red-600 text-xs font-medium"
                          onClick={() => handleStatus(a.id, 'REJECTED')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
