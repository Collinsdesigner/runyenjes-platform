import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Payment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  createdAt: string;
}

interface Application {
  id: string;
  applicantName: string;
  email: string;
  phone: string;
  intake: string;
  status: string;
  admissionNumber: string | null;
  createdAt: string;
  payments: Payment[];
  program: { name: string; level: string | null; department: { name: string } };
}

const ALLOWED_ROLES = ['REGISTRAR', 'ADMIN', 'FOUNDER'];

export default function Admissions() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastAdmission, setLastAdmission] = useState<string | null>(null);

  async function loadApplications() {
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
    if (user && ALLOWED_ROLES.includes(user.role)) {
      loadApplications();
    }
  }, [user]);

  // Not logged in, or logged in with the wrong role — this is Registrar/Admin/Founder only
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        as Registrar, Admin, or Founder to view this page.
      </div>
    );
  }
  if (!ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        This page is only available to Registrar, Admin, or Founder accounts.
      </div>
    );
  }

  async function updateStatus(id: string, status: 'ADMITTED' | 'REJECTED' | 'WAITLISTED') {
    setBusyId(id);
    setLastAdmission(null);
    try {
      const result = await api(`/applications/${id}/status`, {
        method: 'PATCH',
        body: { status },
        token,
      });
      if (status === 'ADMITTED' && result.student) {
        setLastAdmission(
          `${result.student.name} admitted — admission number: ${result.student.admissionNumber}`
        );
      }
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update application');
    } finally {
      setBusyId(null);
    }
  }

  async function verifyPayment(paymentId: string, status: 'verified' | 'rejected') {
    setBusyId(paymentId);
    try {
      await api(`/applications/payments/${paymentId}/verify`, {
        method: 'PATCH',
        body: { status },
        token,
      });
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update payment');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-rgreen">Admissions Review</h1>
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">
          Back to Home
        </button>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-3">
        {lastAdmission && (
          <div className="bg-green-50 text-green-800 text-sm p-3 rounded-md">
            ✔ {lastAdmission}
          </div>
        )}
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

        {loading ? (
          <p className="text-sm text-gray-400 text-center">Loading applications…</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">No applications yet.</p>
        ) : (
          applications.map((app) => (
            <div key={app.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{app.applicantName}</p>
                  <p className="text-xs text-gray-500">{app.email} · {app.phone}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {app.program.name}
                    {app.program.level ? ` — ${app.program.level}` : ''} ·{' '}
                    {app.program.department.name}
                  </p>
                  <p className="text-xs text-gray-400">Intake: {app.intake}</p>
                  {app.admissionNumber && (
                    <p className="text-xs font-medium text-rgreen mt-1">
                      Admission No: {app.admissionNumber}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    app.status === 'ADMITTED'
                      ? 'bg-green-100 text-green-700'
                      : app.status === 'REJECTED'
                      ? 'bg-red-100 text-red-700'
                      : app.status === 'WAITLISTED'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {app.status}
                </span>
              </div>

              {app.status !== 'ADMITTED' && (
                <div className="flex gap-2 mt-3">
                  <button
                    disabled={busyId === app.id}
                    onClick={() => updateStatus(app.id, 'ADMITTED')}
                    className="text-xs bg-rgreen text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                  >
                    Admit
                  </button>
                  {app.status !== 'WAITLISTED' && (
                    <button
                      disabled={busyId === app.id}
                      onClick={() => updateStatus(app.id, 'WAITLISTED')}
                      className="text-xs bg-yellow-500 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                    >
                      Waitlist
                    </button>
                  )}
                  {app.status !== 'REJECTED' && (
                    <button
                      disabled={busyId === app.id}
                      onClick={() => updateStatus(app.id, 'REJECTED')}
                      className="text-xs bg-rmaroon text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                    >
                      Reject
                    </button>
                  )}
                </div>
              )}

              {app.payments.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-medium text-gray-600">Payments</p>
                  {app.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">
                        KES {Number(p.amount).toLocaleString()} · {p.method}
                        {p.reference ? ` · Ref: ${p.reference}` : ''}
                      </span>
                      {p.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            disabled={busyId === p.id}
                            onClick={() => verifyPayment(p.id, 'verified')}
                            className="bg-rgreen text-white px-2 py-1 rounded-md disabled:opacity-50"
                          >
                            Verify
                          </button>
                          <button
                            disabled={busyId === p.id}
                            onClick={() => verifyPayment(p.id, 'rejected')}
                            className="bg-rmaroon text-white px-2 py-1 rounded-md disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-full font-medium ${
                            p.status === 'verified'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {p.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
