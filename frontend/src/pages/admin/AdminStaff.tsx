import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department: { id: string; name: string } | null;
}

const STAFF_ROLES = [
  'TEACHER',
  'REGISTRAR',
  'ADMIN',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
  'SUPPORT_STAFF',
  'PROCUREMENT_OFFICER',
];

export default function AdminStaff() {
  const { token } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('TEACHER');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      if (!roleFilter) {
        const results = await Promise.all(
          STAFF_ROLES.map((r) =>
            api(`/admin/users?role=${r}${search ? `&search=${encodeURIComponent(search)}` : ''}`, { token })
          )
        );
        setStaff(results.flatMap((r) => r.users));
      } else {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        params.set('role', roleFilter);
        const data = await api(`/admin/users?${params.toString()}`, { token });
        setStaff(data.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load staff');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, roleFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!name || !email || !password) {
      setError('Name, email and password are required');
      return;
    }
    try {
      await api('/admin/users', { method: 'POST', token, body: { name, email, password, role } });
      setMessage(`${name} created as ${role}`);
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create staff account');
    }
  }

  async function handleResetPassword(id: string) {
    const newPassword = window.prompt('New temporary password (min 6 characters):');
    if (!newPassword) return;
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}/reset-password`, { method: 'POST', token, body: { newPassword } });
      setMessage('Password reset — they must change it on next login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    }
  }

  async function handleStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
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
    <PortalLayout title="Staff">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage staff accounts. To change a role, use Users — this page focuses on staff records.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Staff Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Staff Account
          </button>
        </form>

        <div className="flex flex-wrap gap-3">
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Search name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All staff roles</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && staff.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No staff found</td></tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{s.role}</span>
                  </td>
                  <td className="px-4 py-2">{s.department?.name || '—'}</td>
                  <td className="px-4 py-2">{s.status}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button className="text-rgreen text-xs font-medium" onClick={() => handleResetPassword(s.id)}>
                      Reset password
                    </button>
                    {s.status !== 'SUSPENDED' ? (
                      <button
                        className="text-amber-600 text-xs font-medium"
                        onClick={() => handleStatus(s.id, 'SUSPENDED')}
                      >
                        Suspend
                      </button>
                    ) : (
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
