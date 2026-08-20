import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

const ALL_ROLES = [
  'ADMIN',
  'REGISTRAR',
  'TEACHER',
  'STUDENT',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
];

// NOTE: creating a user with one of the 4 ERP roles below, and changing an
// existing user's role, both require the backend to have been patched with
// patch_admin_roles.py. If you see a 400 error here, that script hasn't
// been run yet.
export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('FINANCE_OFFICER');

  const [roleEdits, setRoleEdits] = useState<Record<string, string>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const data = await api(`/admin/users?${params.toString()}`, { token });
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, roleFilter]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!name || !email || !password) {
      setError('Name, email and password are required');
      return;
    }
    try {
      await api('/admin/users', {
        method: 'POST',
        token,
        body: { name, email, password, role: newUserRole },
      });
      setMessage(`${name} created as ${newUserRole}`);
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    }
  }

  async function handleRoleChange(userId: string) {
    setError('');
    setMessage('');
    const role = roleEdits[userId];
    if (!role) return;
    try {
      await api(`/admin/users/${userId}/role`, { method: 'PATCH', token, body: { role } });
      setMessage('Role updated');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role');
    }
  }

  return (
    <PortalLayout title="Users">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500 mt-1">
            Create accounts and grant or change roles — this is how privileges are managed.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateUser} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
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
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
            >
              {ALL_ROLES.filter((r) => r !== 'STUDENT').map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create User
          </button>
        </form>

        <div className="flex flex-wrap gap-3">
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Search name, email, admission #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Change role</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No users found</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{u.role}</span>
                  </td>
                  <td className="px-4 py-2">{u.status}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                        value={roleEdits[u.id] ?? u.role}
                        onChange={(e) => setRoleEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        className="text-rgreen text-xs font-medium"
                        onClick={() => handleRoleChange(u.id)}
                      >
                        Save
                      </button>
                    </div>
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
