'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { usePathname } from 'next/navigation';
import { getToken, setToken, clearToken } from '../lib/auth';
import { apiFetch } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
   bio?: string | null;
   avatarUrl?: string | null;
  orgId?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isFetchingMeRef = useRef(false);
  const pathname = usePathname();
  const currentOrgId = pathname.match(/^\/org\/([^/]+)/)?.[1] ?? null;

  const refreshMe = useCallback(async () => {
    if (isFetchingMeRef.current) {
      return;
    }

    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    isFetchingMeRef.current = true;
    try {
      const data = await apiFetch('/auth/me');
      setUser(data);
    } catch (error) {
      clearToken();
      setUser(null);
    } finally {
      isFetchingMeRef.current = false;
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      setToken(data.access_token);
      await refreshMe();
    },
    [refreshMe],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (token) {
      void refreshMe();
    } else {
      setLoading(false);
    }
  }, [refreshMe]);

  // Keep role/org context in sync when navigating between orgs without
  // a full page reload (admin-only UI is role-gated).
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    if (!currentOrgId) return;
    void refreshMe();
  }, [currentOrgId, refreshMe]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

