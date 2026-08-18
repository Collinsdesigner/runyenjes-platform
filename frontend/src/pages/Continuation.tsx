import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import PortalLayout from '../components/portal/PortalLayout';

interface Term {
  id: string;
  name: string;
  startDate: string;
  isActive: boolean;
}

interface RosterEntry {
  id: string;
  name: string;
  email: string;
  admissionNumber: string;
  status: string;
  confirmedAt: string | null;
}

const ADMIN_ROLES = ['REGISTRAR', 'ADMIN'];

export default function Continuation() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [activeTerm, setActiveTerm] = useState<Term | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingForId, setConfirmingForId] = useState<string | null>(null);

  // For Admin/Founder: open a new term
  const [newTermName, setNewTermName] = useState('');
  const [newTermStart, setNewTermStart] = useState('');

  const isStaffReviewer = user && ADMIN_ROLES.includes(user.role);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (isStaffReviewer) {
        const data = await api('/terms/status', { token });
        setActiveTerm(data.term);
        setRoster(data.roster);
      } else {
        const term = await api('/terms/active');
        setActiveTerm(term);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load term info');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setConfirming(true);
    setError(null);
    try {
      const result = await api('/terms/confirm', {
        method: 'POST',
        body: { admissionNumber: confirmInput },
        token,
      });
      setMyStatus(result.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm');
    } finally {
      setConfirming(false);
    }
  }

  async function handleConfirmFor(studentId: string) {
    setConfirmingForId(studentId);
    setError(null);
    try {
      await api(`/terms/confirm-for/${studentId}`, { method: 'POST', token });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm on their behalf');
    } finally {
      setConfirmingForId(null);
    }
  }

  async function handleOpenTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!newTermName || !newTermStart) return;
    setError(null);
    try {
      await api('/terms', {
        method: 'POST',
        body: { name: newTermName, startDate: newTermStart },
        token,
      });
      setNewTermName('');
      setNewTermStart('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open term');
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        to view this page.
      </div>
    );
  }

  return (
    <PortalLayout title="Term Continuation">
      <div className="max-w-3xl mx-auto space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

        {/* Admin/Founder: open a new term */}
        {user.role === 'ADMIN' ? (
          <form onSubmit={handleOpenTerm} className="bg-white rounded-lg shadow p-4 space-y-2">
            <p className="text-sm font-medium">Open a new term</p>
            <input
              value={newTermName}
              onChange={(e) => setNewTermName(e.target.value)}
              placeholder="e.g. Term 3 2026"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={newTermStart}
              onChange={(e) => setNewTermStart(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="bg-rgreen text-white text-sm px-4 py-1.5 rounded-md"
            >
              Open term
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-400 text-center">Loading…</p>
        ) : !activeTerm ? (
          <p className="text-sm text-gray-400 text-center">No active term is open right now.</p>
        ) : isStaffReviewer ? (
          // Registrar/Admin/Founder view — roster with manual confirm option
          <div className="bg-white rounded-lg shadow p-4">
            <p className="font-medium text-sm mb-3">
              {activeTerm.name} — continuation status
            </p>
            <div className="space-y-2">
              {roster.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.admissionNumber}</p>
                  </div>
                  {r.status === 'CONFIRMED' ? (
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">
                      CONFIRMED
                    </span>
                  ) : (
                    <button
                      disabled={confirmingForId === r.id}
                      onClick={() => handleConfirmFor(r.id)}
                      className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-rgreen hover:text-white disabled:opacity-50"
                      title="Confirm on their behalf (e.g. reported in person)"
                    >
                      {confirmingForId === r.id ? 'Confirming…' : 'PENDING — Confirm'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Student view — confirm button
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-sm font-medium mb-1">{activeTerm.name}</p>
            <p className="text-xs text-gray-500 mb-4">
              Confirm you're continuing your studies this term.
            </p>
            {myStatus === 'CONFIRMED' ? (
              <p className="text-sm text-green-700 font-medium">✔ You're confirmed for this term</p>
            ) : (
              <form onSubmit={handleConfirm} className="space-y-2">
                <p className="text-xs text-gray-500">
                  Type your admission number to confirm — this is your official continuation
                  record for the term.
                </p>
                <input
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="e.g. RTVC/2026/00001"
                  required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-center"
                />
                <button
                  type="submit"
                  disabled={confirming}
                  className="bg-rgreen text-white text-sm px-4 py-2 rounded-md disabled:opacity-50 w-full"
                >
                  {confirming ? 'Confirming…' : "Confirm I'm continuing"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
