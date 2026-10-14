// RUNYENJES-SETUP-V1
import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Which areas are switched on for this institution. Loaded once and shared.
// Fails open: if the settings cannot be read, every area stays visible.
let cached: Promise<Record<string, boolean>> | null = null;

export function clearModulesCache() {
  cached = null;
}

export function useModules(): Record<string, boolean> | null {
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!cached) {
      cached = api('/settings')
        .then((s) => (s && s.modules ? (s.modules as Record<string, boolean>) : {}))
        .catch(() => ({} as Record<string, boolean>));
    }
    let live = true;
    cached.then((m) => {
      if (live) setModules(m);
    });
    return () => {
      live = false;
    };
  }, []);

  return modules;
}

// Roles that only make sense while their area is switched on.
export const ROLE_MODULE: Record<string, string> = {
  FINANCE_OFFICER: 'finance',
  HR_OFFICER: 'hr',
  SUPPORT_STAFF: 'hr',
  STORES_OFFICER: 'stores',
  PROCUREMENT_OFFICER: 'procurement',
  ALUMNI: 'alumni',
};

export function roleAvailable(role: string, modules: Record<string, boolean> | null): boolean {
  if (!modules) return true;
  const area = ROLE_MODULE[role];
  return !area || modules[area] !== false;
}
