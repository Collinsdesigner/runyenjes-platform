import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StaffProfile {
  employeeNumber: string | null;
  position: string | null;
  employmentType: string;
  status: string;
  dateHired: string | null;
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
}

export default function WorkersPortal() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [profileData, leaveData] = await Promise.all([
        api('/hr/my-staff-profile', { token }).catch(() => null),
        api('/hr/my-leave-requests', { token }),
      ]);
      setProfile(profileData);
      setLeaveRequests(leaveData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your work info');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleRequestLeave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!startDate || !endDate) {
      setError('Start and end dates are required');
      return;
    }
    try {
      await api('/hr/leave-requests', {
        method: 'POST',
        token,
        body: { type: leaveType, startDate, endDate, reason: reason || undefined },
      });
      setMessage('Leave request submitted');
      setStartDate('');
      setEndDate('');
      setReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit leave request');
    }
  }

  return (
    <PortalLayout title="My Work">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Work</h2>
          <p className="text-sm text-gray-500 mt-1">Your staff profile and leave requests.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="font-semibold text-gray-900 mb-3">My Staff Profile</h3>
            {profile ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Employee #</p>
                  <p className="font-medium">{profile.employeeNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Position</p>
                  <p className="font-medium">{profile.position || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Employment</p>
                  <p className="font-medium">{profile.employmentType}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p className="font-medium">{profile.status}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No staff profile has been set up for your account yet \u2014 ask HR to create one.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleRequestLeave} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Request Leave</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              <option value="ANNUAL">Annual</option>
              <option value="SICK">Sick</option>
              <option value="MATERNITY">Maternity</option>
              <option value="PATERNITY">Paternity</option>
              <option value="UNPAID">Unpaid</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Submit Request
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">
            My Leave Requests
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Dates</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No leave requests yet</td></tr>
              )}
              {leaveRequests.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{l.type}</td>
                  <td className="px-4 py-2">
                    {new Date(l.startDate).toLocaleDateString()} \u2192 {new Date(l.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{l.status}</span>
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
