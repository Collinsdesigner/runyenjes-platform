import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Programme {
  id: string;
  name: string;
  level?: string | number | null;
  departmentId: string;
  department?: {
    id: string;
    name: string;
  };
}

interface Unit {
  id: string;
  name: string;
  code?: string | null;
  programId: string;
  program?: Programme;
}

interface Lecturer {
  id: string;
  name: string;
  email: string;
  departmentId?: string | null;
}

interface Term {
  id: string;
  name: string;
}

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  notes: string | null;
  unit: Unit;
  lecturer: Lecturer | null;
  term: Term;
}

interface OptionsResponse {
  programmes: Programme[];
  units: Unit[];
  lecturers: Lecturer[];
  activeTerm: Term | null;
}

interface DraftEntry {
  unitId: string;
  unitName: string;
  programName?: string;
  lecturerId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
}

const days = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const GRID_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

function hourLabel(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

export default function RegistrarTimetable() {
  const { token } = useAuth();

  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [options, setOptions] = useState<OptionsResponse>({
    programmes: [],
    units: [],
    lecturers: [],
    activeTerm: null,
  });

  const [entries, setEntries] = useState<TimetableEntry[]>([]);

  const [selectedProgramme, setSelectedProgramme] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedLecturer, setSelectedLecturer] = useState('');

  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // AI generation
  const [genMode, setGenMode] = useState<'programme' | 'department'>('programme');
  const [genProgramme, setGenProgramme] = useState('');
  const [genDepartment, setGenDepartment] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<DraftEntry[] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [genMessage, setGenMessage] = useState('');

  async function load() {
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const [optionsResponse, entriesResponse] = await Promise.all([
        api('/academic/timetable/options', { token }),
        api('/academic/timetable/entries', { token }),
      ]);

      setOptions(
        optionsResponse ?? {
          programmes: [],
          units: [],
          lecturers: [],
          activeTerm: null,
        }
      );

      setEntries(entriesResponse ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load timetable data'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedUnit('');
  }, [selectedProgramme]);

  useEffect(() => {
    if (token) {
      load();
    }
  }, [token]);

  const filteredUnits = useMemo(() => {
    if (!selectedProgramme) {
      return [];
    }

    return options.units.filter(
      (unit) => unit.programId === selectedProgramme
    );
  }, [options.units, selectedProgramme]);

  function changeProgramme(value: string) {
    setSelectedProgramme(value);
    setSelectedUnit('');
  }

  async function createEntry() {
    if (
      !token ||
      !selectedUnit ||
      !dayOfWeek ||
      !startTime ||
      !endTime
    ) {
      setError(
        'Unit, day, start time and end time are required.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await api('/academic/timetable/entries', {
        method: 'POST',
        token,
        body: {
          programId: selectedProgramme,
          unitId: selectedUnit,
          lecturerId: selectedLecturer || null,
          dayOfWeek: Number(dayOfWeek),
          startTime,
          endTime,
          room: room || null,
          notes: notes || null,
        },
      });

      setMessage('Timetable entry created successfully.');

      setSelectedUnit('');
      setSelectedLecturer('');
      setStartTime('');
      setEndTime('');
      setRoom('');
      setNotes('');

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create timetable entry'
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!token) return;

    if (!window.confirm('Delete this timetable entry?')) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await api(`/academic/timetable/entries/${id}`, {
        method: 'DELETE',
        token,
      });

      setMessage('Timetable entry deleted.');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete timetable entry'
      );
    }
  }

  async function handleGenerate() {
    if (genMode === 'programme' && !genProgramme) {
      setGenMessage('Select a programme first.');
      return;
    }
    if (genMode === 'department' && !genDepartment) {
      setGenMessage('Select a department first.');
      return;
    }
    setGenerating(true);
    setGenMessage('');
    setDraft(null);
    try {
      const data = await api('/ai/timetable-suggestion', {
        method: 'POST',
        token,
        body:
          genMode === 'programme'
            ? { programId: genProgramme }
            : { departmentId: genDepartment },
      });
      if (data.message) setGenMessage(data.message);
      if (!data.entries || data.entries.length === 0) {
        return;
      }
      const unitNameOf = (id: string) => options.units.find((u) => u.id === id)?.name || id;
      setDraft(
        data.entries.map((e: any) => ({
          unitId: e.unitId,
          unitName: unitNameOf(e.unitId),
          programName: e.programName,
          lecturerId: e.lecturerId || null,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          room: e.room || '',
        }))
      );
    } catch (err) {
      setGenMessage(err instanceof Error ? err.message : 'Could not generate a draft timetable');
    } finally {
      setGenerating(false);
    }
  }

  function updateDraftRow(index: number, patch: Partial<DraftEntry>) {
    if (!draft) return;
    const next = [...draft];
    next[index] = { ...next[index], ...patch };
    setDraft(next);
  }

  function removeDraftRow(index: number) {
    if (!draft) return;
    setDraft(draft.filter((_, i) => i !== index));
  }

  async function handleSaveDraft() {
    if (!draft || draft.length === 0) return;
    setSavingDraft(true);
    setGenMessage('');
    try {
      const result = await api('/academic/timetable/entries/bulk', {
        method: 'POST',
        token,
        body: {
          entries: draft.map((d) => ({
            unitId: d.unitId,
            lecturerId: d.lecturerId,
            dayOfWeek: d.dayOfWeek,
            startTime: d.startTime,
            endTime: d.endTime,
            room: d.room || null,
          })),
        },
      });
      const skippedCount = result.skipped?.length || 0;
      setGenMessage(
        `${result.created.length} entr${result.created.length === 1 ? 'y' : 'ies'} saved.` +
          (skippedCount > 0 ? ` ${skippedCount} skipped due to conflicts (see below).` : '')
      );
      if (skippedCount > 0) {
        setDraft(
          result.skipped.map((s: any) => ({
            unitId: s.unitId,
            unitName: options.units.find((u) => u.id === s.unitId)?.name || s.unitId,
            lecturerId: s.lecturerId || null,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room || '',
          }))
        );
      } else {
        setDraft(null);
      }
      await load();
    } catch (err) {
      setGenMessage(err instanceof Error ? err.message : 'Could not save the draft timetable');
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <PortalLayout title="Timetable Management">
      <div className="space-y-6">

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Timetable Management
            </h1>

            <p className="text-gray-500 mt-1 dark:text-gray-400">
              Create and manage the academic timetable.
            </p>
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'grid' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              List
            </button>
          </div>
        </div>

        {options.activeTerm && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 dark:bg-green-950 dark:border-green-800">
            <div className="text-sm text-green-700 dark:text-green-300">
              Active Academic Term
            </div>
            <div className="font-semibold text-green-900">
              {options.activeTerm.name}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 dark:bg-red-950 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 dark:bg-green-950 dark:border-green-800 dark:text-green-300">
            {message}
          </div>
        )}

        {/* ============ AI GENERATE ============ */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3 dark:bg-gray-900 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">✦ AI: Generate Draft Schedule</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pick a programme -- AI proposes slots for every unit that doesn't have a timetable entry yet this term.
            Nothing is saved until you review and confirm below.
          </p>
          <div className="flex bg-gray-100 rounded-lg p-1 w-fit dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setGenMode('programme')}
              className={`px-3 py-1.5 text-xs rounded-md ${genMode === 'programme' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              By Programme
            </button>
            <button
              type="button"
              onClick={() => setGenMode('department')}
              className={`px-3 py-1.5 text-xs rounded-md ${genMode === 'department' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              By Department (faster for bulk setup)
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {genMode === 'programme' ? (
              <select
                value={genProgramme}
                onChange={(e) => setGenProgramme(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              >
                <option value="">Select programme</option>
                {options.programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.level ? ` — Level ${p.level}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={genDepartment}
                onChange={(e) => setGenDepartment(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              >
                <option value="">Select department</option>
                {Array.from(new Set(options.programmes.map((p) => p.departmentId)))
                  .map((deptId) => options.programmes.find((p) => p.departmentId === deptId)?.department)
                  .filter((d): d is { id: string; name: string } => !!d)
                  .map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {generating ? (genMode === 'department' ? 'Generating (this may take a while)...' : 'Generating...') : 'Generate Draft'}
            </button>
          </div>

          {genMessage && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{genMessage}</p>
          )}

          {draft && draft.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto mt-3 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                  <tr>
                    {genMode === 'department' && <th className="px-3 py-2">Programme</th>}
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Lecturer</th>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">End</th>
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {draft.map((d, i) => (
                    <tr key={`${d.unitId}-${i}`}>
                      {genMode === 'department' && (
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{d.programName || '—'}</td>
                      )}
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{d.unitName}</td>
                      <td className="px-3 py-2">
                        <select
                          value={d.lecturerId || ''}
                          onChange={(e) => updateDraftRow(i, { lecturerId: e.target.value || null })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs dark:border-gray-600"
                        >
                          <option value="">Unassigned</option>
                          {options.lecturers.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={d.dayOfWeek}
                          onChange={(e) => updateDraftRow(i, { dayOfWeek: Number(e.target.value) })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs dark:border-gray-600"
                        >
                          {days.map((day) => (
                            <option key={day.value} value={day.value}>{day.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={d.startTime}
                          onChange={(e) => updateDraftRow(i, { startTime: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-24 dark:border-gray-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={d.endTime}
                          onChange={(e) => updateDraftRow(i, { endTime: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-24 dark:border-gray-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={d.room}
                          onChange={(e) => updateDraftRow(i, { room: e.target.value })}
                          placeholder="Room"
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-20 dark:border-gray-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeDraftRow(i)} className="text-red-600 text-xs dark:text-red-400">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft}
                  className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {savingDraft ? 'Saving...' : `Confirm & Save ${draft.length} Entries`}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ============ MANUAL SINGLE ENTRY ============ */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 dark:bg-gray-900 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 mb-5 dark:text-gray-100">
            Create Timetable Entry
          </h2>

          {loading ? (
            <div className="text-gray-500 dark:text-gray-400">
              Loading programmes, units and lecturers...
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Programme
                </label>

                <select
                  value={selectedProgramme}
                  onChange={(e) => changeProgramme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600"
                >
                  <option value="">Select programme</option>
                  {options.programmes.map((programme) => (
                    <option
                      key={programme.id}
                      value={programme.id}
                    >
                      {programme.name}
                      {programme.level
                        ? ` — Level ${programme.level}`
                        : ''}
                      {programme.department?.name
                        ? ` — ${programme.department.name}`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Unit *
                </label>

                <select
                  value={selectedUnit}
                  onChange={(e) =>
                    setSelectedUnit(e.target.value)
                  }
                  disabled={!selectedProgramme || filteredUnits.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 dark:border-gray-600"
                >
                  <option value="">
                    {!selectedProgramme
                      ? 'Select programme first'
                      : filteredUnits.length === 0
                        ? 'No units available'
                        : 'Select unit'}
                  </option>

                  {filteredUnits.map((unit) => (
                    <option
                      key={unit.id}
                      value={unit.id}
                    >
                      {unit.code ? `${unit.code} — ` : ''}
                      {unit.name}
                    </option>
                  ))}
                </select>

                {!filteredUnits.length && (
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                    No units found for this selection.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Lecturer
                </label>

                <select
                  value={selectedLecturer}
                  onChange={(e) =>
                    setSelectedLecturer(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600"
                >
                  <option value="">
                    Select lecturer
                  </option>

                  {options.lecturers.map((lecturer) => (
                    <option
                      key={lecturer.id}
                      value={lecturer.id}
                    >
                      {lecturer.name}
                      {lecturer.email
                        ? ` — ${lecturer.email}`
                        : ''}
                    </option>
                  ))}
                </select>

                {!options.lecturers.length && (
                  <p className="text-xs text-red-500 mt-1">
                    No users with TEACHER role were found.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Day *
                </label>

                <select
                  value={dayOfWeek}
                  onChange={(e) =>
                    setDayOfWeek(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600"
                >
                  {days.map((day) => (
                    <option
                      key={day.value}
                      value={day.value}
                    >
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Start Time *
                </label>

                <input
                  type="time"
                  value={startTime}
                  onChange={(e) =>
                    setStartTime(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  End Time *
                </label>

                <input
                  type="time"
                  value={endTime}
                  onChange={(e) =>
                    setEndTime(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Room
                </label>

                <input
                  value={room}
                  onChange={(e) =>
                    setRoom(e.target.value)
                  }
                  placeholder="e.g. Lab 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Notes
                </label>

                <input
                  value={notes}
                  onChange={(e) =>
                    setNotes(e.target.value)
                  }
                  placeholder="Optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  onClick={createEntry}
                  disabled={saving}
                  className="bg-rgreen text-white px-5 py-2.5 rounded-lg disabled:opacity-50"
                >
                  {saving
                    ? 'Creating...'
                    : 'Create Timetable Entry'}
                </button>
              </div>

            </div>
          )}
        </section>

        {/* ============ GRID VIEW ============ */}
        {view === 'grid' && (
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Weekly Grid</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="border border-gray-100 bg-gray-50 px-2 py-2 w-16 dark:border-gray-800 dark:bg-gray-950"></th>
                    {days.map((d) => (
                      <th key={d.value} className="border border-gray-100 bg-gray-50 px-2 py-2 text-left dark:border-gray-800 dark:bg-gray-950">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRID_HOURS.map((hour) => (
                    <tr key={hour}>
                      <td className="border border-gray-100 px-2 py-2 text-gray-400 align-top dark:border-gray-800 dark:text-gray-500">
                        {hourLabel(hour)}
                      </td>
                      {days.map((d) => {
                        const cellEntries = entries.filter((e) => {
                          const startHour = parseInt(e.startTime.split(':')[0], 10);
                          return e.dayOfWeek === d.value && startHour === hour;
                        });
                        return (
                          <td key={d.value} className="border border-gray-100 px-2 py-2 align-top min-w-[140px] dark:border-gray-800">
                            {cellEntries.map((e) => (
                              <div key={e.id} className="bg-green-50 border border-green-200 rounded-lg p-2 mb-1 dark:bg-green-950 dark:border-green-800">
                                <div className="font-medium text-gray-900 dark:text-gray-100">{e.unit.name}</div>
                                <div className="text-gray-500 dark:text-gray-400">{e.startTime}–{e.endTime}</div>
                                <div className="text-gray-500 dark:text-gray-400">{e.lecturer?.name || 'Unassigned'}</div>
                                {e.room && <div className="text-gray-400 dark:text-gray-500">{e.room}</div>}
                                <button
                                  type="button"
                                  onClick={() => deleteEntry(e.id)}
                                  className="text-red-600 mt-1 dark:text-red-400"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ============ LIST VIEW ============ */}
        {view === 'list' && (
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                Current Timetable
              </h2>
            </div>

            {entries.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No timetable entries have been created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-950">
                    <tr>
                      <th className="text-left px-4 py-3">Day</th>
                      <th className="text-left px-4 py-3">Time</th>
                      <th className="text-left px-4 py-3">Unit</th>
                      <th className="text-left px-4 py-3">Programme</th>
                      <th className="text-left px-4 py-3">Lecturer</th>
                      <th className="text-left px-4 py-3">Room</th>
                      <th className="text-left px-4 py-3">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3">
                          {days.find((day) => day.value === entry.dayOfWeek)?.label ?? entry.dayOfWeek}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.startTime} – {entry.endTime}
                        </td>
                        <td className="px-4 py-3">
                          {entry.unit.name}
                          {entry.unit.code && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{entry.unit.code}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{entry.unit.program?.name ?? '—'}</td>
                        <td className="px-4 py-3">{entry.lecturer?.name ?? 'Not assigned'}</td>
                        <td className="px-4 py-3">{entry.room ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => deleteEntry(entry.id)} className="text-red-600 hover:underline dark:text-red-400">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      </div>
    </PortalLayout>
  );
}
