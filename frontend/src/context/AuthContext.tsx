import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { api, registerSessionExpiredHandler } from '../api/client';

interface CurrentUser {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  mustChangePassword?: boolean;
  darkMode?: boolean;
}

interface AuthContextValue {
  user: CurrentUser | null;
  token: string | null;
  studentLogin: (email: string, admissionNumber: string) => Promise<void>;
  staffLogin: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => void;
  updateAvatar: (avatarUrl: string | null) => void;
  toggleDarkMode: () => Promise<void>;
  darkMode: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('runyenjes_token')
  );

  const [user, setUser] = useState<CurrentUser | null>(() => {
    const stored = localStorage.getItem('runyenjes_user');
    return stored ? JSON.parse(stored) : null;
  });

  const [guestDarkMode, setGuestDarkMode] = useState<boolean>(
    () => localStorage.getItem('runyenjes_guest_dark_mode') === 'true'
  );

  const darkMode = user ? Boolean(user.darkMode) : guestDarkMode;

  const [authLoading, setAuthLoading] = useState(true);

  function clearSession() {
    localStorage.removeItem('runyenjes_token');
    localStorage.removeItem('runyenjes_user');

    setToken(null);
    setUser(null);
  }


  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const unregister = registerSessionExpiredHandler(() => {
      clearSession();
    });

    return unregister;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function validateStoredSession() {
      const storedToken = localStorage.getItem('runyenjes_token');

      if (!storedToken) {
        if (!cancelled) {
          setAuthLoading(false);
        }
        return;
      }

      try {
        const currentUser = await api('/profile/me', {
          token: storedToken,
        });

        if (cancelled) return;

        const refreshedUser: CurrentUser = {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          avatarUrl: currentUser.avatarUrl ?? null,
          darkMode: Boolean(currentUser.darkMode),
        };

        localStorage.setItem(
          'runyenjes_user',
          JSON.stringify(refreshedUser)
        );

        setToken(storedToken);
        setUser(refreshedUser);
      } catch (error) {
        if (cancelled) return;

        // A 401 is already handled centrally by client.ts.
        // Other errors are not treated as session expiration.
        console.error('Session validation failed:', error);
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    validateStoredSession();

    return () => {
      cancelled = true;
    };
  }, []);

  function persist(newToken: string, newUser: CurrentUser) {
    localStorage.setItem('runyenjes_token', newToken);
    localStorage.setItem(
      'runyenjes_user',
      JSON.stringify(newUser)
    );

    setToken(newToken);
    setUser(newUser);
  }

  async function studentLogin(
    email: string,
    admissionNumber: string
  ) {
    const data = await api('/auth/student-login', {
      method: 'POST',
      body: { email, admissionNumber },
    });

    persist(data.token, data.user);
  }

  async function staffLogin(
    email: string,
    password: string
  ): Promise<CurrentUser> {
    const data = await api('/auth/staff-login', {
      method: 'POST',
      body: { email, password },
    });

    persist(data.token, data.user);

    return data.user;
  }

  function logout() {
    clearSession();
  }

  function updateAvatar(avatarUrl: string | null) {
    setUser((prev) => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        avatarUrl,
      };

      localStorage.setItem(
        'runyenjes_user',
        JSON.stringify(updated)
      );

      return updated;
    });
  }


  async function toggleDarkMode() {
    // Logged-out guest: browser-only preference, no account to save to.
    if (!user || !token) {
      setGuestDarkMode((prev) => {
        const next = !prev;
        localStorage.setItem('runyenjes_guest_dark_mode', String(next));
        return next;
      });
      return;
    }

    const next = !user.darkMode;

    // Optimistic local update first.
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, darkMode: next };
      localStorage.setItem('runyenjes_user', JSON.stringify(updated));
      return updated;
    });

    try {
      await api('/profile/theme', {
        method: 'PATCH',
        token,
        body: { darkMode: next },
      });
    } catch (error) {
      console.error('Failed to save dark mode preference:', error);
      // Roll back on failure.
      setUser((prev) => {
        if (!prev) return prev;
        const reverted = { ...prev, darkMode: !next };
        localStorage.setItem('runyenjes_user', JSON.stringify(reverted));
        return reverted;
      });
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
          Checking session...
        </p>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        studentLogin,
        staffLogin,
        logout,
        updateAvatar,
        toggleDarkMode,
        darkMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return ctx;
}
