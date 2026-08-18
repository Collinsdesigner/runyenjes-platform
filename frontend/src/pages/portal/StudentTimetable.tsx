import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  notes: string | null;
  unit: {
    id: string;
    name: string;
    code?: string | null;
  };
  lecturer: {
    id: string;
    name: string;
    email?: string | null;
  } | null;
}

interface TimetableResponse {
  term: {
    id: string;
    name: string;
  } | null;
  entries: TimetableEntry[];
}

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function StudentTimetable() {
  const { user, token } = useAuth();

  const [data, setData] = useState<TimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!token) return;

      setLoading(true);
      setError('');

      try {
        const response = await api(
          '/academic/timetable/student-live',
          {
            token,
          }
        );

        setData(response ?? { term: null, entries: [] });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load your timetable'
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  const grouped = useMemo(() => {
    const result: Record<number, TimetableEntry[]> = {};

    for (const entry of data?.entries ?? []) {
      if (!result[entry.dayOfWeek]) {
        result[entry.dayOfWeek] = [];
      }

      result[entry.dayOfWeek].push(entry);
    }

    return result;
  }, [data]);

  if (loading) {
    return (
      <PortalLayout title="My Timetable">
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
          Loading your timetable...
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout title="My Timetable">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-5">
          <div className="font-semibold mb-1">
            Could not load timetable
          </div>
          <div className="text-sm">
            {error}
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="My Timetable">
      <div className="space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            My Timetable
          </h1>

          <p className="text-gray-500 mt-1">
            Welcome, {user?.name}
          </p>

          <p className="text-sm text-gray-500 mt-1">
            Your scheduled classes, lecturers and rooms.
          </p>
        </div>

        {!data?.entries?.length ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <div className="text-4xl mb-3">▦</div>

            <h2 className="font-semibold text-gray-900">
              No timetable published yet
            </h2>

            <p className="text-sm text-gray-500 mt-2">
              Your timetable will appear here once the Registrar
              schedules classes for your registered units.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {days.map((day, index) => {
              const dayEntries = grouped[index + 1] ?? [];

              if (!dayEntries.length) {
                return null;
              }

              return (
                <section
                  key={day}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-900">
                      {day}
                    </h2>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-5 grid gap-4 md:grid-cols-4"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {entry.startTime} – {entry.endTime}
                          </div>
                        </div>

                        <div>
                          <div className="font-semibold text-gray-900">
                            {entry.unit.name}
                          </div>

                          {entry.unit.code && (
                            <div className="text-xs text-gray-500">
                              {entry.unit.code}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-sm text-gray-700">
                            {entry.lecturer?.name ?? 'Lecturer not assigned'}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm text-gray-700">
                            {entry.room ?? 'Room not assigned'}
                          </div>

                          {entry.notes && (
                            <div className="text-xs text-gray-500 mt-1">
                              {entry.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

      </div>
    </PortalLayout>
  );
}
