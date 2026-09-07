import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UnitRow {
  unitId: string;
  unitName: string;
  programmeName: string;
  programmeLevel: string | null;
  studentCount: number;
}

export default function TeacherUnits() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/units', { token })
      .then((data) => {
        setTerm(data.term);
        setUnits(data.units);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your units'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PortalLayout title="My Units">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Units</h2>
          <p className="text-sm text-gray-500 mt-1">
            {term ? `Units you are assigned to teach this term (${term}).` : 'No active academic term right now.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            Loading your units...
          </div>
        ) : units.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            You are not assigned to any units this term yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {units.map((u) => (
              <div key={u.unitId} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900">{u.unitName}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {u.programmeName} {u.programmeLevel || ''}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {u.studentCount} student{u.studentCount === 1 ? '' : 's'} registered
                </p>
                <Link
                  to={`/library/units/${u.unitId}/tutor`}
                  className="inline-block mt-3 text-xs font-medium text-rgreen"
                >
                  Open AI Unit Tutor for this unit →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
