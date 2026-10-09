// RUNYENJES-SETUP-V1
// Dedicated client for the first-run wizard. The shared api() helper only reads
// `error` from responses, but the setup routes return `message` and a list of
// validation `errors`, and a wrong setup token must not trigger the app's
// "session expired" handler. So the wizard uses its own small helper.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface SetupModule {
  key: string;
  label: string;
  description: string;
}

export interface SetupStatus {
  needsSetup: boolean;
  tokenRequired: boolean;
  modules: SetupModule[];
}

export interface ReadinessCheck {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  fix?: string;
}

export interface Readiness {
  ready: boolean;
  checks: ReadinessCheck[];
}

export class SetupApiError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status: number, details: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function call(path: string, init: RequestInit, token: string | null) {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) || {}) };
  if (token) headers['x-setup-token'] = token;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const details: string[] = Array.isArray(data.errors)
      ? data.errors.map((e: { path?: unknown[]; message?: string }) => {
          const where = Array.isArray(e.path) ? e.path.join('.') : '';
          return where ? `${where}: ${e.message}` : String(e.message);
        })
      : [];
    throw new SetupApiError(
      data.message || data.error || `Request failed (${res.status})`,
      res.status,
      details
    );
  }
  return data;
}

export function getSetupStatus(): Promise<SetupStatus> {
  return call('/setup/status', {}, null);
}

export function getReadiness(token: string | null): Promise<Readiness> {
  return call('/setup/readiness', {}, token);
}

export async function uploadSetupLogo(
  file: File,
  token: string | null
): Promise<{ logoUrl: string; logoPublicId: string }> {
  const formData = new FormData();
  formData.append('logo', file);
  return call('/setup/logo', { method: 'POST', body: formData }, token);
}

export function completeSetup(payload: unknown, token: string | null) {
  return call(
    '/setup/complete',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    token
  );
}
