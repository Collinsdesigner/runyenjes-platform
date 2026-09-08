import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ResultRow {
  studentName: string;
  score: number;
  remarks: string | null;
}

interface ExamRow {
  id: string;
  name: string;
  unitName: string;
  maxScore: number;
  results: ResultRow[];
}

export default function TeacherResults() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/results', { token })
      .then((data) => {
        setTerm(data.term);
        setExams(data.exams);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load results'))
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
        body: { action: 'teacher_unit_results_summary' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Results">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Results</h2>
            <p className="text-sm text-gray-500 mt-1">
              {term ? `Results across your units this term (${term}).` : 'No active academic term right now.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Results Summary'}
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
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            Loading results...
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No assessments recorded yet for your units this term.
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((e) => (
              <div key={e.id} className="bg-white border border-gray-200 rounded-lg">
                <div className="p-4 border-b border-gray-200">
                  <div className="font-semibold text-gray-900">{e.name}</div>
                  <div className="text-xs text-gray-500">{e.unitName} · out of {e.maxScore}</div>
                </div>
                {e.results.length === 0 ? (
                  <p className="text-sm text-gray-400 p-4">No results recorded yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {e.results.map((r, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between text-sm">
                        <span className="text-gray-800">{r.studentName}</span>
                        <span className="text-gray-500">{r.score}/{e.maxScore}</span>
                      </div>
                    ))}
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
