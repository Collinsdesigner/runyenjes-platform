// RUNYENJES-SETUP-V1
import { ReactNode, useEffect, useState } from 'react';
import PortalLayout from './portal/PortalLayout';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useModules } from '../hooks/useModules';

interface Link {
  id: string;
  name: string;
  url: string;
  moduleKey?: string | null;
}

// Wraps the pages of an area an institution may run on its own system. When
// the area is switched off, people reach a short launch page instead of a
// portal that has no data behind it.
export default function ModuleGate({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: ReactNode;
}) {
  const modules = useModules();
  const { token, user } = useAuth();
  const [links, setLinks] = useState<Link[]>([]);
  const off = modules !== null && modules[moduleKey] === false;

  useEffect(() => {
    if (!off || !token) return;
    api('/settings/external-systems', { token })
      .then((list) => setLinks(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [off, token]);

  if (modules === null) return null;
  if (!off) return <>{children}</>;

  const mine = links.filter((l) => l.moduleKey === moduleKey);

  return (
    <PortalLayout title="Handled in your own system">
      <div className="max-w-xl bg-white border border-gray-200 rounded-lg p-6 space-y-4 dark:bg-gray-900 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          This area is handled in your institution's own system
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Your institution uses a different system for this, so it is not provided here.
        </p>
        {mine.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {mine.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-rgreen text-white rounded-lg px-4 py-2 text-sm font-medium"
              >
                Open {l.name}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ask your administrator for the address of that system.
          </p>
        )}
        {user?.role === 'ADMIN' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You can change this in{' '}
            <a href="/admin/modules" className="underline">
              Modules and Systems
            </a>
            .
          </p>
        )}
      </div>
    </PortalLayout>
  );
}
