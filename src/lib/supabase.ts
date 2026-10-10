import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment variables.");
}

/** Every database request gives up after this long, so a screen can never load forever. */
const REQUEST_TIMEOUT_MS = 30_000;
/** How long a request waits for gotrue-js to refresh an expired token before using what is stored. */
const TOKEN_REFRESH_WAIT_MS = 5_000;

/**
 * Same key supabase-js uses to persist the session: `sb-<first label of the host>-auth-token`.
 * Works for hosted projects (`<ref>.supabase.co`) and local development (`127.0.0.1:54321`).
 */
export const authStorageKey = (() => {
  try {
    return supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token` : null;
  } catch {
    return null;
  }
})();

export interface StoredSession {
  access_token?: string;
  expires_at?: number;
  user?: { id: string; email?: string };
}

export function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined' || !authStorageKey) return null;
  try {
    const raw = window.localStorage.getItem(authStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** True when the stored access token has expired (or is about to). */
export function isSessionExpired(session: StoredSession | null): boolean {
  return !!session?.expires_at && session.expires_at * 1000 < Date.now() + 10_000;
}

// Fallback to dummy strings to prevent the entire JS bundle from crashing,
// but auth and db calls will fail if they are missing.
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseKey || 'placeholder';

/**
 * Sign-in, sign-up, sign-out and session events. gotrue-js serializes its work behind a lock;
 * the default one is shared by every tab, so a stale or frozen tab could hold it forever and
 * block this one. The in-tab lock avoids that (Supabase tolerates concurrent token refreshes).
 */
export const supabaseAuth = createClient(url, key, { auth: { lock: processLock } }).auth;

/**
 * Token for database requests, read from the session gotrue-js persists. Data requests never
 * wait on gotrue-js' lock, except briefly when the stored token has expired and needs a refresh.
 */
async function dataAccessToken(): Promise<string | null> {
  const stored = readStoredSession();
  if (!stored?.access_token) return null;
  if (!isSessionExpired(stored)) return stored.access_token;

  const refreshed = await Promise.race([
    supabaseAuth.getSession().then(({ data }) => data.session?.access_token ?? null, () => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_REFRESH_WAIT_MS)),
  ]);
  return refreshed ?? stored.access_token;
}

/** Database and RPC client. Authentication goes through `supabaseAuth`. */
export const supabase = createClient(url, key, {
  accessToken: dataAccessToken,
  db: { timeout: REQUEST_TIMEOUT_MS },
});
