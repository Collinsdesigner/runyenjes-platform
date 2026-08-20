import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
  status: string;
  department: { id: string; name: string } | null;
}

export default function AdminStudents() {
  const { token } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ role: 'STUDENT' });
      if (search) params.set('search', search);
      const data = await api(`/admin/users?${params.toString()}`, { token });
      setStudents(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load students');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search]);

  async function handleStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') {
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}/status`, { method: 'PATCH', token, body: { status } });
      setMessage('Status updated');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status');
    }
  }

  return (
    <PortalLayout title="Students">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Students</h2>
          <p className="text-sm text-gray-500 mt-1">Student records and account status.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <input
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-96"
          placeholder="Search name, email, admission #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Admission #</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && students.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No students found</td></tr>
              )}
              {students.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.email}</div>
                  </td>
                  <td className="px-4 py-2">{s.admissionNumber || '—'}</td>
                  <td className="px-4 py-2">{s.department?.name || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{s.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {s.status !== 'SUSPENDED' && (
                      <button
                        className="text-amber-600 text-xs font-medium"
                        onClick={() => handleStatus(s.id, 'SUSPENDED')}
                      >
                        Suspend
                      </button>
                    )}
                    {s.status !== 'ACTIVE' && (
                      <button
                        className="text-green-600 text-xs font-medium"
                        onClick={() => handleStatus(s.id, 'ACTIVE')}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
