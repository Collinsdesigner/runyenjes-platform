import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface EnrollmentRow {
  programName: string;
  programLevel: string | null;
  departmentName: string;
  status: string;
}

interface RegistrationRow {
  unitName: string;
  status: string;
}

export default function StudentAcademics() {
  const { token } = useAuth();

  const [term, setTerm] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/student/academics', { token })
      .then((data) => {
        setTerm(data.term);
        setEnrollments(data.enrollments);
        setRegistrations(data.registrations);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your academics'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PortalLayout title="My Academics">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Academics</h2>
          <p className="text-sm text-gray-500 mt-1">Your programme enrollment and unit registrations.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-5 border-b border-gray-200 font-semibold text-gray-900">Programme Enrollment</div>
              <div className="divide-y divide-gray-100">
                {enrollments.length === 0 && <p className="text-sm text-gray-400 p-4">No enrollment on record.</p>}
                {enrollments.map((e, i) => (
                  <div key={i} className="px-5 py-4">
                    <div className="font-medium text-gray-900">
                      {e.programName} {e.programLevel || ''}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{e.departmentName}</div>
                    <span className="inline-block mt-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{e.status}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-5 border-b border-gray-200 font-semibold text-gray-900">
                {term ? `Registered Units (${term})` : 'Registered Units'}
              </div>
              <div className="divide-y divide-gray-100">
                {registrations.length === 0 && (
                  <p className="text-sm text-gray-400 p-4">No unit registrations this term.</p>
                )}
                {registrations.map((r, i) => (
                  <div key={i} className="px-5 py-4 flex items-center justify-between">
                    <span className="text-sm text-gray-800">{r.unitName}</span>
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{r.status}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
