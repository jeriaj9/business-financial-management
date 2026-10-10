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

/**
 * - loading: the session or the user's profile is still being resolved
 * - ready:   we know who the user is (or that nobody is signed in) and what they can access
 * - error:   the user is signed in but their profile could not be loaded
 */
export type IdentityStatus = 'loading' | 'ready' | 'error';

type AuthContextType = {
  user: SessionUser | null;
  profile: BusinessProfile | null;
  portalAccounts: PortalAccount[];
  loading: boolean;
  status: IdentityStatus;
  /** Reloads profile and portal access, for the given user or the current one. */
  refresh: (sessionUser?: SessionUser | null) => Promise<void>;
  /** Signs out and navigates to `redirectTo` (default: the login page). */
  signOut: (redirectTo?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  portalAccounts: [],
  loading: true,
  status: 'loading',
  refresh: async () => {},
  signOut: async () => {},
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const IDENTITY_TIMEOUT_MS = 10000;

/**
 * REST call with the token stored by supabase-js. It does not go through gotrue-js, so it
 * cannot get stuck on its storage lock. supabase-js saves the session before emitting
 * SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED, so the stored token is current here.
 */
async function rawRest<T>(path: string, init?: RequestInit & { single?: boolean }): Promise<T> {
  const token = readStoredSession()?.access_token;
  if (!SUPABASE_URL || !token) throw new Error('No stored session');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IDENTITY_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.single ? { Accept: 'application/vnd.pgrst.object+json' } : {}),
      },
    });
    // With object+json, 406 means "no row": the user has no business profile (yet)
    if (init?.single && res.status === 406) return null as T;
    if (!res.ok) throw new Error(`REST ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function loadIdentity(userId: string): Promise<{ profile: BusinessProfile | null; accounts: PortalAccount[] }> {
  const [profile, accounts] = await Promise.all([
    rawRest<BusinessProfile | null>(`user_profiles?id=eq.${userId}&select=*,companies(id,name)`, { single: true }),
    rawRest<PortalAccount[]>('rpc/portal_accounts', { method: 'POST', body: '{}' }),
  ]);
  return { profile, accounts: accounts ?? [] };
}

function isExpired(session: { expires_at?: number } | null): boolean {
  return !!session?.expires_at && session.expires_at * 1000 < Date.now() + 10_000;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [portalAccounts, setPortalAccounts] = useState<PortalAccount[]>([]);
  const [status, setStatus] = useState<IdentityStatus>('loading');
  const userRef = useRef<SessionUser | null>(null);
  const statusRef = useRef<IdentityStatus>('loading');
  const requestRef = useRef(0);

  const updateStatus = useCallback((next: IdentityStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const applyIdentity = useCallback(async (sessionUser: SessionUser | null) => {
    const request = ++requestRef.current;

    if (!sessionUser) {
      userRef.current = null;
      setUser(null);
      setProfile(null);
      setPortalAccounts([]);
      updateStatus('ready');
      return;
    }

    // Reloading the user that is already loaded (e.g. after renaming the company) keeps the
    // current screen; a different user must not be routed until we know what they can access.
    const silent = sessionUser.id === userRef.current?.id && statusRef.current === 'ready';
    userRef.current = sessionUser;
    if (!silent) {
      updateStatus('loading');
      setUser(sessionUser);
    }
    try {
      const identity = await loadIdentity(sessionUser.id);
      if (request !== requestRef.current) return; // a newer sign-in or sign-out superseded this one
      setProfile(identity.profile);
      setPortalAccounts(identity.accounts);
      updateStatus('ready');
    } catch (err) {
      if (request !== requestRef.current) return;
      console.error('Identity load failed:', err);
      if (silent) return; // keep what we already had
      setProfile(null);
      setPortalAccounts([]);
      updateStatus('error');
    }
  }, [updateStatus]);

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    // onAuthStateChange is the single source of truth (avoids Strict Mode getSession deadlocks)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      resolved = true;
      if (event === 'TOKEN_REFRESHED' && session?.user && session.user.id === userRef.current?.id) return;
      const next = session?.user ? { id: session.user.id, email: session.user.email } : null;
      // Same user already loaded (e.g. right after an explicit refresh from the login form)
      if (event === 'SIGNED_IN' && next && next.id === userRef.current?.id) return;
      // Defer out of the auth callback so nothing re-enters the auth lock
      setTimeout(() => {
        if (mounted) void applyIdentity(next);
      }, 0);
    });

    // Fallback: if INITIAL_SESSION does not arrive quickly (multi-tab lock deadlocks), use the
    // stored session, but only while its token is still valid.
    const fallbackTimer = setTimeout(() => {
      if (!mounted || resolved) return;
      const stored = readStoredSession() as { user?: SessionUser; expires_at?: number } | null;
      if (!stored?.user) {
        resolved = true;
        void applyIdentity(null);
      } else if (!isExpired(stored)) {
        resolved = true;
        console.warn('Auth state change took too long; using the stored session.');
        void applyIdentity({ id: stored.user.id, email: stored.user.email });
      }
      // An expired token is being refreshed by gotrue-js; wait for its event
    }, 1500);

    // Safety net: never stay on the loading screen forever
    const safetyTimer = setTimeout(() => {
      if (mounted && !resolved) {
        resolved = true;
        void applyIdentity(null);
      }
    }, 10000);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [applyIdentity]);

  const refresh = useCallback(async (sessionUser?: SessionUser | null) => {
    const target = sessionUser ?? userRef.current;
    if (target) await applyIdentity(target);
  }, [applyIdentity]);

  const signOut = useCallback(async (redirectTo: string = '/login') => {
    // A stale session (e.g. revoked on the server) can make the remote sign-out fail; clear it locally anyway
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
    await applyIdentity(null);
    window.location.href = redirectTo;
  }, [applyIdentity]);

  return (
    <AuthContext.Provider value={{ user, profile, portalAccounts, loading: status === 'loading', status, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** Where a signed-in user should land. Only meaningful once the identity status is "ready". */
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
