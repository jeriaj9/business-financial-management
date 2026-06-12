import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment variables.");
}

const isBrowser = typeof window !== 'undefined';

// Fallback to dummy strings to prevent the entire JS bundle from crashing,
// but auth and db calls will fail if they are missing.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder', {
  global: {
    fetch: async (url, options) => {
      // Manually inject Authorization header if we have a token in localStorage to bypass gotrue-js deadlocks
      if (typeof window !== 'undefined') {
        try {
          const projectId = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
          const storageKey = projectId ? `sb-${projectId}-auth-token` : null;
          if (storageKey) {
            const sessionStr = window.localStorage.getItem(storageKey);
            if (sessionStr) {
              const sessionObj = JSON.parse(sessionStr);
              const token = sessionObj?.access_token;
              // Only override if it's not already overridden and not a gotrue-js token refresh request
              if (token && !url.toString().includes('/auth/v1/token')) {
                options = options || {};
                const headers = new Headers(options.headers);
                headers.set('Authorization', `Bearer ${token}`);
                // Ensure apikey is also explicitly preserved if missing, though Headers copy should handle it
                if (!headers.has('apikey') && supabaseKey) {
                  headers.set('apikey', supabaseKey);
                }
                options.headers = headers;
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      return fetch(url, options);
    }
  }
});
