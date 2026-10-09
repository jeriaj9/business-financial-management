'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, readStoredSession } from '@/lib/supabase';

export interface BusinessProfile {
  id: string;
  company_id: string | null;
  role: 'admin' | 'edit' | 'view';
  full_name: string | null;
  companies: { id: string; name: string } | null;
}

export interface PortalAccount {
  distributor_id: string;
  distributor_name: string;
  company_id: string;
  company_name: string;
  currency: string;
}

export interface SessionUser {
  id: string;
  email?: string;
}

type AuthContextType = {
  user: SessionUser | null;
  profile: BusinessProfile | null;
  portalAccounts: PortalAccount[];
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  portalAccounts: [],
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/** Direct REST call with the stored token, used when gotrue-js is stuck on its storage lock. */
async function rawRest<T>(path: string, init?: RequestInit & { single?: boolean }): Promise<T | null> {
  const token = readStoredSession()?.access_token;
  if (!SUPABASE_URL || !token) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.single ? { Accept: 'application/vnd.pgrst.object+json' } : {}),
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function loadIdentity(userId: string, useRaw: boolean) {
  if (useRaw) {
    const [profile, accounts] = await Promise.all([
      rawRest<BusinessProfile>(`user_profiles?id=eq.${userId}&select=*,companies(id,name)`, { single: true }).catch(() => null),
      rawRest<PortalAccount[]>('rpc/portal_accounts', { method: 'POST', body: '{}' }).catch(() => null),
    ]);
    return { profile, accounts: accounts ?? [] };
  }

  const [profileRes, accountsRes] = await Promise.all([
    supabase.from('user_profiles').select('*, companies(id, name)').eq('id', userId).maybeSingle(),
    supabase.rpc('portal_accounts'),
  ]);
  if (profileRes.error) console.error('Profile fetch error:', profileRes.error);
  if (accountsRes.error) console.error('Portal accounts fetch error:', accountsRes.error);
  return {
    profile: (profileRes.data as BusinessProfile | null) ?? null,
    accounts: ((accountsRes.data as PortalAccount[] | null) ?? []),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [portalAccounts, setPortalAccounts] = useState<PortalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<SessionUser | null>(null);

  const applyIdentity = useCallback(async (sessionUser: SessionUser | null, useRaw = false) => {
    userRef.current = sessionUser;
    setUser(sessionUser);
    if (!sessionUser) {
      setProfile(null);
      setPortalAccounts([]);
      setLoading(false);
      return;
    }
    try {
      const identity = await loadIdentity(sessionUser.id, useRaw);
      setProfile(identity.profile);
      setPortalAccounts(identity.accounts);
    } catch (err) {
      console.error('Identity load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    // onAuthStateChange is the single source of truth (avoids Strict Mode getSession deadlocks)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      resolved = true;
      if (event === 'TOKEN_REFRESHED' && session?.user && session.user.id === userRef.current?.id) return;
      const next = session?.user ? { id: session.user.id, email: session.user.email } : null;
      // Defer Supabase calls out of the auth callback to avoid re-entering the auth lock
      setTimeout(() => {
        if (mounted) void applyIdentity(next);
      }, 0);
    });

    // Fallback: if INITIAL_SESSION does not arrive quickly (multi-tab lock deadlocks), read the stored session
    const fallbackTimer = setTimeout(() => {
      if (!mounted || resolved) return;
      console.warn('Auth state change took too long; using the stored session.');
      resolved = true;
      const stored = readStoredSession();
      void applyIdentity(stored?.user ? { id: stored.user.id, email: stored.user.email } : null, true);
    }, 1500);

    // Safety net: never stay on the loading screen forever
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [applyIdentity]);

  const refresh = useCallback(async () => {
    if (userRef.current) {
      setLoading(true);
      await applyIdentity(userRef.current);
    }
  }, [applyIdentity]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await applyIdentity(null);
    window.location.href = '/login';
  }, [applyIdentity]);

  return (
    <AuthContext.Provider value={{ user, profile, portalAccounts, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** Where a signed-in user should land. */
export function homeFor(profile: BusinessProfile | null, portalAccounts: PortalAccount[], next?: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    if (next.startsWith('/app') && profile?.company_id) return next;
    if (next.startsWith('/distribuidor') && portalAccounts.length > 0) return next;
    if (next.startsWith('/invitacion')) return next;
  }
  if (profile?.company_id) return '/app';
  if (portalAccounts.length > 0) return '/distribuidor';
  return '/registro';
}
