import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

type Student = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  admissionNumber: string | null;
  status: string;
  createdAt: string;
  department: {
    id: string;
    name: string;
  } | null;
  program: {
    id: string;
    name: string;
    level: string | null;
  } | null;
  intake: string | null;
  applicationId: string | null;
};

export default function RegistrarStudents() {
  const { token } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadStudents(searchValue = '') {
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const query = searchValue.trim()
        ? `?search=${encodeURIComponent(searchValue.trim())}`
        : '';

      const data = await api(`/registrar/students${query}`, {
        token,
      });

      setStudents(data.students ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load student records'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
  }, [token]);

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    loadStudents(search);
  }

  return (
    <PortalLayout title="Student Records">
      <div className="space-y-6">

        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Student Records
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Search and manage registered student records.
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="bg-white border border-gray-200 rounded-lg p-4"
        >
          <div className="flex flex-col sm:flex-row gap-3">

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, admission number, email or phone..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
            />

            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-rgreen text-white text-sm font-medium hover:opacity-90"
            >
              Search
            </button>

            <button
              type="button"
              onClick={() => {
                setSearch('');
                loadStudents();
              }}
              className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Clear
            </button>

          </div>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">

          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">
                Registered Students
              </h3>

              <p className="text-sm text-gray-500 mt-1">
                {loading ? 'Loading...' : `${students.length} student${students.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Loading student records...
            </div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No student records found.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="min-w-full text-sm">

                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">
                      Student
                    </th>

                    <th className="text-left px-5 py-3 font-medium text-gray-600">
                      Admission No.
                    </th>

                    <th className="text-left px-5 py-3 font-medium text-gray-600">
                      Program
                    </th>

                    <th className="text-left px-5 py-3 font-medium text-gray-600">
                      Department
                    </th>

                    <th className="text-left px-5 py-3 font-medium text-gray-600">
                      Intake
                    </th>

                    <th className="text-left px-5 py-3 font-medium text-gray-600">
                      Status
                    </th>


                    <th className="text-left px-5 py-3 font-medium text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">

                  {students.map((student) => (
                    <tr
                      key={student.id}
                      className="hover:bg-gray-50"
                    >

                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">
                          {student.name}
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                          {student.email}
                        </div>

                        {student.phone && (
                          <div className="text-xs text-gray-400 mt-1">
                            {student.phone}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 font-medium text-gray-900">
                        {student.admissionNumber ?? '—'}
                      </td>

                      <td className="px-5 py-4">
                        {student.program ? (
                          <>
                            <div className="text-gray-900">
                              {student.program.name}
                            </div>

                            {student.program.level && (
                              <div className="text-xs text-gray-500 mt-1">
                                {student.program.level}
                              </div>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {student.department?.name ?? '—'}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {student.intake ?? '—'}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            student.status === 'ACTIVE'
                              ? 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700'
                              : 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600'
                          }
                        >
                          {student.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          to={`/registrar/students/${student.id}/academic`}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-rgreen text-white text-xs font-medium hover:opacity-90"
                        >
                          Manage Academic
                        </Link>
                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>
          )}

        </div>

      </div>
    </PortalLayout>
  );
}
