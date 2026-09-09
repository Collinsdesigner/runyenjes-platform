import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Overview {
  students: number;
  staffByRole: { role: string; count: number }[];
  departments: number;
  programmes: number;
  units: number;
  admissionsByStatus: { status: string; count: number }[];
  outstandingInvoiceCount: number;
  outstandingBalance: number;
}

export default function Reports() {
  const { token } = useAuth();

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/reports/overview', { token })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load reports'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAskAI() {
    setAiLoading(true);
    setAiError('');
    setAiReply('');
    try {
      const result = await api('/ai/assist', {
        method: 'POST',
        token,
        body: { action: 'institution_reports_summary' },
      });
      setAiReply(result.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Reports">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
            <p className="text-sm text-gray-500 mt-1">Institution-wide reporting figures.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Summarize Reports'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {aiError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{aiError}</div>}
        {aiReply && (
          <div className="bg-green-50 border border-green-200 text-gray-800 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="text-xs text-gray-500">Active Students</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{data.students}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="text-xs text-gray-500">Departments / Programmes / Units</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {data.departments} / {data.programmes} / {data.units}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="text-xs text-gray-500">Outstanding Invoices</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {data.outstandingInvoiceCount} (KES {data.outstandingBalance})
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 md:col-span-2">
              <div className="font-semibold text-gray-900 mb-3">Staff by Role</div>
              <div className="space-y-1">
                {data.staffByRole.length === 0 && <p className="text-sm text-gray-400">No active staff on record.</p>}
                {data.staffByRole.map((s) => (
                  <div key={s.role} className="flex justify-between text-sm">
                    <span className="text-gray-700">{s.role}</span>
                    <span className="text-gray-500">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="font-semibold text-gray-900 mb-3">Applications by Status</div>
              <div className="space-y-1">
                {data.admissionsByStatus.length === 0 && <p className="text-sm text-gray-400">No applications on record.</p>}
                {data.admissionsByStatus.map((a) => (
                  <div key={a.status} className="flex justify-between text-sm">
                    <span className="text-gray-700">{a.status}</span>
                    <span className="text-gray-500">{a.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
