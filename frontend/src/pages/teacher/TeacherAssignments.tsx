import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Unit {
  id: string;
  name: string;
  program: { name: string; level: string | null; department: { name: string } };
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxScore: string;
}

interface Submission {
  id: string;
  textAnswer: string | null;
  fileUrl: string | null;
  submittedAt: string;
  score: string | null;
  feedback: string | null;
  student: { id: string; name: string; admissionNumber: string | null };
}

export default function TeacherAssignments() {
  const { token } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState('100');

  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { score: string; feedback: string }>>({});

  useEffect(() => {
    if (!token) return;
    api('/academic/units/mine', { token })
      .then((data) => setUnits(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your units'))
      .finally(() => setLoading(false));
  }, [token]);

  async function loadAssignments(unitId: string) {
    setSelectedUnitId(unitId);
    setOpenAssignmentId(null);
    if (!unitId) {
      setAssignments([]);
      return;
    }
    try {
      const data = await api(`/assignments/unit/${unitId}`, { token });
      setAssignments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assignments');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!selectedUnitId || !title) {
      setError('Select a unit and enter a title');
      return;
    }
    try {
      await api('/assignments', {
        method: 'POST',
        token,
        body: {
          unitId: selectedUnitId,
          title,
          description: description || undefined,
          dueDate: dueDate || undefined,
          maxScore: Number(maxScore) || 100,
        },
      });
      setMessage('Assignment created');
      setTitle('');
      setDescription('');
      setDueDate('');
      loadAssignments(selectedUnitId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create assignment');
    }
  }

  async function handleDelete(assignmentId: string) {
    setError('');
    setMessage('');
    try {
      await api(`/assignments/${assignmentId}`, { method: 'DELETE', token });
      setMessage('Assignment deleted');
      loadAssignments(selectedUnitId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete assignment');
    }
  }

  async function openSubmissions(assignmentId: string) {
    if (openAssignmentId === assignmentId) {
      setOpenAssignmentId(null);
      return;
    }
    setOpenAssignmentId(assignmentId);
    try {
      const data = await api(`/assignments/${assignmentId}/submissions`, { token });
      setSubmissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submissions');
    }
  }

  async function handleGrade(submissionId: string) {
    setError('');
    setMessage('');
    const draft = gradeDrafts[submissionId];
    if (!draft || !draft.score) {
      setError('Enter a score first');
      return;
    }
    try {
      await api(`/assignments/submissions/${submissionId}/grade`, {
        method: 'PATCH',
        token,
        body: { score: Number(draft.score), feedback: draft.feedback || undefined },
      });
      setMessage('Grade saved');
      if (openAssignmentId) {
        const data = await api(`/assignments/${openAssignmentId}/submissions`, { token });
        setSubmissions(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save grade');
    }
  }

  async function handleSuggestGrade(submissionId: string) {
    setError('');
    try {
      const data = await api('/ai/grading-suggestion', { method: 'POST', token, body: { submissionId } });
      setGradeDrafts((prev) => ({
        ...prev,
        [submissionId]: {
          score: String(data.suggestedScore ?? ''),
          feedback: data.suggestedFeedback || '',
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get AI suggestion');
    }
  }

  return (
    <PortalLayout title="Assignments">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assignments</h2>
          <p className="text-sm text-gray-500 mt-1">Create assignments for your units and grade submissions.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-96"
          value={selectedUnitId}
          onChange={(e) => loadAssignments(e.target.value)}
        >
          <option value="">{loading ? 'Loading your units...' : 'Select a unit'}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.program.department.name} — {u.name} ({u.program.name} {u.program.level || ''})
            </option>
          ))}
        </select>

        {selectedUnitId && (
          <>
            <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">New Assignment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
                  placeholder="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
                  placeholder="Description (optional)"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
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
                Create Assignment
              </button>
            </form>

            <div className="space-y-3">
              {assignments.length === 0 && <p className="text-sm text-gray-400">No assignments for this unit yet.</p>}
              {assignments.map((a) => (
                <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">{a.title}</h4>
                      {a.description && <p className="text-sm text-gray-600 mt-1">{a.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString()}` : 'No due date'} — Max {a.maxScore}
                      </p>
                    </div>
                    <div className="space-x-3 text-xs">
                      <button className="text-rgreen font-medium" onClick={() => openSubmissions(a.id)}>
                        {openAssignmentId === a.id ? 'Hide submissions' : 'View submissions'}
                      </button>
                      <button className="text-red-600 font-medium" onClick={() => handleDelete(a.id)}>
                        Delete
                      </button>
                    </div>
                  </div>

                  {openAssignmentId === a.id && (
                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
                      {submissions.length === 0 && (
                        <p className="text-xs text-gray-400">No submissions yet.</p>
                      )}
                      {submissions.map((s) => (
                        <div key={s.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">
                              {s.student.name} {s.student.admissionNumber ? `(${s.student.admissionNumber})` : ''}
                            </p>
                            <span className="text-xs text-gray-400">
                              {new Date(s.submittedAt).toLocaleString()}
                            </span>
                          </div>
                          {s.textAnswer && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{s.textAnswer}</p>}
                          {s.fileUrl && (
                            <p className="text-xs text-gray-500 mt-1">File/link: {s.fileUrl}</p>
                          )}
                          {s.score !== null ? (
                            <p className="text-xs text-green-700 mt-2">
                              Graded: {s.score} {s.feedback ? `— ${s.feedback}` : ''}
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2 items-center mt-2">
                              <input
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-20"
                                placeholder="Score"
                                type="number"
                                value={gradeDrafts[s.id]?.score || ''}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [s.id]: { score: e.target.value, feedback: prev[s.id]?.feedback || '' },
                                  }))
                                }
                              />
                              <input
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 min-w-[160px]"
                                placeholder="Feedback (optional)"
                                value={gradeDrafts[s.id]?.feedback || ''}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [s.id]: { score: prev[s.id]?.score || '', feedback: e.target.value },
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="text-rgreen text-xs font-medium underline"
                                onClick={() => handleSuggestGrade(s.id)}
                              >
                                {'\ud83c\udf93 AI Suggest'}
                              </button>
                              <button
                                className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                                onClick={() => handleGrade(s.id)}
                              >
                                Save Grade
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
