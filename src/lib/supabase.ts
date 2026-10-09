import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment variables.");
}

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

export function readStoredSession(): { access_token?: string; user?: { id: string; email?: string } } | null {
  if (typeof window === 'undefined' || !authStorageKey) return null;
  try {
    const raw = window.localStorage.getItem(authStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Fallback to dummy strings to prevent the entire JS bundle from crashing,
// but auth and db calls will fail if they are missing.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder', {
  global: {
    fetch: async (url, options) => {
      // Manually inject Authorization header if we have a token in localStorage to bypass gotrue-js deadlocks
      if (typeof window !== 'undefined') {
        try {
          const token = readStoredSession()?.access_token;
          // Only override if it's not already overridden and not a gotrue-js token refresh request
          if (token && !url.toString().includes('/auth/v1/')) {
            options = options || {};
            const headers = new Headers(options.headers);
            headers.set('Authorization', `Bearer ${token}`);
            // Ensure apikey is also explicitly preserved if missing, though Headers copy should handle it
            if (!headers.has('apikey') && supabaseKey) {
              headers.set('apikey', supabaseKey);
            }
            options.headers = headers;
          }
        } catch {
          // Ignore parse errors
        }
      }
      return fetch(url, options);
    }
  }
});
