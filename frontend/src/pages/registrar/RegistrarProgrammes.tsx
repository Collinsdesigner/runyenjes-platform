import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';

interface Program {
  id: string;
  name: string;
  level: string | null;
  entryRequirements: string | null;
  examBody: string | null;
  isShortCourse: boolean;
  currentFee: number | null;
}

interface Department {
  id: string;
  name: string;
  programs: Program[];
}

export default function RegistrarProgrammes() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadPrograms() {
      try {
        setLoading(true);
        setError('');

        const data = await api('/programs');
        setDepartments(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load programmes and departments'
        );
      } finally {
        setLoading(false);
      }
    }

    loadPrograms();
  }, []);

  const filteredDepartments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return departments
      .filter((department) => {
        if (selectedDepartment === 'ALL') return true;
        return department.id === selectedDepartment;
      })
      .map((department) => ({
        ...department,
        programs: department.programs.filter((program) => {
          if (!query) return true;

          return (
            program.name.toLowerCase().includes(query) ||
            (program.level ?? '').toLowerCase().includes(query) ||
            (program.examBody ?? '').toLowerCase().includes(query) ||
            (program.entryRequirements ?? '').toLowerCase().includes(query)
          );
        }),
      }))
      .filter((department) => department.programs.length > 0);
  }, [departments, selectedDepartment, search]);

  const totalPrograms = departments.reduce(
    (total, department) => total + department.programs.length,
    0
  );

  return (
    <PortalLayout title="Programmes & Departments">
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Programmes & Departments
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            View and manage the institution's departments and academic
            programmes.
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-500">
              Departments
            </p>

            <p className="text-3xl font-bold text-gray-900 mt-2">
              {loading ? '—' : departments.length}
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-500">
              Programmes
            </p>

            <p className="text-3xl font-bold text-gray-900 mt-2">
              {loading ? '—' : totalPrograms}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>

              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
              >
                <option value="ALL">All departments</option>

                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search programme, level, exam body..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
              />
            </div>

          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            Loading programmes and departments...
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filteredDepartments.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            No programmes found.
          </div>
        )}

        {/* Departments and programmes */}
        {!loading && filteredDepartments.length > 0 && (
          <div className="space-y-6">
            {filteredDepartments.map((department) => (
              <section
                key={department.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Department header */}
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {department.name}
                      </h3>

                      <p className="text-sm text-gray-500 mt-1">
                        {department.programs.length}{' '}
                        programme
                        {department.programs.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Programme table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">
                          Programme
                        </th>

                        <th className="text-left px-5 py-3 font-medium text-gray-600">
                          Level
                        </th>

                        <th className="text-left px-5 py-3 font-medium text-gray-600">
                          Exam Body
                        </th>

                        <th className="text-left px-5 py-3 font-medium text-gray-600">
                          Type
                        </th>

                        <th className="text-left px-5 py-3 font-medium text-gray-600">
                          Current Fee
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {department.programs.map((program) => (
                        <tr
                          key={program.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-5 py-4">
                            <div className="font-medium text-gray-900">
                              {program.name}
                            </div>

                            {program.entryRequirements && (
                              <div className="text-xs text-gray-500 mt-1 max-w-md">
                                Entry: {program.entryRequirements}
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {program.level ?? '—'}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {program.examBody ?? '—'}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={
                                program.isShortCourse
                                  ? 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700'
                                  : 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700'
                              }
                            >
                              {program.isShortCourse
                                ? 'Short Course'
                                : 'Regular'}
                            </span>
                          </td>

                          <td className="px-5 py-4 font-medium text-gray-900">
                            {program.currentFee !== null
                              ? `KES ${Number(program.currentFee).toLocaleString()}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

      </div>
    </PortalLayout>
  );
}
