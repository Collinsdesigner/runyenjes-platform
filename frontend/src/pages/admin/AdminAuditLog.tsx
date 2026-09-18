import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  target: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { id: string; name: string; role: string } | null;
}

const ENTITY_TYPES = [
  'User',
  'Department',
  'Program',
  'ProgramFee',
  'SiteSettings',
  'Invoice',
  'FeePayment',
  'ExamResult',
  'IssuedLetter',
  'StudentDocument',
  'TimetableEntry',
  'Unit',
];

function formatAction(action: string) {
  return action
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export default function AdminAuditLog() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function load() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (entityType) params.set('entityType', entityType);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const data = await api(`/audit?${params.toString()}`, { token });
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load audit log');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, entityType, page]);

  return (
    <PortalLayout title="Audit Log">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Audit Log</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            A record of who did what, and when — for grades, finance, letters, documents,
            user/role changes, and deletions.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
            value={entityType}
            onChange={(e) => {
              setPage(1);
              setEntityType(e.target.value);
            }}
          >
            <option value="">All entity types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400 dark:text-gray-500">{total} entr{total === 1 ? 'y' : 'ies'}</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden dark:bg-gray-900 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left dark:bg-gray-950 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Actor</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">Loading...</td></tr>
              )}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">No audit entries found</td></tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    {entry.actor ? (
                      <>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{entry.actor.name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{entry.actor.role}</div>
                      </>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">Unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800">
                      {formatAction(entry.action)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {entry.entityType || '—'}
                    {entry.entityId && (
                      <div className="text-gray-400 dark:text-gray-500 truncate max-w-[10rem]">{entry.entityId}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {(entry.before || entry.after) ? (
                      <button
                        className="text-rgreen text-xs font-medium"
                        onClick={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                      >
                        {expandedId === entry.id ? 'Hide' : 'View'}
                      </button>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                    {expandedId === entry.id && (
                      <div className="mt-2 space-y-2 max-w-sm">
                        {entry.before !== null && entry.before !== undefined && (
                          <div>
                            <div className="text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">Before</div>
                            <pre className="text-[11px] bg-gray-50 rounded p-2 overflow-x-auto dark:bg-gray-950">
                              {JSON.stringify(entry.before, null, 2)}
                            </pre>
                          </div>
                        )}
                        {entry.after !== null && entry.after !== undefined && (
                          <div>
                            <div className="text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">After</div>
                            <pre className="text-[11px] bg-gray-50 rounded p-2 overflow-x-auto dark:bg-gray-950">
                              {JSON.stringify(entry.after, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <button
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 dark:border-gray-600"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
            <button
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 dark:border-gray-600"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
