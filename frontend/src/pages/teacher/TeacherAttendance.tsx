import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UnitOption {
  unitId: string;
  unitName: string;
}

interface RosterRow {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  status: string | null;
}

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function TeacherAttendance() {
  const { token } = useAuth();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitId, setUnitId] = useState('');
  const [date, setDate] = useState(todayISO());

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/teacher/units', { token })
      .then((data) => setUnits(data.units.map((u: any) => ({ unitId: u.unitId, unitName: u.unitName }))))
      .catch(() => {});
  }, [token]);

  async function loadRoster() {
    if (!unitId || !date) return;
    setLoading(true);
    setError('');
    try {
      const data = await api(`/teacher/attendance/roster?unitId=${unitId}&date=${date}`, { token });
      setRoster(data.roster);
      const initialDrafts: Record<string, string> = {};
      data.roster.forEach((r: RosterRow) => {
        initialDrafts[r.studentId] = r.status || 'PRESENT';
      });
      setDrafts(initialDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load roster');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (unitId && date) loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, date]);

  async function handleSave() {
    if (!unitId || !date) return;
    setError('');
    setMessage('');
    try {
      const records = roster.map((r) => ({ studentId: r.studentId, status: drafts[r.studentId] || 'PRESENT' }));
      await api('/teacher/attendance', {
        method: 'POST',
        token,
        body: { unitId, date, records },
      });
      setMessage('Attendance saved');
      loadRoster();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save attendance');
    }
  }

  async function handleAskAI() {
    setAiLoading(true);
    setAiError('');
    setAiReply('');
    try {
      const data = await api('/ai/assist', {
        method: 'POST',
        token,
        body: { action: 'teacher_attendance_patterns' },
      });
      setAiReply(data.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <PortalLayout title="Attendance">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Attendance</h2>
            <p className="text-sm text-gray-500 mt-1">Take attendance for one of your units, for a given date.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAI}
            disabled={aiLoading}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {aiLoading ? 'Thinking...' : '✦ AI: Attendance Patterns'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>}
        {aiError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{aiError}</div>}
        {aiReply && (
          <div className="bg-green-50 border border-green-200 text-gray-800 rounded-lg p-4 text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Unit</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>{u.unitName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400">Loading roster...</p>}

        {!loading && unitId && roster.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            No students registered in this unit yet.
          </div>
        )}

        {!loading && roster.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="divide-y divide-gray-100">
              {roster.map((r) => (
                <div key={r.studentId} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{r.name}</div>
                    <div className="text-xs text-gray-400">{r.admissionNumber || 'No admission number'}</div>
                  </div>
                  <select
                    value={drafts[r.studentId] || 'PRESENT'}
                    onChange={(e) => setDrafts({ ...drafts, [r.studentId]: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleSave}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                Save Attendance
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
