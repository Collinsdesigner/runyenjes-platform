import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ClassRow {
  programId: string;
  programName: string;
  programLevel: string | null;
  units: string[];
  studentCount: number;
}

export default function TeacherClasses() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/teacher/classes', { token })
      .then((data) => {
        setTerm(data.term);
        setClasses(data.classes);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your classes'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PortalLayout title="My Classes">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Classes</h2>
          <p className="text-sm text-gray-500 mt-1">
            {term
              ? `The class cohorts you teach into this term (${term}), grouped by programme.`
              : 'No active academic term right now.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            Loading your classes...
          </div>
        ) : classes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            You are not assigned to any units this term yet, so no classes to show.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classes.map((c) => (
              <div key={c.programId} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900">
                  {c.programName} {c.programLevel || ''}
                </h3>
                <p className="text-xs text-gray-400 mt-2">
                  {c.studentCount} student{c.studentCount === 1 ? '' : 's'} across {c.units.length} unit
                  {c.units.length === 1 ? '' : 's'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.units.map((u) => (
                    <span key={u} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {u}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
