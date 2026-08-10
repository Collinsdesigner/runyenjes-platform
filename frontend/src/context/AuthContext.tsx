import { createContext, useContext, useState, ReactNode } from 'react';
import { api } from '../api/client';

interface CurrentUser {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: CurrentUser | null;
  token: string | null;
  studentLogin: (email: string, admissionNumber: string) => Promise<void>;
  staffLogin: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => void;
  updateAvatar: (avatarUrl: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Real deployed app (not a Claude artifact) — localStorage is the standard,
// correct choice here so a user stays logged in across page refreshes.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('runyenjes_token'));
  const [user, setUser] = useState<CurrentUser | null>(() => {
    const stored = localStorage.getItem('runyenjes_user');
    return stored ? JSON.parse(stored) : null;
  });

  function persist(newToken: string, newUser: CurrentUser) {
    localStorage.setItem('runyenjes_token', newToken);
    localStorage.setItem('runyenjes_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  async function studentLogin(email: string, admissionNumber: string) {
    const data = await api('/auth/student-login', {
      method: 'POST',
      body: { email, admissionNumber },
    });
    persist(data.token, data.user);
  }

async function staffLogin(email: string, password: string): Promise<CurrentUser> {
  const data = await api('/auth/staff-login', {
    method: 'POST',
    body: { email, password },
  });

  persist(data.token, data.user);

  return data.user;
}

  function logout() {
    localStorage.removeItem('runyenjes_token');
    localStorage.removeItem('runyenjes_user');
    setToken(null);
    setUser(null);
  }

function updateAvatar(avatarUrl: string | null) {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, avatarUrl };
      localStorage.setItem('runyenjes_user', JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ user, token, studentLogin, staffLogin, logout, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
