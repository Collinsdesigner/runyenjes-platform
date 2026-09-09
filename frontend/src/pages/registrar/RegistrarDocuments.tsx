import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api, uploadStudentDocument } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
}

interface DocumentRow {
  id: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy: { name: string };
}

export default function RegistrarDocuments() {
  const { token } = useAuth();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StudentRow[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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
    setDocsLoading(true);
    setError('');
    try {
      const data = await api(`/documents/students/${student.id}`, { token });
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load documents');
    } finally {
      setDocsLoading(false);
    }
  }

  async function handleUpload() {
    if (!selectedStudent || !file || !title.trim()) {
      setError('Select a student, a title, and a file');
      return;
    }
    setUploading(true);
    setError('');
    setMessage('');
    try {
      await uploadStudentDocument(selectedStudent.id, file, title.trim(), token);
      setMessage('Document uploaded');
      setTitle('');
      setFile(null);
      selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload document');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE', token });
      setMessage('Document deleted');
      if (selectedStudent) selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete document');
    }
  }

  return (
    <PortalLayout title="Student Documents">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Student Documents</h2>
          <p className="text-sm text-gray-500 mt-1">Search a student, then upload or manage their documents.</p>
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
          <button
            type="button"
            onClick={handleSearch}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
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
                <span className="text-xs text-gray-400">
                  {s.admissionNumber || 'No admission number'} · {s.email}
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedStudent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Managing documents for <span className="font-semibold">{selectedStudent.name}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedStudent(null); setDocuments([]); }}
                className="text-xs text-gray-500"
              >
                Change student
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Upload Document</h3>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='Title (e.g. "Transcript 2026")'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Documents</div>
              {docsLoading ? (
                <p className="text-sm text-gray-400 p-4">Loading...</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-gray-400 p-4">No documents uploaded yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {documents.map((d) => (
                    <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-rgreen"
                        >
                          {d.title}
                        </a>
                        <div className="text-xs text-gray-400 mt-1">
                          Uploaded by {d.uploadedBy.name} · {new Date(d.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        className="text-xs font-medium text-red-600"
                      >
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
