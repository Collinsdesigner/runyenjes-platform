const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

export interface UploadedImage {
  url: string;
  publicId: string;
}

// ------------------------------------------------------------
// Session-expiration handler
// AuthContext registers this when the app starts.
// The API client calls it whenever an authenticated request
// receives HTTP 401 Unauthorized.
// ------------------------------------------------------------
let onSessionExpired: (() => void) | null = null;

export function registerSessionExpiredHandler(
  handler: () => void
): () => void {
  onSessionExpired = handler;

  // Return a cleanup function so React can unregister it.
  return () => {
    if (onSessionExpired === handler) {
      onSessionExpired = null;
    }
  };
}

function handleUnauthorized() {
  if (onSessionExpired) {
    onSessionExpired();
  }
}

// ------------------------------------------------------------
// Upload image
// ------------------------------------------------------------
export async function uploadImage(
  file: File,
  token: string | null
): Promise<UploadedImage> {
  const formData = new FormData();
  formData.append('image', file);

  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    throw new Error(data.error || 'Image upload failed');
  }

  return {
    url: data.url,
    publicId: data.publicId,
  };
}

// ------------------------------------------------------------
// Upload institution logo
// ------------------------------------------------------------
export async function uploadInstitutionLogo(
  file: File,
  token: string | null
): Promise<UploadedImage> {
  const formData = new FormData();
  formData.append('logo', file);

  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/admin/institution-logo`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    throw new Error(data.error || 'Logo upload failed');
  }

  return {
    url: data.logoUrl ?? data.url,
    publicId: data.logoPublicId ?? data.publicId,
  };
}

// ------------------------------------------------------------
// Standard API client
// ------------------------------------------------------------
export async function api(
  path: string,
  options: RequestOptions = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body
      ? JSON.stringify(options.body)
      : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    throw new Error(
      data.error || `Request failed (${res.status})`
    );
  }

  return data;
}
