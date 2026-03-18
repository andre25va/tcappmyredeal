import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface TCProfile {
  id: string;
  phone: string;
  name: string;
  role: 'tc' | 'admin' | 'viewer';
  timezone: string;
  initials: string;
  avatar_color: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

interface AuthContextType {
  profile: TCProfile | null;
  token: string | null;
  loading: boolean;
  isFirstLogin: boolean;
  kickedOut: boolean;
  kickedOutMessage: string;
  login: (token: string, profile: TCProfile, firstLogin?: boolean) => void;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<TCProfile, 'name' | 'timezone' | 'avatar_color'>>) => Promise<void>;
  clearFirstLogin: () => void;
  clearKickedOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'tc_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<TCProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [kickedOut, setKickedOut] = useState(false);
  const [kickedOutMessage, setKickedOutMessage] = useState('');

  // Validate session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(SESSION_KEY);
    if (!storedToken) { setLoading(false); return; }

    fetch('/api/auth?action=session', {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid && data.profile) {
          setToken(storedToken);
          setProfile(data.profile);
        } else {
          localStorage.removeItem(SESSION_KEY);
          if (data.reason === 'other_device') {
            setKickedOut(true);
            setKickedOutMessage('You were signed out because your account was accessed on another device.');
          }
        }
      })
      .catch(() => localStorage.removeItem(SESSION_KEY))
      .finally(() => setLoading(false));
  }, []);

  // Periodic session check every 2 minutes to detect being kicked out
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch('/api/auth?action=session', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        if (!data.valid) {
          localStorage.removeItem(SESSION_KEY);
          setToken(null);
          setProfile(null);
          if (data.reason === 'other_device') {
            setKickedOut(true);
            setKickedOutMessage('You were signed out because your account was accessed on another device.');
          }
        }
      } catch { /* silent network error */ }
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]);

  const login = useCallback((tok: string, prof: TCProfile, firstLogin = false) => {
    localStorage.setItem(SESSION_KEY, tok);
    setToken(tok);
    setProfile(prof);
    setIsFirstLogin(firstLogin);
    setKickedOut(false);
    setKickedOutMessage('');
  }, []);

  const logout = useCallback(async () => {
    const tok = localStorage.getItem(SESSION_KEY);
    if (tok) {
      try {
        await fetch('/api/auth?action=logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}` },
        });
      } catch { /* silent */ }
    }
    localStorage.removeItem(SESSION_KEY);
    setToken(null);
    setProfile(null);
    setIsFirstLogin(false);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Pick<TCProfile, 'name' | 'timezone' | 'avatar_color'>>) => {
    const tok = localStorage.getItem(SESSION_KEY);
    if (!tok) return;
    const resp = await fetch('/api/auth?action=update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify(updates),
    });
    const data = await resp.json();
    if (data.profile) setProfile(data.profile);
  }, []);

  const clearFirstLogin = useCallback(() => setIsFirstLogin(false), []);
  const clearKickedOut = useCallback(() => { setKickedOut(false); setKickedOutMessage(''); }, []);

  return (
    <AuthContext.Provider value={{
      profile, token, loading, isFirstLogin, kickedOut, kickedOutMessage,
      login, logout, updateProfile, clearFirstLogin, clearKickedOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
