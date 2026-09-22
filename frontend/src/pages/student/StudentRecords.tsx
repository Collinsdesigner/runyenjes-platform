import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import OfficialDocuments from '../../components/student/OfficialDocuments';

interface DocumentRow {
  id: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy: { name: string };
}

interface LetterRow {
  id: string;
  type: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  issuedBy: { name: string };
}

export default function StudentRecords() {
  const { token, user } = useAuth();

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true);
    Promise.all([
      api(`/documents/students/${user.id}`, { token }),
      api(`/letters/students/${user.id}`, { token }),
    ])
      .then(([docsData, lettersData]) => {
        setDocuments(docsData);
        setLetters(lettersData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your records'))
      .finally(() => setLoading(false));
  }, [token, user]);

  return (
    <PortalLayout title="My Documents & Letters">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Documents & Letters</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Documents and letters issued to you by the Registrar.</p>
        </div>

        <OfficialDocuments />

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>}

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">Documents</div>
              {documents.length === 0 ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">No documents on file yet.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {documents.map((d) => (
                    <a
                      key={d.id}
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="text-sm font-medium text-rgreen">{d.title}</div>
                      <div className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                        Uploaded by {d.uploadedBy.name} · {new Date(d.createdAt).toLocaleDateString()}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">Letters & Certificates</div>
              {letters.length === 0 ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">No letters issued yet.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {letters.map((l) => (
                    <a
                      key={l.id}
                      href={l.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="text-sm font-medium text-rgreen">{l.title}</div>
                      <div className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                        {l.type} · Issued by {l.issuedBy.name} · {new Date(l.createdAt).toLocaleDateString()}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
