// ABOUT_RTVC_REBUILD_V1
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type Settings = {
  institutionName?: string;
  shortName?: string;
  tagline?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  about?: string;
  physicalLocation?: string;
  googleMapsUrl?: string;
  highlightsTitle?: string;
  highlightsBody?: string;
};

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

export default function AboutRTVC() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  // ABOUT_RTVC_SHOW_MORE_V1
  const [showAllDepartments, setShowAllDepartments] = useState(false);
  const [expandedProgrammes, setExpandedProgrammes] = useState<Record<string, boolean>>({});
  const DEPARTMENT_PREVIEW_COUNT = 5;
  const PROGRAMME_PREVIEW_COUNT = 5;

  useEffect(() => {
    api('/settings')
      .then((data) => setSettings(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api('/programs')
      .then((data) => setDepartments(data))
      .catch(() => {})
      .finally(() => setProgramsLoading(false));
  }, []);

  if (!settings) {
    return (
      <div className="p-6">
        Loading RTVC information...
      </div>
    );
  }

  const primary = settings.primaryColor || '#0B7A2B';
  const secondary = settings.secondaryColor || '#5C0F00';

  const totalDepartments = departments.length;
  const totalProgrammes = departments.reduce((sum, d) => sum + d.programs.length, 0);
  const totalLevels = new Set(
    departments.flatMap((d) => d.programs.map((p) => p.level).filter(Boolean))
  ).size;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
      <div className="max-w-4xl mx-auto space-y-6 p-6">

        {/* Hero */}
        <div
          className="rounded-xl shadow p-8 text-center text-white"
          style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
        >
          {settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt={settings.institutionName || 'Institution logo'}
              className="w-28 h-28 object-contain mx-auto mb-4 bg-white rounded-full p-2"
            />
          )}

          <h1 className="text-3xl font-bold">
            {settings.institutionName}
          </h1>

          {settings.shortName && (
            <p className="text-lg font-semibold opacity-90 mt-2">
              {settings.shortName}
            </p>
          )}

          {settings.tagline && (
            <p className="italic mt-3 opacity-90">
              "{settings.tagline}"
            </p>
          )}
        </div>

        {/* At a glance */}
        {!programsLoading && totalProgrammes > 0 && (
          <div className="bg-white rounded-xl shadow p-6 dark:bg-gray-900">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold" style={{ color: primary }}>
                  {totalDepartments}
                </p>
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                  Department{totalDepartments === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <p className="text-3xl font-bold" style={{ color: primary }}>
                  {totalProgrammes}
                </p>
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                  Programme{totalProgrammes === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <p className="text-3xl font-bold" style={{ color: primary }}>
                  {totalLevels}
                </p>
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                  Level{totalLevels === 1 ? '' : 's'} offered
                </p>
              </div>
            </div>
          </div>
        )}

        {/* About */}
        <section className="bg-white rounded-xl shadow p-6 dark:bg-gray-900">
          <h2 className="text-xl font-bold mb-4" style={{ color: primary }}>
            About {settings.shortName || settings.institutionName}
          </h2>

          <p className="text-gray-700 leading-relaxed dark:text-gray-300">
            {settings.about ||
              `${settings.institutionName || 'This institution'} is committed to technical skills development, innovation and entrepreneurship.`}
          </p>
        </section>

        {/* ABOUT_RTVC_HIGHLIGHTS_CARD_V1 -- admin-filled via Settings, hidden entirely when empty */}
        {settings.highlightsBody && (
          <section className="bg-white rounded-xl shadow p-6 dark:bg-gray-900">
            <h2 className="text-xl font-bold mb-4" style={{ color: primary }}>
              {settings.highlightsTitle || 'Highlights'}
            </h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap dark:text-gray-300">
              {settings.highlightsBody}
            </p>
          </section>
        )}

        {/* Departments & Programmes */}
        {!programsLoading && departments.length > 0 && (
          <section className="bg-white rounded-xl shadow p-6 dark:bg-gray-900">
            <h2 className="text-xl font-bold mb-4" style={{ color: primary }}>
              Departments &amp; Programmes
            </h2>

            <div className="space-y-5">
              {(showAllDepartments ? departments : departments.slice(0, DEPARTMENT_PREVIEW_COUNT)).map(
                (dept) => {
                  const expanded = !!expandedProgrammes[dept.id];
                  const visiblePrograms = expanded
                    ? dept.programs
                    : dept.programs.slice(0, PROGRAMME_PREVIEW_COUNT);
                  return (
                    <div key={dept.id}>
                      <h3 className="font-semibold text-gray-900 mb-2 dark:text-gray-100">
                        {dept.name}
                      </h3>
                      <div className="space-y-1">
                        {visiblePrograms.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => navigate(`/apply?program=${p.id}`)}
                            className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {p.name}
                              {p.level && (
                                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                                  {p.level}
                                </span>
                              )}
                            </span>
                            <span className="text-xs font-medium shrink-0" style={{ color: primary }}>
                              Apply →
                            </span>
                          </button>
                        ))}
                      </div>
                      {dept.programs.length > PROGRAMME_PREVIEW_COUNT && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedProgrammes((p) => ({ ...p, [dept.id]: !p[dept.id] }))
                          }
                          className="text-xs font-medium mt-1 px-3"
                          style={{ color: primary }}
                        >
                          {expanded
                            ? 'Show fewer programmes'
                            : `Show all ${dept.programs.length} programmes`}
                        </button>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            {departments.length > DEPARTMENT_PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllDepartments((v) => !v)}
                className="text-sm font-medium mt-5 block mx-auto"
                style={{ color: primary }}
              >
                {showAllDepartments
                  ? 'Show fewer departments'
                  : `Show all ${departments.length} departments`}
              </button>
            )}
          </section>
        )}

        {/* Location */}
        <section className="bg-white rounded-xl shadow p-6 dark:bg-gray-900">
          <h2 className="text-xl font-bold mb-4" style={{ color: primary }}>
            Location
          </h2>

          <p className="text-gray-700 dark:text-gray-300">
            📍 {settings.physicalLocation}
          </p>

          {settings.googleMapsUrl && (
            <a
              href={settings.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 underline"
              style={{ color: primary }}
            >
              View on Google Maps
            </a>
          )}
        </section>

        {/* Contact */}
        <section className="bg-white rounded-xl shadow p-6 dark:bg-gray-900">
          <h2 className="text-xl font-bold mb-4" style={{ color: primary }}>
            Contact Information
          </h2>

          <div className="space-y-2 text-gray-700 dark:text-gray-300">
            <p>📮 {settings.address}</p>
            <p>☎ {settings.phone}</p>
            <p>✉ {settings.email}</p>
            <p>🌐 {settings.website}</p>
          </div>
        </section>

        <button
          onClick={() => navigate('/')}
          className="block mx-auto text-sm text-gray-500 underline dark:text-gray-400"
        >
          ← Back to Home
        </button>

      </div>
    </div>
  );
}
