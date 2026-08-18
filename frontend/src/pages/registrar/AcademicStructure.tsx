import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

type Unit = {
  id: string;
  name: string;
};

type Programme = {
  id: string;
  name: string;
  level: string | null;
  entryRequirements?: string | null;
  examBody?: string | null;
  isShortCourse?: boolean;
  units: Unit[];
};

type Department = {
  id: string;
  name: string;
  programs: Programme[];
};

export default function AcademicStructure() {
  const { token } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newDepartment, setNewDepartment] = useState('');
  const [newProgramme, setNewProgramme] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [newUnit, setNewUnit] = useState('');

  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedProgramme, setSelectedProgramme] = useState<string | null>(null);

  async function loadStructure() {
    if (!token) return;

    try {
      setLoading(true);
      setError('');

      const data = await api('/academic/structure', { token });
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load academic structure');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStructure();
  }, [token]);

  async function createDepartment() {
    if (!newDepartment.trim()) return;

    try {
      await api('/academic/departments', {
        method: 'POST',
        token,
        body: { name: newDepartment.trim() },
      });

      setNewDepartment('');
      await loadStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create department');
    }
  }

  async function createProgramme() {
    if (!selectedDepartment || !newProgramme.trim()) return;

    try {
      await api(`/academic/departments/${selectedDepartment}/programmes`, {
        method: 'POST',
        token,
        body: {
          name: newProgramme.trim(),
          level: newLevel || null,
        },
      });

      setNewProgramme('');
      setNewLevel('');
      await loadStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create programme');
    }
  }

  async function createUnit() {
    if (!selectedProgramme || !newUnit.trim()) return;

    try {
      await api(`/academic/programmes/${selectedProgramme}/units`, {
        method: 'POST',
        token,
        body: { name: newUnit.trim() },
      });

      setNewUnit('');
      await loadStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create unit');
    }
  }

  const department = departments.find((d) => d.id === selectedDepartment);
  const programme = department?.programs.find(
    (p) => p.id === selectedProgramme
  );

  return (
    <PortalLayout title="Academic Structure">
      <div className="space-y-6">

        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Academic Structure
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Manage departments, programmes, levels and units.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            Loading academic structure...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Departments */}
            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-5 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">
                  Departments
                </h3>

                <div className="flex gap-2 mt-4">
                  <input
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    placeholder="New department"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />

                  <button
                    type="button"
                    onClick={createDepartment}
                    className="bg-rgreen text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {departments.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedDepartment(item.id);
                      setSelectedProgramme(null);
                    }}
                    className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${
                      selectedDepartment === item.id
                        ? 'bg-green-50 border-l-4 border-rgreen'
                        : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900">
                      {item.name}
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                      {item.programs.length} programme
                      {item.programs.length === 1 ? '' : 's'}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Programmes */}
            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-5 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">
                  Programmes
                </h3>

                {!department ? (
                  <p className="text-sm text-gray-500 mt-3">
                    Select a department.
                  </p>
                ) : (
                  <div className="space-y-2 mt-4">
                    <input
                      value={newProgramme}
                      onChange={(e) => setNewProgramme(e.target.value)}
                      placeholder="Programme name"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />

                    <select
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">No level</option>
                      <option>Level 3</option>
                      <option>Level 4</option>
                      <option>Level 5</option>
                      <option>Level 6</option>
                      <option>Foundation</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                    </select>

                    <button
                      type="button"
                      onClick={createProgramme}
                      className="w-full bg-rgreen text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Add Programme
                    </button>
                  </div>
                )}
              </div>

              <div className="divide-y divide-gray-100">
                {department?.programs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedProgramme(item.id)}
                    className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${
                      selectedProgramme === item.id
                        ? 'bg-green-50 border-l-4 border-rgreen'
                        : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900">
                      {item.name}
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                      {item.level || 'No level'} · {item.units.length} unit
                      {item.units.length === 1 ? '' : 's'}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Units */}
            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-5 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">
                  Units
                </h3>

                {!programme ? (
                  <p className="text-sm text-gray-500 mt-3">
                    Select a programme.
                  </p>
                ) : (
                  <div className="flex gap-2 mt-4">
                    <input
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      placeholder="Unit name"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />

                    <button
                      type="button"
                      onClick={createUnit}
                      className="bg-rgreen text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              <div className="divide-y divide-gray-100">
                {programme?.units.map((unit) => (
                  <div
                    key={unit.id}
                    className="px-5 py-4 text-sm text-gray-800"
                  >
                    {unit.name}
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
