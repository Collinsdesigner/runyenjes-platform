import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StaffProfile {
  id: string;
  employeeNumber: string | null;
  position: string | null;
  employmentType: string;
  status: string;
  user: { id: string; name: string; email: string; role: string };
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  staff: { id: string; name: string; email: string };
}

export default function HrStaff() {
  const { token } = useAuth();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [userId, setUserId] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [position, setPosition] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [staffData, leaveData] = await Promise.all([
        api('/hr/staff', { token }),
        api('/hr/leave-requests', { token }),
      ]);
      setStaff(staffData);
      setLeave(leaveData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load HR data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!userId) {
      setError('User ID is required');
      return;
    }
    try {
      await api('/hr/staff', {
        method: 'POST',
        token,
        body: {
          userId: userId.trim(),
          employeeNumber: employeeNumber || undefined,
          position: position || undefined,
          employmentType,
        },
      });
      setMessage('Staff profile created');
      setUserId('');
      setEmployeeNumber('');
      setPosition('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create staff profile');
    }
  }

  async function handleDecision(id: string, decision: 'APPROVED' | 'REJECTED') {
    setError('');
    try {
      await api(`/hr/leave-requests/${id}/decision`, { method: 'PATCH', token, body: { decision } });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update leave request');
    }
  }

  return (
    <PortalLayout title="Staff & Leave">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff & Leave</h2>
          <p className="text-sm text-gray-500 mt-1">Staff profiles and leave request approvals.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateStaff} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Staff Profile</h3>
          <p className="text-xs text-gray-400">
            User ID is the staff member's account ID (create the account in Admin &gt; Users first).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Employee number (optional)"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Position (optional)"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            >
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Staff Profile
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">Staff Profiles</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Employee #</th>
                <th className="px-4 py-2">Position</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && staff.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No staff profiles yet</td></tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{s.user?.name}</td>
                  <td className="px-4 py-2">{s.employeeNumber || '—'}</td>
                  <td className="px-4 py-2">{s.position || '—'}</td>
                  <td className="px-4 py-2">{s.employmentType}</td>
                  <td className="px-4 py-2">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">Leave Requests</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Staff</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Dates</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {leave.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No leave requests</td></tr>
              )}
              {leave.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{l.staff?.name}</td>
                  <td className="px-4 py-2">{l.type}</td>
                  <td className="px-4 py-2">
                    {new Date(l.startDate).toLocaleDateString()} → {new Date(l.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">{l.status}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {l.status === 'PENDING' && (
                      <>
                        <button
                          className="text-green-600 text-xs font-medium"
                          onClick={() => handleDecision(l.id, 'APPROVED')}
                        >
                          Approve
                        </button>
                        <button
                          className="text-red-600 text-xs font-medium"
                          onClick={() => handleDecision(l.id, 'REJECTED')}
                        >
                          Reject
                        </button>
                      </>
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
