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

    // Fallback: if onAuthStateChange doesn't fire INITIAL_SESSION quickly (e.g. Supabase client bug), manually check
    const fallbackTimer = setTimeout(async () => {
      if (mounted && !isResolved) {
        console.warn("Auth state change took too long. Forcing session check.");
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted && !isResolved) {
          isResolved = true;
          setUser(session?.user ?? null);
          if (session?.user) {
            await fetchProfile(session.user.id);
            if (window.location.pathname === '/login') router.push('/');
          } else {
            setLoading(false);
            if (window.location.pathname !== '/login') router.push('/login');
          }
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
