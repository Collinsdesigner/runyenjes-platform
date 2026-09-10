import { useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import AIAssistBox from '../../components/ai/AIAssistBox';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
}

interface LetterRow {
  id: string;
  type: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  issuedBy: { name: string };
}

const LETTER_TYPES = ['Introduction Letter', 'Completion Certificate', 'Fee Clearance', 'Recommendation Letter', 'Custom'];

export default function RegistrarLetters() {
  const { token } = useAuth();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StudentRow[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [lettersLoading, setLettersLoading] = useState(false);

  const [type, setType] = useState(LETTER_TYPES[0]);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSearch() {
    if (!search.trim()) return;
    setError('');
    try {
      const data = await api(`/registrar/students?search=${encodeURIComponent(search.trim())}`, { token });
      setResults(data.students);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search students');
    }
  }

  async function selectStudent(student: StudentRow) {
    setSelectedStudent(student);
    setLettersLoading(true);
    setError('');
    try {
      const data = await api(`/letters/students/${student.id}`, { token });
      setLetters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load letters');
    } finally {
      setLettersLoading(false);
    }
  }

  async function handleGenerate() {
    if (!selectedStudent || !title.trim() || !bodyText.trim()) {
      setError('Title and body are required');
      return;
    }
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      await api(`/letters/students/${selectedStudent.id}`, {
        method: 'POST',
        token,
        body: { type, title: title.trim(), bodyText: bodyText.trim() },
      });
      setMessage('Letter generated and issued');
      setTitle('');
      setBodyText('');
      selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate letter');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/letters/${id}`, { method: 'DELETE', token });
      setMessage('Letter deleted');
      if (selectedStudent) selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete letter');
    }
  }

  return (
    <PortalLayout title="Letters & Certificates">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Letters & Certificates</h2>
          <p className="text-sm text-gray-500 mt-1">Search a student, then draft and issue a real PDF letter or certificate.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>}

        <div className="bg-white border border-gray-200 rounded-lg p-5 flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, email, or admission number"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="button" onClick={handleSearch} className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Search
          </button>
        </div>

        {results.length > 0 && !selectedStudent && (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStudent(s)}
                className="w-full text-left px-5 py-3 hover:bg-gray-50 text-sm"
              >
                <span className="font-medium text-gray-900">{s.name}</span>{' '}
                <span className="text-xs text-gray-400">{s.admissionNumber || 'No admission number'} · {s.email}</span>
              </button>
            ))}
          </div>
        )}

        {selectedStudent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Issuing letters for <span className="font-semibold">{selectedStudent.name}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedStudent(null); setLetters([]); }}
                className="text-xs text-gray-500"
              >
                Change student
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Draft a Letter / Certificate</h3>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {LETTER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='Title (e.g. "Letter of Introduction")'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write rough notes, then ask AI to draft it into formal wording -- or write the full body yourself."
                rows={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <AIAssistBox
                task="draft_letter"
                label="Ask AI to draft this into formal wording"
                getInput={() => bodyText}
                onApply={(result) => setBodyText(result)}
                emptyMessage="Write some rough notes first, then ask AI to draft it."
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {generating ? 'Generating PDF...' : 'Generate & Issue Letter'}
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Issued Letters</div>
              {lettersLoading ? (
                <p className="text-sm text-gray-400 p-4">Loading...</p>
              ) : letters.length === 0 ? (
                <p className="text-sm text-gray-400 p-4">No letters issued yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {letters.map((l) => (
                    <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <a href={l.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-rgreen">
                          {l.title}
                        </a>
                        <div className="text-xs text-gray-400 mt-1">
                          {l.type} · Issued by {l.issuedBy.name} · {new Date(l.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleDelete(l.id)} className="text-xs font-medium text-red-600">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
