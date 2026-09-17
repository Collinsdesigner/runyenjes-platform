import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

type Unit = {
  id: string;
  name: string;
};

type Lecturer = {
  id: string;
  name: string;
  email: string;
};

type TimetableEntry = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  notes: string | null;
  unit: Unit;
  lecturer: Lecturer | null;
};

type TimetableResponse = {
  term: {
    id: string;
    name: string;
  } | null;
  entries: TimetableEntry[];
};

const days = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export default function StudentPortal() {
  const { token } = useAuth();

  const [timetable, setTimetable] = useState<TimetableResponse>({
    term: null,
    entries: [],
  });

  const [loadingTimetable, setLoadingTimetable] = useState(true);
  const [timetableError, setTimetableError] = useState('');

  useEffect(() => {
    async function loadTimetable() {
      if (!token) return;

      setLoadingTimetable(true);
      setTimetableError('');

      try {
        const data = await api('/academic/me/timetable', {
          token,
        });

        setTimetable({
          term: data.term ?? null,
          entries: data.entries ?? [],
        });
      } catch (err) {
        setTimetableError(
          err instanceof Error
            ? err.message
            : 'Could not load your timetable'
        );
      } finally {
        setLoadingTimetable(false);
      }
    }

    loadTimetable();
  }, [token]);

  const groupedEntries = useMemo(() => {
    return days.map((day) => ({
      ...day,
      entries: timetable.entries.filter(
        (entry) => entry.dayOfWeek === day.value
      ),
    }));
  }, [timetable.entries]);

  return (
    <PortalLayout title="Student Dashboard">
      <div className="space-y-6">

        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Student Dashboard
          </h2>

          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Your academic and college workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {[
            ['My Units', 'View your current units'],
            ['Timetable', 'Check your classes'],
            ['Results', 'View academic results'],
            ['Fees', 'View fees and payments'],
          ].map(([title, description]) => (
            <div
              key={title}
              className="bg-white border border-gray-200 rounded-lg p-5 dark:bg-gray-900 dark:border-gray-700"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>

              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                {description}
              </p>
            </div>
          ))}

        </div>

        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden dark:bg-gray-900 dark:border-gray-700">

          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              My Timetable
            </h3>

            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              {timetable.term
                ? `Current term: ${timetable.term.name}`
                : 'Current academic timetable'}
            </p>
          </div>

          {timetableError && (
            <div className="m-5 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">
              {timetableError}
            </div>
          )}

          {loadingTimetable ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Loading your timetable...
            </div>
          ) : timetable.entries.length === 0 ? (
            <div className="p-8 text-center">

              <p className="text-gray-700 font-medium dark:text-gray-300">
                No timetable entries available.
              </p>

              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                Your timetable will appear here once classes have
                been scheduled for your registered units.
              </p>

            </div>
          ) : (
            <div className="p-5 space-y-5">

              {groupedEntries.map((day) => (
                <div key={day.value}>

                  <div className="flex items-center gap-3 mb-3">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {day.label}
                    </h4>

                    <div className="h-px bg-gray-200 flex-1" />
                  </div>

                  {day.entries.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      No classes scheduled.
                    </p>
                  ) : (
                    <div className="space-y-3">

                      {day.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        >

                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">

                            <div>

                              <h5 className="font-semibold text-gray-900 dark:text-gray-100">
                                {entry.unit.name}
                              </h5>

                              <p className="text-sm text-gray-600 mt-1 dark:text-gray-400">
                                {entry.startTime} – {entry.endTime}
                              </p>

                              {entry.lecturer && (
                                <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                                  Lecturer: {entry.lecturer.name}
                                </p>
                              )}

                            </div>

                            <div className="text-left md:text-right">

                              {entry.room && (
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Room: {entry.room}
                                </p>
                              )}

                              {entry.notes && (
                                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                                  {entry.notes}
                                </p>
                              )}

                            </div>

                          </div>

                        </div>
                      ))}

                    </div>
                  )}

                </div>
              ))}

            </div>
          )}

        </section>

      </div>
    </PortalLayout>
  );
}
