import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { REQUEST_TYPE_LABELS, RequestType, roleLabel } from './requestTypes';

interface Stage {
  id: string;
  order: number;
  approverRole: string;
  status: string;
}

interface Submitter {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
}

interface RequestRow {
  id: string;
  type: RequestType;
  status: string;
  currentStage: number;
  createdAt: string;
  payload: Record<string, unknown> | null;
  stages: Stage[];
  submitter: Submitter;
}

export default function RequestApprovals() {
  const { token } = useAuth();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/requests/inbox', { token });
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your approvals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(id: string, action: 'approve' | 'reject') {
    setError('');
    setMessage('');
    setBusyId(id);
    try {
      await api('/requests/' + id + '/' + action, {
        method: 'POST',
        token,
        body: { comment: comments[id]?.trim() || undefined },
      });
      setMessage(action === 'approve' ? 'Request approved.' : 'Request rejected.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your decision');
    } finally {
      setBusyId(null);
    }
  }

  function payloadPreview(r: RequestRow): string | null {
    if (r.type === 'ACADEMIC_REQUISITION' && r.payload && typeof r.payload.documentType === 'string') {
      return 'Requested document: ' + r.payload.documentType;
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Approvals</h2>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Requests currently awaiting your decision.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm dark:bg-green-950 dark:border-green-800 dark:text-green-300">
          {message}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
        {loading ? (
          <p className="text-sm text-gray-400 p-4 dark:text-gray-500">Loading...</p>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">Nothing awaiting your decision right now.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {requests.map((r) => {
              const stage = r.stages.slice().sort((a, b) => a.order - b.order)[r.currentStage];
              const preview = payloadPreview(r);
              return (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {REQUEST_TYPE_LABELS[r.type]}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                        {r.submitter.name}
                        {r.submitter.admissionNumber ? ' · ' + r.submitter.admissionNumber : ''} · Submitted{' '}
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                      {preview && <div className="text-xs text-gray-600 mt-1 dark:text-gray-300">{preview}</div>}
                    </div>
                    {stage && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium dark:bg-amber-900 dark:text-amber-200">
                        Stage {r.currentStage + 1} of {r.stages.length} — {roleLabel(stage.approverRole)}
                      </span>
                    )}
                  </div>

                  <textarea
                    value={comments[r.id] || ''}
                    onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
                    placeholder="Optional comment"
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decide(r.id, 'approve')}
                      disabled={busyId === r.id}
                      className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      {busyId === r.id ? 'Working...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(r.id, 'reject')}
                      disabled={busyId === r.id}
                      className="bg-white border border-red-300 text-red-600 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 dark:bg-gray-900"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
