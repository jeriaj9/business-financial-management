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
    
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error) {
        console.error("getSession error:", error);
      }
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
        if (window.location.pathname !== '/login') {
          router.push('/login');
        }
      }
    }).catch((err) => {
      console.error("Auth session exception:", err);
      if (mounted) {
        setLoading(false);
        if (window.location.pathname !== '/login') {
          router.push('/login');
        }
      }
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      // INITIAL_SESSION is handled by getSession to avoid race conditions. 
      // Only handle subsequent events.
      if (event === 'INITIAL_SESSION') return;
      
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

    return () => {
      mounted = false;
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
