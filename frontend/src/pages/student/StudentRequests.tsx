import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_DESCRIPTIONS,
  RequestType,
  roleLabel,
  statusBadgeClass,
  buildPayload,
} from '../../components/requests/requestTypes';

interface Stage {
  id: string;
  order: number;
  approverRole: string;
  status: string;
  comment: string | null;
}

interface RequestRow {
  id: string;
  type: RequestType;
  status: string;
  currentStage: number;
  createdAt: string;
  generatedDocumentId: string | null;
  stages: Stage[];
}

export default function StudentRequests() {
  const { token } = useAuth();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [type, setType] = useState<RequestType>('CLEARANCE');
  const [documentType, setDocumentType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/requests/mine', { token });
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your requests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (type === 'ACADEMIC_REQUISITION' && !documentType.trim()) {
      setError('Please say which document you need.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/requests', {
        method: 'POST',
        token,
        body: { type, payload: buildPayload(type, documentType) },
      });
      setMessage('Request submitted.');
      setDocumentType('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your request');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    setError('');
    setMessage('');
    setCancellingId(id);
    try {
      await api('/requests/' + id + '/cancel', { method: 'POST', token });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel that request');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <PortalLayout title="Request a Document">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Request a Document</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Submit a request and track it through approval. Approved requests that produce a document will appear in{' '}
            <span className="font-medium">My Documents & Letters</span> once fully approved.
          </p>
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

        {/* New request form */}
        <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
            New Request
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Request type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as RequestType)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              >
                {REQUEST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REQUEST_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{REQUEST_TYPE_DESCRIPTIONS[type]}</p>
            </div>

            {type === 'ACADEMIC_REQUISITION' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Which document do you need?
                </label>
                <input
                  type="text"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  placeholder="e.g. Official transcript"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </section>

        {/* Existing requests */}
        <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
            My Requests
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 p-4 dark:text-gray-500">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-400 p-4 dark:text-gray-500">You haven't submitted any requests yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {requests.map((r) => (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {REQUEST_TYPE_LABELS[r.type]}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                        Submitted {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + statusBadgeClass(r.status)}>
                        {r.status}
                      </span>
                      {r.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => handleCancel(r.id)}
                          disabled={cancellingId === r.id}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          {cancellingId === r.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stage tracker */}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.stages
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((s, idx) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span
                            className={
                              'text-xs px-2 py-1 rounded-full border ' +
                              (s.status === 'APPROVED'
                                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-300'
                                : s.status === 'REJECTED'
                                ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300'
                                : idx === r.currentStage && r.status === 'PENDING'
                                ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200'
                                : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400')
                            }
                          >
                            {roleLabel(s.approverRole)}
                            {idx === r.currentStage && r.status === 'PENDING' ? ' (awaiting)' : ''}
                          </span>
                          {idx < r.stages.length - 1 && <span className="text-gray-300 dark:text-gray-600">→</span>}
                        </div>
                      ))}
                  </div>

                  {r.stages.some((s) => s.comment) && (
                    <div className="space-y-1">
                      {r.stages
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .filter((s) => s.comment)
                        .map((s) => (
                          <p
                            key={s.id}
                            className={
                              'text-xs ' +
                              (s.status === 'REJECTED' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')
                            }
                          >
                            <span className="font-medium">{roleLabel(s.approverRole)}:</span> {s.comment}
                          </p>
                        ))}
                    </div>
                  )}

                  {r.status === 'APPROVED' && r.generatedDocumentId && (
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Your document has been issued — see My Documents & Letters.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
}
