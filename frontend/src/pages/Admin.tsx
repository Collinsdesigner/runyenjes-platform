import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, uploadInstitutionLogo } from '../api/client';
interface Stats {
  students: number;
  teachers: number;
  departments: number;
  pendingApplications: number;
  homeVisits: number;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  admissionNumber: string | null;
  department: { id: string; name: string } | null;
  createdAt: string;
}

interface Department {
  id: string;
  name: string;
}
interface ProgramOption {
  id: string;
  label: string;
}

const ALLOWED = ['ADMIN', 'FOUNDER'];
type Tab = 'stats' | 'users' | 'departments' | 'import' | 'settings';

export default function Admin() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('stats');

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Users tab: search / filter / sort / pagination
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // Bulk import (existing students at launch)
  const [importProgramId, setImportProgramId] = useState('');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    createdCount: number;
    created: string[];
    skippedCount: number;
    skipped: { row: any; reason: string }[];
  } | null>(null);

  // New staff form
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState('TEACHER');
  const [staffDeptId, setStaffDeptId] = useState('');

  // New department / program form
  const [newDeptName, setNewDeptName] = useState('');
  const [progDeptId, setProgDeptId] = useState('');
  const [progName, setProgName] = useState('');
  const [progLevel, setProgLevel] = useState('');

  // Per-user "Manage" panel — reset password / change department
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [newPasswordFor, setNewPasswordFor] = useState('');
  const [deptChangeFor, setDeptChangeFor] = useState('');

  // Full catalog (with real program objects) for editing/deleting in Departments tab
  const [catalog, setCatalog] = useState<any[]>([]);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [editProgName, setEditProgName] = useState('');
  const [editProgLevel, setEditProgLevel] = useState('');
  const [feeInputFor, setFeeInputFor] = useState<string | null>(null);
  const [feeAmount, setFeeAmount] = useState('');

  // Site settings
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const [settingsForm, setSettingsForm] = useState<any>({});

const [uploadingLogo, setUploadingLogo] = useState(false);

const [logoFile, setLogoFile] = useState<File | null>(null);
const [logoPreview, setLogoPreview] = useState<string | null>(null);

  async function loadUsers() {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterRole) params.set('role', filterRole);
      if (filterDept) params.set('departmentId', filterDept);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      params.set('page', String(page));
      params.set('pageSize', '25');

      const data = await api(`/admin/users?${params.toString()}`, { token });
      setUsers(data.users);
      setUserTotal(data.total);
      setUserTotalPages(data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    }
  }

  async function loadAll() {
    try {
      const [s, d, settings] = await Promise.all([
        api('/admin/stats', { token }),
        api('/programs', { token }),
        api('/settings'),
      ]);
      setSiteSettings(settings);
      setSettingsForm(settings);
      setLogoPreview(settings.logoUrl ?? null);      
      setStats(s);
      setDepartments(d.map((dept: any) => ({ id: dept.id, name: dept.name })));
      setCatalog(d);
      setProgramOptions(
        d.flatMap((dept: any) =>
          dept.programs.map((p: any) => ({
            id: p.id,
            label: `${dept.name} — ${p.name}${p.level ? ` (${p.level})` : ''}`,
          }))
        )
      );
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin data');
    }
  }

  useEffect(() => {
    if (user && ALLOWED.includes(user.role)) loadAll();
  }, [user]);

  // Reload the user list whenever search/filter/sort/page changes
  useEffect(() => {
    if (user && ALLOWED.includes(user.role)) loadUsers();
  }, [search, filterRole, filterDept, sortBy, sortDir, page]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        as an Admin to view this page.
      </div>
    );
  }
  if (!ALLOWED.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        This page is only available to Admin or Founder accounts.
      </div>
    );
  }

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await api('/admin/users', {
        method: 'POST',
        body: {
          name: staffName,
          email: staffEmail,
          phone: staffPhone,
          password: staffPassword,
          role: staffRole,
          departmentId: staffDeptId || null,
        },
        token,
      });
      setSuccess(`${staffName} (${staffRole}) created successfully.`);
      setStaffName('');
      setStaffEmail('');
      setStaffPhone('');
      setStaffPassword('');
      setStaffDeptId('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create staff account');
    }
  }

  async function toggleStatus(u: AdminUser) {
    const newStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api(`/admin/users/${u.id}/status`, { method: 'PATCH', body: { status: newStatus }, token });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update user');
    }
  }

  async function handleResetPassword(userId: string) {
    if (!newPasswordFor || newPasswordFor.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await api(`/admin/users/${userId}/reset-password`, {
        method: 'POST',
        body: { newPassword: newPasswordFor },
        token,
      });
      setSuccess('Password reset. Share the new password with them directly.');
      setNewPasswordFor('');
      setExpandedUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    }
  }

  async function handleChangeDepartment(userId: string) {
    setError(null);
    setSuccess(null);
    try {
      await api(`/admin/users/${userId}/department`, {
        method: 'PATCH',
        body: { departmentId: deptChangeFor || null },
        token,
      });
      setSuccess('Department updated.');
      setExpandedUserId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change department');
    }
  }

  async function handleRenameDepartment(id: string) {
    if (!editDeptName.trim()) return;
    setError(null);
    try {
      await api(`/admin/departments/${id}`, { method: 'PATCH', body: { name: editDeptName }, token });
      setEditingDeptId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename department');
    }
  }

  async function handleDeleteDepartment(id: string) {
    if (!confirm('Delete this department? Only possible if it has no programs left.')) return;
    setError(null);
    try {
      await api(`/admin/departments/${id}`, { method: 'DELETE', token });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete department');
    }
  }

  async function handleSaveProgram(id: string) {
    setError(null);
    try {
      await api(`/admin/programs/${id}`, {
        method: 'PATCH',
        body: { name: editProgName, level: editProgLevel },
        token,
      });
      setEditingProgramId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update program');
    }
  }

  async function handleSetFee(programId: string) {
    if (!feeAmount || Number(feeAmount) <= 0) {
      setError('Enter a valid fee amount');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await api(`/admin/programs/${programId}/fee`, {
        method: 'POST',
        body: { amount: feeAmount },
        token,
      });
      setSuccess('Fee updated.');
      setFeeInputFor(null);
      setFeeAmount('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set fee');
    }
  }

  async function handleDeleteProgram(id: string) {
    if (!confirm('Delete this program/class? Only possible if no students are enrolled.')) return;
    setError(null);
    try {
      await api(`/admin/programs/${id}`, { method: 'DELETE', token });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete program');
    }
  }

  async function handleCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await api('/admin/departments', { method: 'POST', body: { name: newDeptName }, token });
      setSuccess(`Department "${newDeptName}" created.`);
      setNewDeptName('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create department');
    }
  }

  async function handleCreateProgram(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!progDeptId) {
      setError('Please choose a department');
      return;
    }
    try {
      await api(`/admin/departments/${progDeptId}/programs`, {
        method: 'POST',
        body: { name: progName, level: progLevel || null },
        token,
      });
      setSuccess(`Program "${progName}" added.`);
      setProgName('');
      setProgLevel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add program');
    }
  }

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImportResult(null);
    if (!importProgramId) {
      setError('Please choose a program to import students into');
      return;
    }

    const rows = importText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, email, admissionNumber, phone] = line.split(',').map((s) => s.trim());
        return { name, email, admissionNumber, phone: phone || undefined };
      });

    if (rows.length === 0) {
      setError('Paste at least one student row first');
      return;
    }

    setImporting(true);
    try {
      const result = await api(`/admin/programs/${importProgramId}/bulk-import-students`, {
        method: 'POST',
        body: { rows },
        token,
      });
      setImportResult(result);
      setImportText('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);

  async function handleRepairGroups() {
    setRepairing(true);
    setRepairMessage(null);
    try {
      const result = await api('/admin/repair-group-memberships', { method: 'POST', token });
      setRepairMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not repair group memberships');
    } finally {
      setRepairing(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const updated = await api('/admin/settings', { method: 'PATCH', body: settingsForm, token });
      setSiteSettings(updated);
      setSuccess('Site settings updated — changes apply everywhere immediately, no code change needed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update settings');
    }
  }

async function handleLogoUpload(file: File) {
  if (!token) return;

  try {
    setUploadingLogo(true);

    const image = await uploadInstitutionLogo(file, token);

    setSettingsForm({
      ...settingsForm,
      logoUrl: image.url,
      logoPublicId: image.publicId,
    });

    setSuccess('Logo uploaded. Click Save settings to apply it.');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Logo upload failed');
  } finally {
    setUploadingLogo(false);
  }
}


  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-rgreen">Admin Dashboard</h1>
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">
          Back to Home
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <div className="flex gap-2 mb-4">
          {(['stats', 'users', 'departments', 'import', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm px-3 py-1.5 rounded-md capitalize ${
                tab === t ? 'bg-rgreen text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-3">{error}</div>}
        {success && (
          <div className="bg-green-50 text-green-800 text-sm p-3 rounded-md mb-3">✔ {success}</div>
        )}

        {tab === 'stats' && stats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Active students" value={stats.students} />
              <StatCard label="Active teachers" value={stats.teachers} />
              <StatCard label="Departments" value={stats.departments} />
              <StatCard label="Pending applications" value={stats.pendingApplications} />
              <StatCard label="Anonymous Home visits" value={stats.homeVisits ?? 0} />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm font-medium mb-1">Repair group memberships</p>
              <p className="text-xs text-gray-500 mb-2">
                Run this if any staff/admin accounts are missing from their Teachers/Admins/
                Department/School chat groups (e.g. accounts created directly in the database).
              </p>
              <button
                onClick={handleRepairGroups}
                disabled={repairing}
                className="text-xs bg-rgreen text-white px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {repairing ? 'Repairing…' : 'Run repair'}
              </button>
              {repairMessage && <p className="text-xs text-green-700 mt-2">✔ {repairMessage}</p>}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-4">
            <form onSubmit={handleCreateStaff} className="bg-white rounded-lg shadow p-4 space-y-2">
              <p className="text-sm font-medium">Create a staff account</p>
              <input
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Full name"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <input
                type="tel"
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="Phone (for emergencies/notifications)"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Temporary password"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="TEACHER">Teacher</option>
                <option value="ADMIN">Admin</option>
                <option value="REGISTRAR">Registrar</option>
              </select>
              <select
                value={staffDeptId}
                onChange={(e) => setStaffDeptId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">No department (school-wide only)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="bg-rgreen text-white text-sm px-4 py-1.5 rounded-md">
                Create account
              </button>
            </form>

            {/* Search / filter / sort — essential once the roster is in the thousands */}
            <div className="bg-white rounded-lg shadow p-3 space-y-2">
              <input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Search by name, email, admission number, or phone…"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterRole}
                  onChange={(e) => {
                    setPage(1);
                    setFilterRole(e.target.value);
                  }}
                  className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
                >
                  <option value="">All roles</option>
                  <option value="STUDENT">Students</option>
                  <option value="TEACHER">Teachers</option>
                  <option value="REGISTRAR">Registrars</option>
                  <option value="ADMIN">Admins</option>
                </select>
                <select
                  value={filterDept}
                  onChange={(e) => {
                    setPage(1);
                    setFilterDept(e.target.value);
                  }}
                  className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
                >
                  <option value="createdAt">Sort: Newest</option>
                  <option value="name">Sort: Name</option>
                  <option value="admissionNumber">Sort: Admission No.</option>
                  <option value="role">Sort: Role</option>
                </select>
                <button
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
                  title="Toggle sort direction"
                >
                  {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                {userTotal} result{userTotal === 1 ? '' : 's'}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {users.map((u) => (
                <div key={u.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {u.name} <span className="text-xs text-gray-400">({u.role})</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {u.email} {u.admissionNumber ? `· ${u.admissionNumber}` : ''}
                        {u.phone ? ` · 📞 ${u.phone}` : ''}
                        {u.department ? ` · ${u.department.name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.role !== 'FOUNDER' && (
                        <button
                          onClick={() => {
                            setExpandedUserId(expandedUserId === u.id ? null : u.id);
                            setDeptChangeFor(u.department?.id ?? '');
                            setNewPasswordFor('');
                          }}
                          className="text-xs text-gray-500 underline"
                        >
                          Manage
                        </button>
                      )}
                      {u.role !== 'FOUNDER' && (
                        <button
                          onClick={() => toggleStatus(u)}
                          className={`text-xs px-2 py-1 rounded-md ${
                            u.status === 'ACTIVE' ? 'bg-rmaroon text-white' : 'bg-rgreen text-white'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                      {u.role !== 'FOUNDER' && u.status !== 'ARCHIVED' && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Archive ${u.name}? This is for people who never joined or completed — their account becomes permanently inactive but records are kept.`)) return;
                            try {
                              await api(`/admin/users/${u.id}/status`, { method: 'PATCH', body: { status: 'ARCHIVED' }, token });
                              await loadAll();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Could not archive user');
                            }
                          }}
                          className="text-xs bg-gray-500 text-white px-2 py-1 rounded-md"
                          title="For accounts that never joined or completed the school"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>

                  {expandedUserId === u.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                      {/* Change department — any role */}
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Change department</p>
                        <div className="flex gap-2">
                          <select
                            value={deptChangeFor}
                            onChange={(e) => setDeptChangeFor(e.target.value)}
                            className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                          >
                            <option value="">No department</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleChangeDepartment(u.id)}
                            className="text-xs bg-rgreen text-white px-3 py-1 rounded-md"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      {/* Reset password — staff only (students log in with admission number) */}
                      {u.role !== 'STUDENT' && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">Reset password</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newPasswordFor}
                              onChange={(e) => setNewPasswordFor(e.target.value)}
                              placeholder="New temporary password"
                              className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => handleResetPassword(u.id)}
                              className="text-xs bg-rmaroon text-white px-3 py-1 rounded-md"
                            >
                              Reset
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">
                            You'll need to tell them the new password directly — it isn't emailed automatically yet.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <p className="p-4 text-center text-sm text-gray-400">No users match this search.</p>
              )}
            </div>

            {userTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-rgreen underline disabled:text-gray-300 disabled:no-underline"
                >
                  ← Prev
                </button>
                <span className="text-xs text-gray-500">
                  Page {page} of {userTotalPages}
                </span>
                <button
                  disabled={page >= userTotalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-rgreen underline disabled:text-gray-300 disabled:no-underline"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'departments' && (
          <div className="space-y-4">
            <form onSubmit={handleCreateDepartment} className="bg-white rounded-lg shadow p-4 flex gap-2">
              <input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="New department name"
                required
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-rgreen text-white text-sm px-4 py-2 rounded-md">
                Add department
              </button>
            </form>

            <form onSubmit={handleCreateProgram} className="bg-white rounded-lg shadow p-4 space-y-2">
              <p className="text-sm font-medium">Add a program to a department</p>
              <select
                value={progDeptId}
                onChange={(e) => setProgDeptId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">Select department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                value={progName}
                onChange={(e) => setProgName(e.target.value)}
                placeholder="Program name (e.g. Plumbing)"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <input
                value={progLevel}
                onChange={(e) => setProgLevel(e.target.value)}
                placeholder="Level (e.g. Level 4) — leave blank for short courses"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-rgreen text-white text-sm px-4 py-1.5 rounded-md">
                Add program
              </button>
            </form>

            {/* Existing catalog — rename/delete departments and programs */}
            <div className="bg-white rounded-lg shadow p-4 space-y-3">
              <p className="text-sm font-medium">Existing departments &amp; programs</p>
              {catalog.map((dept) => (
                <div key={dept.id} className="border border-gray-100 rounded-md p-3">
                  <div className="flex items-center justify-between">
                    {editingDeptId === dept.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          value={editDeptName}
                          onChange={(e) => setEditDeptName(e.target.value)}
                          className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => handleRenameDepartment(dept.id)}
                          className="text-xs bg-rgreen text-white px-2 py-1 rounded-md"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDeptId(null)}
                          className="text-xs text-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium">{dept.name}</p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              setEditingDeptId(dept.id);
                              setEditDeptName(dept.name);
                            }}
                            className="text-xs text-gray-500 underline"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => handleDeleteDepartment(dept.id)}
                            className="text-xs text-rmaroon underline"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-2 space-y-1 pl-3">
                    {dept.programs.map((p: any) => (
                      <div key={p.id} className="flex flex-col text-xs border-b border-gray-50 pb-1.5 last:border-0">
                        <div className="flex items-center justify-between">
                        {editingProgramId === p.id ? (
                          <div className="flex gap-1 flex-1">
                            <input
                              value={editProgName}
                              onChange={(e) => setEditProgName(e.target.value)}
                              className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-xs"
                            />
                            <input
                              value={editProgLevel}
                              onChange={(e) => setEditProgLevel(e.target.value)}
                              placeholder="Level"
                              className="w-24 border border-gray-300 rounded-md px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => handleSaveProgram(p.id)}
                              className="text-rgreen"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingProgramId(null)}
                              className="text-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-gray-600">
                              {p.name}
                              {p.level ? ` — ${p.level}` : ''}
                              {p.currentFee ? ` · KES ${Number(p.currentFee).toLocaleString()}` : ' · No fee set'}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setFeeInputFor(feeInputFor === p.id ? null : p.id);
                                  setFeeAmount('');
                                }}
                                className="text-rgreen underline"
                              >
                                Set fee
                              </button>
                              <button
                                onClick={() => {
                                  setEditingProgramId(p.id);
                                  setEditProgName(p.name);
                                  setEditProgLevel(p.level ?? '');
                                }}
                                className="text-gray-400 underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProgram(p.id)}
                                className="text-rmaroon underline"
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                        </div>
                        {feeInputFor === p.id && (
                          <div className="flex gap-2 mt-1 w-full">
                            <input
                              type="number"
                              value={feeAmount}
                              onChange={(e) => setFeeAmount(e.target.value)}
                              placeholder="Fee amount (KES)"
                              className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => handleSetFee(p.id)}
                              className="text-xs bg-rgreen text-white px-2 py-1 rounded-md"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'import' && (
          <div className="space-y-4">
            <form onSubmit={handleBulkImport} className="bg-white rounded-lg shadow p-4 space-y-2">
              <p className="text-sm font-medium">Import existing students (launch day)</p>
              <p className="text-xs text-gray-500">
                For students already enrolled before this platform existed — this skips the
                Apply/Review pipeline and creates their accounts directly.
              </p>
              <select
                value={importProgramId}
                onChange={(e) => setImportProgramId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">Select the class/program to import into…</option>
                {programOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                One student per line: <code>Full Name, email, admission number, phone (optional)</code>
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
                placeholder={`Jane Wanjiku, jane.wanjiku@gmail.com, RTVC/2025/00110, 0712345678\nBrian Otieno, brian.otieno@gmail.com, RTVC/2025/00111, 0723456789`}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
              />
              <button
                type="submit"
                disabled={importing}
                className="bg-rgreen text-white text-sm px-4 py-1.5 rounded-md disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import students'}
              </button>
            </form>

            {importResult && (
              <div className="bg-white rounded-lg shadow p-4 text-sm space-y-2">
                <p className="text-green-700">
                  ✔ {importResult.createdCount} student{importResult.createdCount === 1 ? '' : 's'}{' '}
                  created
                </p>
                {importResult.skippedCount > 0 && (
                  <div>
                    <p className="text-rmaroon">
                      ⚠ {importResult.skippedCount} skipped:
                    </p>
                    <ul className="text-xs text-gray-500 list-disc pl-5">
                      {importResult.skipped.map((s, i) => (
                        <li key={i}>
                          {s.row.name || '(no name)'} — {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && siteSettings && (
          <form onSubmit={handleSaveSettings} className="bg-white rounded-lg shadow p-4 space-y-3">
            <p className="text-sm font-medium">Institution settings</p>
            <p className="text-xs text-gray-500">
              Changes here apply everywhere in the app immediately — no code change needed.
            </p>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Institution name</label>
              <input
                value={settingsForm.institutionName ?? ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, institutionName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Short name</label>
              <input
                value={settingsForm.shortName ?? ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, shortName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tagline / motto</label>
              <input
                value={settingsForm.tagline ?? ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
<div>
  <label className="block text-xs text-gray-600 mb-1">About the Institution</label>
  <textarea
    value={settingsForm.about ?? ''}
    onChange={(e) => setSettingsForm({ ...settingsForm, about: e.target.value })}
    placeholder="Write a short description about the institution"
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
    rows={4}
  />
</div>

<div>
  <label className="block text-xs text-gray-600 mb-1">Physical Location</label>
  <input
    value={settingsForm.physicalLocation ?? ''}
    onChange={(e) => setSettingsForm({ ...settingsForm, physicalLocation: e.target.value })}
    placeholder="Example: Karurumo Location, Kavai Village, Embu County, Kenya"
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
  />
</div>

<div>
  <label className="block text-xs text-gray-600 mb-1">Google Maps Link</label>
  <input
    value={settingsForm.googleMapsUrl ?? ''}
    onChange={(e) => setSettingsForm({ ...settingsForm, googleMapsUrl: e.target.value })}
    placeholder="Paste Google Maps location link"
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
  />
</div>            

<div>


<div>
  <label className="block text-xs text-gray-600 mb-1">
    Institution Logo
  </label>

  <div className="flex items-center gap-3">
    <input
      type="file"
      accept="image/*"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          handleLogoUpload(file);
        }
      }}
      className="text-sm"
    />

    {uploadingLogo && (
      <span className="text-sm text-gray-500">
        Uploading...
      </span>
    )}
  </div>

  {settingsForm.logoUrl && (
    <img
      src={settingsForm.logoUrl}
      alt="Institution logo"
      className="mt-3 w-24 h-24 object-contain border rounded"
    />
  )}
</div>


            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Primary color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settingsForm.primaryColor ?? '#0B7A2B'}
                    onChange={(e) => setSettingsForm({ ...settingsForm, primaryColor: e.target.value })}
                    className="w-10 h-9 border border-gray-300 rounded-md"
                  />
                  <input
                    value={settingsForm.primaryColor ?? ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, primaryColor: e.target.value })}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Secondary color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settingsForm.secondaryColor ?? '#5C0F00'}
                    onChange={(e) => setSettingsForm({ ...settingsForm, secondaryColor: e.target.value })}
                    className="w-10 h-9 border border-gray-300 rounded-md"
                  />
                  <input
                    value={settingsForm.secondaryColor ?? ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, secondaryColor: e.target.value })}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Address</label>
              <input
                value={settingsForm.address ?? ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Phone</label>
                <input
                  value={settingsForm.phone ?? ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Email</label>
                <input
                  value={settingsForm.email ?? ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Website</label>
              <input
                value={settingsForm.website ?? ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, website: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <button type="submit" className="bg-rgreen text-white text-sm px-4 py-1.5 rounded-md">
              Save settings
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 text-center">
      <p className="text-2xl font-bold text-rgreen">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
