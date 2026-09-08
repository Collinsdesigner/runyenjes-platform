import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ExamRow {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  examDate: string | null;
  maxScore: number;
  resultCount: number;
}

interface RosterRow {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  score: number | null;
  remarks: string | null;
}

interface UnitOption {
  unitId: string;
  unitName: string;
}

export default function TeacherAssessments() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newUnitId, setNewUnitId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newMaxScore, setNewMaxScore] = useState('100');

  const [selectedExam, setSelectedExam] = useState<ExamRow | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [examData, unitData] = await Promise.all([
        api('/teacher/assessments', { token }),
        api('/teacher/units', { token }),
      ]);
      setTerm(examData.term);
      setExams(examData.exams);
      setUnits(unitData.units.map((u: any) => ({ unitId: u.unitId, unitName: u.unitName })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assessments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreate() {
    if (!newUnitId || !newName.trim()) {
      setError('Unit and assessment name are required');
      return;
    }
    setError('');
    setMessage('');
    try {
      await api('/teacher/assessments', {
        method: 'POST',
        token,
        body: {
          unitId: newUnitId,
          name: newName.trim(),
          examDate: newDate || undefined,
          maxScore: Number(newMaxScore) || 100,
        },
      });
      setMessage('Assessment created');
      setNewName('');
      setNewDate('');
      setNewMaxScore('100');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create assessment');
    }
  }

  async function selectExam(exam: ExamRow) {
    setSelectedExam(exam);
    setRosterLoading(true);
    setError('');
    try {
      const data = await api(`/teacher/assessments/${exam.id}/roster`, { token });
      setRoster(data.roster);
      const drafts: Record<string, string> = {};
      data.roster.forEach((r: RosterRow) => {
        drafts[r.studentId] = r.score !== null ? String(r.score) : '';
      });
      setScoreDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load roster');
    } finally {
      setRosterLoading(false);
    }
  }

  async function saveScore(studentId: string) {
    if (!selectedExam) return;
    const scoreValue = scoreDrafts[studentId];
    if (scoreValue === undefined || scoreValue === '') return;
    try {
      await api(`/teacher/assessments/${selectedExam.id}/results`, {
        method: 'POST',
        token,
        body: { studentId, score: Number(scoreValue) },
      });
      setMessage('Score saved');
      selectExam(selectedExam);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save score');
    }
  }

  return (
    <PortalLayout title="Assessments">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assessments</h2>
          <p className="text-sm text-gray-500 mt-1">
            {term ? `CATs and exams for your units this term (${term}).` : 'No active academic term right now.'}
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-gray-200 rounded-lg">
            <div className="p-5 border-b border-gray-200 space-y-3">
              <h3 className="font-semibold text-gray-900">New Assessment</h3>
              <select
                value={newUnitId}
                onChange={(e) => setNewUnitId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select unit</option>
                {units.map((u) => (
                  <option key={u.unitId} value={u.unitId}>{u.unitName}</option>
                ))}
              </select>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder='Name (e.g. "CAT 1")'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={newMaxScore}
                  onChange={(e) => setNewMaxScore(e.target.value)}
                  placeholder="Max score"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleCreate}
                className="w-full bg-rgreen text-white px-4 py-2 rounded-lg text-sm"
              >
                Create Assessment
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {loading && <p className="text-sm text-gray-400 p-4">Loading...</p>}
              {!loading && exams.length === 0 && <p className="text-sm text-gray-400 p-4">No assessments yet.</p>}
              {exams.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => selectExam(e)}
                  className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${
                    selectedExam?.id === e.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{e.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {e.unitName} · out of {e.maxScore} · {e.resultCount} result{e.resultCount === 1 ? '' : 's'} recorded
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg">
            <div className="p-5 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {selectedExam ? `Enter Scores — ${selectedExam.name}` : 'Enter Scores'}
              </h3>
              {!selectedExam && <p className="text-sm text-gray-500 mt-1">Select an assessment to enter scores.</p>}
            </div>
            {rosterLoading && <p className="text-sm text-gray-400 p-4">Loading roster...</p>}
            {!rosterLoading && selectedExam && roster.length === 0 && (
              <p className="text-sm text-gray-400 p-4">No students registered in this unit yet.</p>
            )}
            <div className="divide-y divide-gray-100">
              {roster.map((r) => (
                <div key={r.studentId} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{r.name}</div>
                    <div className="text-xs text-gray-400">{r.admissionNumber || 'No admission number'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      value={scoreDrafts[r.studentId] ?? ''}
                      onChange={(e) => setScoreDrafts({ ...scoreDrafts, [r.studentId]: e.target.value })}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      placeholder={`/${selectedExam?.maxScore ?? 100}`}
                    />
                    <button
                      type="button"
                      onClick={() => saveScore(r.studentId)}
                      className="text-xs font-medium text-rgreen"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
}
