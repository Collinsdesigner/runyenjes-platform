import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Material {
  id: string;
  fileUrl: string;
  type: string;
  uploader: { name: string };
  createdAt: string;
}

interface Unit {
  id: string;
  name: string;
  materials: Material[];
}

export default function LibraryUnits() {
  const { programId } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newUnitName, setNewUnitName] = useState('');
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, { url: string; type: string }>>({});

  const canManage = user && ['TEACHER', 'ADMIN', 'FOUNDER'].includes(user.role);

  async function load() {
    if (!programId) return;
    setLoading(true);
    try {
      const data = await api(`/library/programs/${programId}/units`, { token });
      setUnits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load units');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [programId]);

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!newUnitName.trim() || !programId) return;
    if (/^https?:\/\//i.test(newUnitName.trim())) {
      setError(
        'That looks like a link, not a unit name. Add the unit first (e.g. "Networking Fundamentals"), then paste the link into that unit\'s material box below.'
      );
      return;
    }
    try {
      await api(`/library/programs/${programId}/units`, {
        method: 'POST',
        body: { name: newUnitName },
        token,
      });
      setNewUnitName('');
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add unit');
    }
  }

  async function handleAddMaterial(unitId: string) {
    const draft = materialDrafts[unitId];
    if (!draft?.url?.trim()) {
      setError('Please paste a link before clicking Add.');
      return;
    }
    if (!draft?.type?.trim()) {
      setError('Please choose a material type before clicking Add.');
      return;
    }
    try {
      await api(`/library/units/${unitId}/materials`, {
        method: 'POST',
        body: { fileUrl: draft.url.trim(), type: draft.type.trim() },
        token,
      });
      setMaterialDrafts((prev) => ({ ...prev, [unitId]: { url: '', type: '' } }));
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add material');
    }
  }

  async function handleDeleteUnit(unitId: string) {
    if (!confirm('Delete this unit and all its materials? This cannot be undone.')) return;
    try {
      await api(`/library/units/${unitId}`, { method: 'DELETE', token });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete unit');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/library')} className="text-sm text-gray-500 underline">
          ← Library
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

        {canManage && (
          <form onSubmit={handleAddUnit} className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500 mb-1">
              Add a new unit (a topic name, not a link — e.g. "Networking Fundamentals")
            </p>
            <div className="flex gap-2">
              <input
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                placeholder="New unit name…"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-rgreen text-white text-sm px-3 py-2 rounded-md">
                Add unit
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 text-center">Loading…</p>
        ) : units.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">No units added yet.</p>
        ) : (
          units.map((unit) => (
            <div key={unit.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{unit.name}</p>
                {canManage && (
                  <button
                    onClick={() => handleDeleteUnit(unit.id)}
                    className="text-xs text-rmaroon underline"
                  >
                    Delete
                  </button>
                )}
              </div>

              {unit.materials.length === 0 ? (
                <p className="text-xs text-gray-400 mb-2">No materials yet.</p>
              ) : (
                <ul className="space-y-1 mb-2">
                  {unit.materials.map((m) => (
                    <li key={m.id} className="text-sm">
                      <a
                        href={m.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-rgreen underline"
                      >
                        {m.type}
                      </a>{' '}
                      <span className="text-xs text-gray-400">— {m.uploader.name}</span>
                    </li>
                  ))}
                </ul>
              )}

              {canManage && (
                <div className="flex gap-2 mt-2">
                  <input
                    placeholder="Paste link here (Drive, KNEC/CDACC page, etc.)"
                    value={materialDrafts[unit.id]?.url ?? ''}
                    onChange={(e) =>
                      setMaterialDrafts((prev) => ({
                        ...prev,
                        [unit.id]: { ...prev[unit.id], url: e.target.value, type: prev[unit.id]?.type ?? '' },
                      }))
                    }
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs"
                  />
                  <select
                    value={materialDrafts[unit.id]?.type ?? ''}
                    onChange={(e) =>
                      setMaterialDrafts((prev) => ({
                        ...prev,
                        [unit.id]: { ...prev[unit.id], type: e.target.value, url: prev[unit.id]?.url ?? '' },
                      }))
                    }
                    className="w-28 border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
                  >
                    <option value="">Type…</option>
                    <option value="pdf">PDF</option>
                    <option value="slides">Slides</option>
                    <option value="video">Video</option>
                    <option value="external-link">External link</option>
                    <option value="past-paper">Past paper</option>
                  </select>
                  <button
                    onClick={() => handleAddMaterial(unit.id)}
                    className="text-xs bg-rgreen text-white px-2 py-1 rounded-md"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
