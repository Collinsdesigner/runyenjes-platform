import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Programme {
  id: string;
  name: string;
  level: string | null;
}

interface Department {
  id: string;
  name: string;
  programs: Programme[];
}

interface EnrolledStudent {
  studentId: string;
  name: string;
  email: string;
  admissionNumber: string | null;
  status: string;
}

export default function RegistrarAcademicRecords() {
  const { token } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedProgramme, setSelectedProgramme] = useState<string | null>(null);

  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/academic/structure', { token })
      .then(setDepartments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load academic structure'))
      .finally(() => setLoading(false));
  }, [token]);

  async function selectProgramme(programId: string) {
    setSelectedProgramme(programId);
    setStudentsLoading(true);
    setError('');
    try {
      const data = await api(`/registrar/programmes/${programId}/students`, { token });
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load enrolled students');
    } finally {
      setStudentsLoading(false);
    }
  }

  const department = departments.find((d) => d.id === selectedDepartment);
  const programme = department?.programs.find((p) => p.id === selectedProgramme);

  return (
    <PortalLayout title="Academic Records">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Academic Records</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Browse by department and programme to see who is actually enrolled.
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>}

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">Departments</div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {departments.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedDepartment(d.id);
                      setSelectedProgramme(null);
                      setStudents([]);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedDepartment === d.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">Programmes</div>
              {!department ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">Select a department.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {department.programs.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProgramme(p.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                        selectedProgramme === p.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                      }`}
                    >
                      {p.name} {p.level || ''}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
                {programme ? `Enrolled — ${programme.name}` : 'Enrolled Students'}
              </div>
              {!programme ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">Select a programme.</p>
              ) : studentsLoading ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">Loading...</p>
              ) : students.length === 0 ? (
                <p className="text-sm text-gray-400 p-4 dark:text-gray-500">No students enrolled in this programme yet.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {students.map((s) => (
                    <Link
                      key={s.studentId}
                      to={`/registrar/students/${s.studentId}/academic`}
                      className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="font-medium text-gray-900 text-sm dark:text-gray-100">{s.name}</div>
                      <div className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                        {s.admissionNumber || 'No admission number'} · {s.status}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
