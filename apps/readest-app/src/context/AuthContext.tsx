'use client';

import React, {
  createContext,
  useState,
  useContext,
  useRef,
  useCallback,
  ReactNode,
  useEffect,
} from 'react';
import { type Models } from 'appwrite';
import { appwriteAccount } from '@/utils/appwrite';
import { getAPIBaseUrl } from '@/services/environment';
import posthog from 'posthog-js';

// Refresh JWT 2 minutes before Appwrite's 15-minute expiry
const JWT_REFRESH_INTERVAL_MS = 13 * 60 * 1000;

export type AppwriteUser = Models.User<Models.Preferences>;

interface AuthContextType {
  token: string | null;
  user: AppwriteUser | null;
  /** Whether the initial session check has completed (safe to read token/user). */
  isAuthReady: boolean;
  login: (token: string, user: AppwriteUser) => void;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  });
  const [user, setUser] = useState<AppwriteUser | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const userJson = localStorage.getItem('user');
        return userJson ? JSON.parse(userJson) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const syncSession = async () => {
      // Try the Appwrite SDK first (session cookies may be available)
      try {
        const currentUser = await appwriteAccount.get();
        const jwtResponse = await appwriteAccount.createJWT();
        const jwt = jwtResponse.jwt;

        localStorage.setItem('token', jwt);
        localStorage.setItem('user', JSON.stringify(currentUser));
        posthog.identify(currentUser.$id);
        setToken(jwt);
        setUser(currentUser);
        return;
      } catch {
        // Cookies unavailable — try server-side refresh
      }

      // Fall back to server-side refresh for iOS/Tauri
      const existingToken = localStorage.getItem('token');
      const existingUser = localStorage.getItem('user');
      if (existingToken && existingUser) {
        try {
          const userId = JSON.parse(existingUser)?.$id;
          if (userId) {
            const res = await fetch(`${getAPIBaseUrl()}/auth/refresh`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${existingToken}`,
              },
              body: JSON.stringify({ userId }),
            });

            if (res.ok) {
              const { jwt } = await res.json();
              if (jwt) {
                localStorage.setItem('token', jwt);
                setToken(jwt);
                setUser(JSON.parse(existingUser));
                posthog.identify(userId);
                console.log('Session refreshed via server endpoint');
                return;
              }
            }
          }
        } catch {
          // Server refresh failed
        }
        console.log('Keeping stale local auth state — refresh failed');
      } else {
        console.log('No active Appwrite session');
        setToken(null);
        setUser(null);
      }
    };

    syncSession().finally(() => setIsAuthReady(true));
  }, []);

  const login = (newToken: string, newUser: AppwriteUser) => {
    console.log('Logging in');
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = async () => {
    console.log('Logging out');
    try {
      await appwriteAccount.deleteSession('current');
    } catch {
      // Session may already be expired
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  };

  const refresh = useCallback(async () => {
    // Try the Appwrite SDK first (works when session cookies are available)
    try {
      const currentUser = await appwriteAccount.get();
      const jwtResponse = await appwriteAccount.createJWT();
      const jwt = jwtResponse.jwt;
      localStorage.setItem('token', jwt);
      localStorage.setItem('user', JSON.stringify(currentUser));
      setToken(jwt);
      setUser(currentUser);
      return;
    } catch {
      // Cookies unavailable (common on iOS/Tauri) — fall through to server refresh
    }

    // Fall back to our server-side refresh endpoint which uses the admin SDK
    // to mint a fresh JWT without needing session cookies.
    try {
      const existingToken = localStorage.getItem('token');
      const existingUser = localStorage.getItem('user');
      if (!existingUser) return;
      const userId = JSON.parse(existingUser)?.$id;
      if (!userId) return;

      const res = await fetch(`${getAPIBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(existingToken ? { Authorization: `Bearer ${existingToken}` } : {}),
        },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) return;

      const { jwt } = await res.json();
      if (jwt) {
        localStorage.setItem('token', jwt);
        setToken(jwt);
      }
    } catch {
      // Server refresh also failed — token will stay stale
      console.warn('Server-side token refresh failed');
    }
  }, []);

  // Periodically refresh the JWT before it expires
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (token) {
      refreshTimerRef.current = setInterval(refresh, JWT_REFRESH_INTERVAL_MS);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [token, refresh]);

  // Refresh the JWT when the app returns from background.
  // On iOS/Tauri the JWT (15-min TTL) will be expired if the user was away.
  // This ensures sync has a valid token before it fires.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && token) {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [token, refresh]);

  return (
    <AuthContext.Provider value={{ token, user, isAuthReady, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
