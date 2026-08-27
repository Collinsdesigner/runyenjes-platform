import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

interface PortalLayoutProps {
  title: string;
  children: ReactNode;
}

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SiteSettings {
  institutionName: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

/*
 * Shared navigation
 * These appear for authenticated users in every portal.
 */
const commonSections: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Home Feed', path: '/', icon: '🏠' },
      { label: 'AI Assistant', path: '/ai', icon: '✦' },
      { label: 'Notebook', path: '/notebook', icon: '📝' },
      { label: 'Groups', path: '/groups', icon: '💬' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Profile', path: '/profile', icon: '◉' },
      { label: 'Security', path: '/security', icon: '🔒' },
    ],
  },
];

/*
 * Role-specific navigation
 */
const roleSections: Record<string, NavSection[]> = {
  STUDENT: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/student', icon: '⌂' },
      ],
    },
    {
      title: 'Academics',
      items: [
        { label: 'My Academics', path: '/student/academics', icon: '🎓' },
        { label: 'Learning Materials', path: '/library', icon: '📚' },
        { label: 'Timetable', path: '/student/timetable', icon: '▦' },
        { label: 'Assignments', path: '/student/assignments', icon: '✓' },
        { label: 'Results', path: '/student/results', icon: '📊' },
      ],
    },
    {
      title: 'Student Services',
      items: [
        { label: 'Fees & Payments', path: '/student/fees', icon: '💰' },
      ],
    },
  ],

  TEACHER: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/teacher', icon: '⌂' },
      ],
    },
    {
      title: 'Teaching',
      items: [
        { label: 'My Classes', path: '/teacher/classes', icon: '🏫' },
        { label: 'My Units', path: '/teacher/units', icon: '📖' },
        { label: 'Students', path: '/teacher/students', icon: '👥' },
        { label: 'Attendance', path: '/teacher/attendance', icon: '✓' },
        { label: 'Assignments', path: '/teacher/assignments', icon: '📝' },
        { label: 'Assessments', path: '/teacher/assessments', icon: '▣' },
        { label: 'Results', path: '/teacher/results', icon: '📊' },
        { label: 'Learning Materials', path: '/library', icon: '📚' },
      ],
    },
  ],

  REGISTRAR: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/registrar', icon: '⌂' },
      ],
    },
    {
      title: 'Admissions & Registration',
      items: [
        { label: 'Admissions', path: '/admissions', icon: '📝' },
        { label: 'Student Records', path: '/registrar/students', icon: '🎓' },
        { label: 'Continuation', path: '/continuation', icon: '🔄' },
      ],
    },
    {
      title: 'Academic Administration',
      items: [
        { label: 'Academic Records', path: '/registrar/academic', icon: '📚' },
        { label: 'Programmes & Departments', path: '/registrar/programmes', icon: '🏛️' },
        { label: 'Timetable', path: '/registrar/timetable', icon: '▦' },
      ],
    },
    {
      title: 'Documents',
      items: [
        { label: 'Student Documents', path: '/registrar/documents', icon: '📄' },
        { label: 'Letters & Certificates', path: '/registrar/letters', icon: '📜' },
      ],
    },
    {
      title: 'Communication',
      items: [
        { label: 'Announcements', path: '/registrar/announcements', icon: '📢' },
      ],
    },
    {
      title: 'Reports',
      items: [
        { label: 'Registrar Reports', path: '/registrar/reports', icon: '📊' },
      ],
    },
  ],

  ADMIN: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/admin', icon: '⌂' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Users', path: '/admin/users', icon: '👥' },
        { label: 'Students', path: '/admin/students', icon: '🎓' },
        { label: 'Staff', path: '/admin/staff', icon: '👨‍🏫' },
        { label: 'Mass Import', path: '/admin/bulk-import', icon: '📥' },
        { label: 'Alumni', path: '/admin/alumni', icon: '🎓' },
      ],
    },
    {
      title: 'Academic',
      items: [
        { label: 'Academic', path: '/admin/academic', icon: '📚' },
        { label: 'Admissions', path: '/admin/admissions', icon: '📝' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Finance', path: '/admin/finance', icon: '💰' },
        { label: 'Library', path: '/admin/library', icon: '📖' },
        { label: 'Communication', path: '/admin/communication', icon: '💬' },
        { label: 'Procurement', path: '/procurement/requests', icon: '📄' },
      ],
    },
    {
      title: 'Management',
      items: [
        { label: 'Reports', path: '/admin/reports', icon: '📊' },
        { label: 'Settings', path: '/admin/settings', icon: '⚙' },
      ],
    },
  ],

  FINANCE_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/finance', icon: '⌂' }],
    },
    {
      title: 'Finance',
      items: [{ label: 'Invoices & Payments', path: '/finance/invoices', icon: '💰' }],
    },
  ],

  HR_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/hr', icon: '⌂' }],
    },
    {
      title: 'Human Resources',
      items: [{ label: 'Staff & Leave', path: '/hr/staff', icon: '👥' }],
    },
  ],

  EXAM_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/examinations', icon: '⌂' }],
    },
    {
      title: 'Examinations',
      items: [{ label: 'Exams & Results', path: '/examinations/results', icon: '📊' }],
    },
  ],

  STORES_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/stores', icon: '⌂' }],
    },
    {
      title: 'Stores',
      items: [{ label: 'Inventory', path: '/stores/items', icon: '📦' }],
    },
  ],

  ALUMNI: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/alumni', icon: '⌂' }],
    },
    {
      title: 'Career',
      items: [{ label: 'Job Board', path: '/jobs', icon: '💼' }],
    },
  ],

  PROCUREMENT_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/procurement', icon: '⌂' }],
    },
    {
      title: 'Procurement',
      items: [{ label: 'Purchase Requests', path: '/procurement/requests', icon: '📄' }],
    },
  ],

  SUPPORT_STAFF: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/workers', icon: '⌂' }],
    },
  ],
};


const STAFF_SELF_SERVICE_ROLES = [
  'TEACHER',
  'REGISTRAR',
  'ADMIN',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
  'PROCUREMENT_OFFICER',
  'SUPPORT_STAFF',
];

export default function PortalLayout({
  title,
  children,
}: PortalLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    api('/settings')
      .then((data) => {
        setSettings(data);

        const personalAccent = localStorage.getItem('runyenjes_personal_accent');
        if (personalAccent) {
          document.documentElement.style.setProperty('--color-primary', personalAccent);
        } else if (data?.primaryColor) {
          document.documentElement.style.setProperty(
            '--color-primary',
            data.primaryColor
          );
        }

        if (data?.secondaryColor) {
          document.documentElement.style.setProperty(
            '--color-secondary',
            data.secondaryColor
          );
        }
      })
      .catch(() => {
        // Keep default branding if settings cannot be loaded.
      });
  }, []);

  if (!user) {
    return null;
  }

  const sections: NavSection[] = [
    ...(roleSections[user.role] ?? []),
    ...(STAFF_SELF_SERVICE_ROLES.includes(user.role)
      ? [{ title: 'My Work', items: [{ label: 'Staff Self-Service', path: '/workers', icon: '🧾' }, { label: 'Job Board', path: '/jobs', icon: '💼' }] }]
      : []),
    ...commonSections,
  ];

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const institutionName =
    settings?.institutionName ||
    'Runyenjes Technical & Vocational College';

  const shortName =
    settings?.shortName ||
    'Runyenjes';

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">

      {/* ================= SIDEBAR ================= */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-gray-200 flex-col h-full">

        {/* Branding */}
        <div className="px-5 py-5 border-b border-gray-200">
          <div className="flex items-center gap-3">

            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={institutionName}
                className="w-10 h-10 rounded-md object-contain border border-gray-100"
              />
            ) : (
              <div className="w-10 h-10 rounded-md bg-rgreen text-white flex items-center justify-center font-bold">
                {shortName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="text-lg font-bold text-rgreen truncate">
                {shortName}
              </div>

              <div className="text-xs text-gray-500 leading-tight">
                {institutionName}
              </div>
            </div>

          </div>

          <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {user.role} PORTAL
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">

          {sections.map((section) => (
            <div key={section.title} className="mb-5">

              <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </div>

              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                        isActive
                          ? 'bg-rgreen text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`
                    }
                  >
                    <span className="w-5 text-center shrink-0">
                      {item.icon}
                    </span>

                    <span className="truncate">
                      {item.label}
                    </span>
                  </NavLink>
                ))}
              </div>

            </div>
          ))}

        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-gray-200">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
          >
            🚪 Sign out
          </button>
        </div>

      </aside>

      {/* ================= MAIN AREA ================= */}
      <div className="flex-1 min-w-0 flex flex-col h-full">

        {/* Top bar */}
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">

          <div className="min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">
              {title}
            </h1>

            <p className="text-xs text-gray-500 truncate">
              Welcome, {user.name}
            </p>
          </div>

          <div className="flex items-center gap-3">

            {/* Notifications */}
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
              aria-label="Notifications"
            >
              🔔
            </button>

            {/* Profile */}
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}

              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {user.name}
              </span>
            </button>

            {/* Sign out -- always visible here, even when the sidebar is hidden on small screens */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
              aria-label="Sign out"
              title="Sign out"
            >
              🚪
            </button>

          </div>

        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>

      </div>

    </div>
  );
}
