import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Programme {
  id: string;
  name: string;
  level: string | null;
  department: { id: string; name: string };
}

interface Material {
  id: string;
  fileUrl: string;
  type: string;
  uploader: { name: string };
}

interface Unit {
  id: string;
  name: string;
  materials: Material[];
}

export default function AdminLibrary() {
  const { token } = useAuth();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newUnitName, setNewUnitName] = useState('');
  const [materialFormUnitId, setMaterialFormUnitId] = useState<string | null>(null);
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialType, setMaterialType] = useState('pdf');

  useEffect(() => {
    if (!token) return;
    api('/academic/programmes', { token })
      .then((data) => setProgrammes(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load programmes'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadUnits(programId: string) {
    setSelectedProgramId(programId);
    if (!programId) {
      setUnits([]);
      return;
    }
    try {
      const data = await api(`/library/programs/${programId}/units`, { token });
      setUnits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load units');
    }
  }

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!selectedProgramId || !newUnitName) return;
    try {
      await api(`/library/programs/${selectedProgramId}/units`, {
        method: 'POST',
        token,
        body: { name: newUnitName },
      });
      setMessage('Unit added');
      setNewUnitName('');
      loadUnits(selectedProgramId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add unit');
    }
  }

  async function handleAddMaterial(unitId: string) {
    setError('');
    setMessage('');
    if (!materialUrl) return;
    try {
      await api(`/library/units/${unitId}/materials`, {
        method: 'POST',
        token,
        body: { fileUrl: materialUrl, type: materialType },
      });
      setMessage('Material added');
      setMaterialFormUnitId(null);
      setMaterialUrl('');
      loadUnits(selectedProgramId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add material');
    }
  }

  async function handleDeleteUnit(unitId: string) {
    setError('');
    setMessage('');
    try {
      await api(`/library/units/${unitId}`, { method: 'DELETE', token });
      setMessage('Unit deleted');
      loadUnits(selectedProgramId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete unit');
    }
  }

  return (
    <PortalLayout title="Library">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Library</h2>
          <p className="text-sm text-gray-500 mt-1">Manage units and learning materials per programme.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-96"
          value={selectedProgramId}
          onChange={(e) => loadUnits(e.target.value)}
        >
          <option value="">{loading ? 'Loading programmes...' : 'Select a programme'}</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.department.name} — {p.name} {p.level || ''}
            </option>
          ))}
        </select>

        {selectedProgramId && (
          <>
            <form onSubmit={handleAddUnit} className="bg-white border border-gray-200 rounded-lg p-5 flex gap-3">
              <input
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="New unit name"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
              />
              <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
                Add Unit
              </button>
            </form>

            <div className="space-y-3">
              {units.map((unit) => (
                <div key={unit.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{unit.name}</h3>
                    <div className="space-x-3">
                      <button
                        className="text-rgreen text-xs font-medium"
                        onClick={() => setMaterialFormUnitId(materialFormUnitId === unit.id ? null : unit.id)}
                      >
                        {materialFormUnitId === unit.id ? 'Cancel' : 'Add material'}
                      </button>
                      <button className="text-red-600 text-xs font-medium" onClick={() => handleDeleteUnit(unit.id)}>
                        Delete unit
                      </button>
                    </div>
                  </div>

                  {materialFormUnitId === unit.id && (
                    <div className="flex flex-wrap gap-2 items-center mt-3">
                      <input
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm flex-1 min-w-[200px]"
                        placeholder="Material URL"
                        value={materialUrl}
                        onChange={(e) => setMaterialUrl(e.target.value)}
                      />
                      <select
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                        value={materialType}
                        onChange={(e) => setMaterialType(e.target.value)}
                      >
                        <option value="pdf">PDF</option>
                        <option value="slides">Slides</option>
                        <option value="video">Video</option>
                        <option value="external-link">External link</option>
                      </select>
                      <button
                        className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                        onClick={() => handleAddMaterial(unit.id)}
                      >
                        Save
                      </button>
                    </div>
                  )}

                  {unit.materials.length > 0 && (
                    <ul className="mt-3 text-xs text-gray-500 space-y-1">
                      {unit.materials.map((m) => (
                        <li key={m.id}>
                          [{m.type}] {m.fileUrl} — uploaded by {m.uploader.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
