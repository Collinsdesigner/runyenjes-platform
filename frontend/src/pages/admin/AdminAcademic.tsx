import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Fee {
  id: string;
  amount: string;
  effectiveFrom: string;
}

interface Programme {
  id: string;
  name: string;
  level: string | null;
  isShortCourse: boolean;
  fees: Fee[];
}

interface Department {
  id: string;
  name: string;
  programs: Programme[];
}

export default function AdminAcademic() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newDeptName, setNewDeptName] = useState('');
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [newProgName, setNewProgName] = useState('');
  const [newProgLevel, setNewProgLevel] = useState('');
  const [feeAmount, setFeeAmount] = useState<Record<string, string>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/academic/structure', { token });
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load academic structure');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAddDepartment(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!newDeptName.trim()) return;
    try {
      await api('/admin/departments', { method: 'POST', token, body: { name: newDeptName.trim() } });
      setMessage('Department created');
      setNewDeptName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create department');
    }
  }

  async function handleDeleteDepartment(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/admin/departments/${id}`, { method: 'DELETE', token });
      setMessage('Department deleted');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete department');
    }
  }

  async function handleAddProgramme(deptId: string) {
    setError('');
    setMessage('');
    if (!newProgName.trim()) return;
    try {
      await api(`/admin/departments/${deptId}/programs`, {
        method: 'POST',
        token,
        body: { name: newProgName.trim(), level: newProgLevel || undefined },
      });
      setMessage('Programme created');
      setNewProgName('');
      setNewProgLevel('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create programme');
    }
  }

  async function handleDeleteProgramme(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/admin/programs/${id}`, { method: 'DELETE', token });
      setMessage('Programme deleted');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete programme');
    }
  }

  async function handleSetFee(programId: string) {
    setError('');
    setMessage('');
    const amount = feeAmount[programId];
    if (!amount) return;
    try {
      await api(`/admin/programs/${programId}/fee`, { method: 'POST', token, body: { amount: Number(amount) } });
      setMessage('Fee updated');
      setFeeAmount((prev) => ({ ...prev, [programId]: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set fee');
    }
  }

  return (
    <PortalLayout title="Academic Structure">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Academic Structure</h2>
          <p className="text-sm text-gray-500 mt-1">Departments, programmes and fees.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleAddDepartment} className="bg-white border border-gray-200 rounded-lg p-5 flex gap-3">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="New department name"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
          />
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Add Department
          </button>
        </form>

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        <div className="space-y-3">
          {departments.map((dept) => (
            <div key={dept.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <button
                  className="font-semibold text-gray-900 text-left"
                  onClick={() => setExpandedDeptId(expandedDeptId === dept.id ? null : dept.id)}
                >
                  {dept.name} <span className="text-xs text-gray-400">({dept.programs.length} programmes)</span>
                </button>
                <button className="text-red-600 text-xs font-medium" onClick={() => handleDeleteDepartment(dept.id)}>
                  Delete department
                </button>
              </div>

              {expandedDeptId === dept.id && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      placeholder="Programme name"
                      value={newProgName}
                      onChange={(e) => setNewProgName(e.target.value)}
                    />
                    <input
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-32"
                      placeholder="Level (optional)"
                      value={newProgLevel}
                      onChange={(e) => setNewProgLevel(e.target.value)}
                    />
                    <button
                      className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                      onClick={() => handleAddProgramme(dept.id)}
                    >
                      Add Programme
                    </button>
                  </div>

                  <table className="w-full text-xs">
                    <thead className="text-gray-500 text-left">
                      <tr>
                        <th className="pr-4 py-1">Programme</th>
                        <th className="pr-4 py-1">Current fee</th>
                        <th className="pr-4 py-1">Set new fee</th>
                        <th className="pr-4 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dept.programs.map((p) => (
                        <tr key={p.id} className="border-t border-gray-100">
                          <td className="pr-4 py-1">{p.name} {p.level || ''}</td>
                          <td className="pr-4 py-1">{p.fees[0] ? `KES ${p.fees[0].amount}` : '—'}</td>
                          <td className="pr-4 py-1">
                            <div className="flex gap-1">
                              <input
                                className="border border-gray-300 rounded px-2 py-0.5 text-xs w-24"
                                placeholder="Amount"
                                value={feeAmount[p.id] || ''}
                                onChange={(e) => setFeeAmount((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              />
                              <button
                                className="text-rgreen font-medium"
                                onClick={() => handleSetFee(p.id)}
                              >
                                Save
                              </button>
                            </div>
                          </td>
                          <td className="pr-4 py-1">
                            <button
                              className="text-red-600 font-medium"
                              onClick={() => handleDeleteProgramme(p.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
