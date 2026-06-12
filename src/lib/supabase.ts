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
  auth: {
    ...(isBrowser ? {
      lock: async (name, acquire) => {
        // Completely disable the lock mechanism to prevent multi-tab and reload deadlocks
        // Cast to any to avoid TS errors
        const acquireFn = acquire as any;
        if (typeof acquireFn === 'function') {
          return await acquireFn();
        }
        return null;
      }
    } : {})
  }
});
