import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface RiskStudent {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  absences: number;
  totalSessions: number;
  missingAssignments: number;
  averageScorePercent: number | null;
  reasons: string[];
}

export default function TeacherEarlyWarning() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [students, setStudents] = useState<RiskStudent[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/early-warning', { token })
      .then((data) => {
        setTerm(data.term);
        setStudents(data.students);
        setTotalStudents(data.totalStudents);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load early warning data'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAskAI() {
    setAiLoading(true);
    setAiError('');
    setAiReply('');
    try {
      const data = await api('/ai/assist', {
        method: 'POST',
        token,
        body: { action: 'teacher_early_warning_summary' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Early Warning">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Early Warning</h2>
            <p className="text-sm text-gray-500 mt-1">
              {term
                ? `Students flagged across attendance, assignments, and results this term (${term}). ${totalStudents} total registered.`
                : 'No active academic term right now.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Suggested Next Steps'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {aiError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{aiError}</div>}
        {aiReply && (
          <div className="bg-green-50 border border-green-200 text-gray-800 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : students.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No students currently flagged as at-risk. Either everything looks fine, or there isn't enough attendance/assignment/results data recorded yet to flag anyone.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {students.map((s) => (
              <div key={s.studentId} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.admissionNumber || 'No admission number'}</div>
                  </div>
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                    {s.reasons.length} flag{s.reasons.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {s.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600">• {r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
