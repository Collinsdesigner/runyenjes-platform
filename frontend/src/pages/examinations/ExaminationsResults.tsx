import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ExamResult {
  id: string;
  score: string;
  grade: string | null;
  student: { id: string; name: string; admissionNumber: string | null };
}

interface Exam {
  id: string;
  name: string;
  maxScore: string;
  unit: { id: string; name: string };
  term: { id: string; name: string };
}

export default function ExaminationsResults() {
  const { token } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [activeTermId, setActiveTermId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [unitId, setUnitId] = useState('');
  const [examName, setExamName] = useState('');
  const [maxScore, setMaxScore] = useState('100');

  const [openExamId, setOpenExamId] = useState<string | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [studentId, setStudentId] = useState('');
  const [score, setScore] = useState('');
  const [grade, setGrade] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [examData, term] = await Promise.all([
        api('/examinations/exams', { token }),
        api('/terms/active').catch(() => null),
      ]);
      setExams(examData);
      if (term?.id) setActiveTermId(term.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load exams');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!unitId || !examName) {
      setError('Unit ID and exam name are required');
      return;
    }
    if (!activeTermId) {
      setError('No active term is open right now');
      return;
    }
    try {
      await api('/examinations/exams', {
        method: 'POST',
        token,
        body: { unitId: unitId.trim(), termId: activeTermId, name: examName, maxScore: Number(maxScore) || 100 },
      });
      setMessage('Exam created');
      setUnitId('');
      setExamName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create exam');
    }
  }

  async function openExam(examId: string) {
    if (openExamId === examId) {
      setOpenExamId(null);
      return;
    }
    setOpenExamId(examId);
    try {
      const data = await api(`/examinations/exams/${examId}/results`, { token });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load results');
    }
  }

  async function handleRecordResult(examId: string) {
    setError('');
    setMessage('');
    if (!studentId || !score) {
      setError('Student ID and score are required');
      return;
    }
    try {
      await api(`/examinations/exams/${examId}/results`, {
        method: 'POST',
        token,
        body: { studentId: studentId.trim(), score: Number(score), grade: grade || undefined },
      });
      setMessage('Result recorded');
      setStudentId('');
      setScore('');
      setGrade('');
      const data = await api(`/examinations/exams/${examId}/results`, { token });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record result');
    }
  }

  return (
    <PortalLayout title="Exams & Results">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Exams & Results</h2>
          <p className="text-sm text-gray-500 mt-1">Create exams for a unit and record student scores.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateExam} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Exam</h3>
          <p className="text-xs text-gray-400">
            Unit ID is the course unit's ID (find it in Registrar &gt; Programmes &gt; unit list).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Unit ID"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Exam name (e.g. CAT 1)"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Max score"
              type="number"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Exam
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Exam</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Term</th>
                <th className="px-4 py-2">Max Score</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && exams.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No exams yet</td></tr>
              )}
              {exams.map((exam) => (
                <>
                  <tr key={exam.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{exam.name}</td>
                    <td className="px-4 py-2">{exam.unit?.name}</td>
                    <td className="px-4 py-2">{exam.term?.name}</td>
                    <td className="px-4 py-2">{exam.maxScore}</td>
                    <td className="px-4 py-2 text-right">
                      <button className="text-rgreen text-xs font-medium" onClick={() => openExam(exam.id)}>
                        {openExamId === exam.id ? 'Close' : 'Results'}
                      </button>
                    </td>
                  </tr>
                  {openExamId === exam.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 items-center mb-3">
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-48"
                            placeholder="Student ID"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24"
                            placeholder="Score"
                            type="number"
                            value={score}
                            onChange={(e) => setScore(e.target.value)}
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24"
                            placeholder="Grade"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                          />
                          <button
                            className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                            onClick={() => handleRecordResult(exam.id)}
                          >
                            Save Result
                          </button>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="text-gray-500 text-left">
                            <tr>
                              <th className="pr-4 py-1">Student</th>
                              <th className="pr-4 py-1">Score</th>
                              <th className="pr-4 py-1">Grade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.map((r) => (
                              <tr key={r.id} className="border-t border-gray-200">
                                <td className="pr-4 py-1">{r.student?.name}</td>
                                <td className="pr-4 py-1">{r.score}</td>
                                <td className="pr-4 py-1">{r.grade || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
