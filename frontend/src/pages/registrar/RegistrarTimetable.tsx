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

const days = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export default function RegistrarTimetable() {
  const { token } = useAuth();

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

  return (
    <PortalLayout title="Timetable Management">
      <div className="space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Timetable Management
          </h1>

          <p className="text-gray-500 mt-1">
            Create and manage the academic timetable.
          </p>
        </div>

        {options.activeTerm && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-sm text-green-700">
              Active Academic Term
            </div>
            <div className="font-semibold text-green-900">
              {options.activeTerm.name}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4">
            {message}
          </div>
        )}

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-5">
            Create Timetable Entry
          </h2>

          {loading ? (
            <div className="text-gray-500">
              Loading programmes, units and lecturers...
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">

              <div>
<label className="block text-sm font-medium text-gray-700 mb-1">
                  Programme
                </label>

                <select
                  value={selectedProgramme}
                  onChange={(e) =>
                    changeProgramme(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">
                    Select programme
                  </option>

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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit *
                </label>

                <select
                  value={selectedUnit}
                  onChange={(e) =>
                    setSelectedUnit(e.target.value)
                  }
                  disabled={!selectedProgramme || filteredUnits.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100"
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
                  <p className="text-xs text-gray-500 mt-1">
                    No units found for this selection.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lecturer
                </label>

                <select
                  value={selectedLecturer}
                  onChange={(e) =>
                    setSelectedLecturer(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Day *
                </label>

                <select
                  value={dayOfWeek}
                  onChange={(e) =>
                    setDayOfWeek(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time *
                </label>

                <input
                  type="time"
                  value={startTime}
                  onChange={(e) =>
                    setStartTime(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time *
                </label>

                <input
                  type="time"
                  value={endTime}
                  onChange={(e) =>
                    setEndTime(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Room
                </label>

                <input
                  value={room}
                  onChange={(e) =>
                    setRoom(e.target.value)
                  }
                  placeholder="e.g. Lab 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>

                <input
                  value={notes}
                  onChange={(e) =>
                    setNotes(e.target.value)
                  }
                  placeholder="Optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
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

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Current Timetable
            </h2>
          </div>

          {entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No timetable entries have been created yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3">
                      Day
                    </th>
                    <th className="text-left px-4 py-3">
                      Time
                    </th>
                    <th className="text-left px-4 py-3">
                      Unit
                    </th>
                    <th className="text-left px-4 py-3">
                      Programme
                    </th>
                    <th className="text-left px-4 py-3">
                      Lecturer
                    </th>
                    <th className="text-left px-4 py-3">
                      Room
                    </th>
                    <th className="text-left px-4 py-3">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3">
                        {days.find(
                          (day) =>
                            day.value === entry.dayOfWeek
                        )?.label ?? entry.dayOfWeek}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {entry.startTime} – {entry.endTime}
                      </td>

                      <td className="px-4 py-3">
                        {entry.unit.name}
                        {entry.unit.code && (
                          <div className="text-xs text-gray-500">
                            {entry.unit.code}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {entry.unit.program?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        {entry.lecturer?.name ??
                          'Not assigned'}
                      </td>

                      <td className="px-4 py-3">
                        {entry.room ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            deleteEntry(entry.id)
                          }
                          className="text-red-600 hover:underline"
                        >
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

      </div>
    </PortalLayout>
  );
}
