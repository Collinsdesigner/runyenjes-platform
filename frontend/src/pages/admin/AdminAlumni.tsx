import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AlumniRow {
  id: string;
  graduationYear: number | null;
  currentEmployer: string | null;
  currentPosition: string | null;
  user: { id: string; name: string; email: string; admissionNumber: string | null };
}

export default function AdminAlumni() {
  const { token } = useAuth();
  const [alumni, setAlumni] = useState<AlumniRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [studentId, setStudentId] = useState('');
  const [graduationYear, setGraduationYear] = useState(String(new Date().getFullYear()));

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/alumni', { token });
      setAlumni(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load alumni');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleGraduate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!studentId) {
      setError('Student ID is required');
      return;
    }
    try {
      await api(`/alumni/graduate/${studentId.trim()}`, {
        method: 'POST',
        token,
        body: { graduationYear: Number(graduationYear) },
      });
      setMessage('Student graduated to Alumni');
      setStudentId('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not graduate student');
    }
  }

  return (
    <PortalLayout title="Alumni">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alumni</h2>
          <p className="text-sm text-gray-500 mt-1">
            Graduate a student to convert their account to Alumni \u2014 their history stays intact.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleGraduate} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Graduate a Student</h3>
          <p className="text-xs text-gray-400">
            Student ID is the student's account ID (find it in Admin &gt; Students).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Student ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Graduation year"
              type="number"
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Graduate to Alumni
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Admission #</th>
                <th className="px-4 py-2">Graduation Year</th>
                <th className="px-4 py-2">Employer</th>
                <th className="px-4 py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && alumni.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No alumni yet</td></tr>
              )}
              {alumni.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{a.user?.name}</td>
                  <td className="px-4 py-2">{a.user?.admissionNumber || '—'}</td>
                  <td className="px-4 py-2">{a.graduationYear || '—'}</td>
                  <td className="px-4 py-2">{a.currentEmployer || '—'}</td>
                  <td className="px-4 py-2">{a.currentPosition || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
