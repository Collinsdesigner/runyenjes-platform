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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Letters & Certificates</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Search a student, then draft and issue a real PDF letter or certificate.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm dark:bg-green-950 dark:border-green-800 dark:text-green-300">{message}</div>}

        <div className="bg-white border border-gray-200 rounded-lg p-5 flex gap-2 dark:bg-gray-900 dark:border-gray-700">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, email, or admission number"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
          />
          <button type="button" onClick={handleSearch} className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Search
          </button>
        </div>

        {results.length > 0 && !selectedStudent && (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 dark:bg-gray-900 dark:border-gray-700 dark:divide-gray-800">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStudent(s)}
                className="w-full text-left px-5 py-3 hover:bg-gray-50 text-sm dark:hover:bg-gray-800"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">{s.name}</span>{' '}
                <span className="text-xs text-gray-400 dark:text-gray-500">{s.admissionNumber || 'No admission number'} · {s.email}</span>
              </button>
            ))}
          </div>
        )}

        {selectedStudent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Issuing letters for <span className="font-semibold">{selectedStudent.name}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedStudent(null); setLetters([]); }}
                className="text-xs text-gray-500 dark:text-gray-400"
              >
                Change student
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 dark:bg-gray-900 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Draft a Letter / Certificate</h3>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600">
                {LETTER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='Title (e.g. "Letter of Introduction")'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              />
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write rough notes, then ask AI to draft it into formal wording -- or write the full body yourself."
                rows={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
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

            <div className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">Issued Letters</div>
              {lettersLoading ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">Loading...</p>
              ) : letters.length === 0 ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">No letters issued yet.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {letters.map((l) => (
                    <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <a href={l.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-rgreen">
                          {l.title}
                        </a>
                        <div className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                          {l.type} · Issued by {l.issuedBy.name} · {new Date(l.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleDelete(l.id)} className="text-xs font-medium text-red-600 dark:text-red-400">
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
