'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';

type AuthContextType = {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;
    
    // Safety net: Force loading to false after 5 seconds if Supabase hangs
    const safetyTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth initialization timed out! Forcing load to finish.");
        setLoading(false);
      }
    }, 5000);
    
    let isResolved = false;

    // Use onAuthStateChange as the single source of truth to avoid Strict Mode getSession deadlocks
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      isResolved = true;
      
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
        if (window.location.pathname === '/login') {
          router.push('/');
        }
      } else {
        setProfile(null);
        setLoading(false);
        if (window.location.pathname !== '/login') {
          router.push('/login');
        }
      }
    });

    // Fallback: if onAuthStateChange doesn't fire INITIAL_SESSION quickly (e.g. multi-tab lock deadlocks)
    const fallbackTimer = setTimeout(async () => {
      if (mounted && !isResolved) {
        console.warn("Auth state change took too long. Forcing manual session check to bypass locks.");
        try {
          let sessionUser = null;
          let accessToken = null;
          
          if (typeof window !== 'undefined') {
            const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
            const storageKey = projectId ? `sb-${projectId}-auth-token` : null;
            if (storageKey) {
              const sessionStr = window.localStorage.getItem(storageKey);
              if (sessionStr) {
                const sessionObj = JSON.parse(sessionStr);
                sessionUser = sessionObj?.user ?? null;
                accessToken = sessionObj?.access_token ?? null;
              }
            }
          }

          if (mounted && !isResolved) {
            isResolved = true;
            setUser(sessionUser);
            if (sessionUser && accessToken && process.env.NEXT_PUBLIC_SUPABASE_URL) {
              // Manually fetch the profile via REST to completely bypass the deadlocked Supabase client
              try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?id=eq.${sessionUser.id}&select=*,companies(*)`, {
                  headers: {
                    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.pgrst.object+json' // single() equivalent
                  }
                });
                if (res.ok) {
                  const data = await res.json();
                  setProfile(data);
                } else {
                  console.error("Manual profile fetch failed:", await res.text());
                }
              } catch (err) {
                console.error("Manual profile fetch exception:", err);
              } finally {
                setLoading(false);
              }
              if (window.location.pathname === '/login') router.push('/');
            } else {
              setLoading(false);
              if (window.location.pathname !== '/login') router.push('/login');
            }
          }
        } catch (e) {
          console.error("Fallback execution failed:", e);
          if (mounted) setLoading(false);
        }
      }
    }, 1000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('user_profiles').select('*, companies(*)').eq('id', userId).single();
      if (error) {
        console.error("Supabase profile fetch error:", error);
      }
      if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error("Profile fetch exception:", err);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
