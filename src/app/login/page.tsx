'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Lock, User as UserIcon } from 'lucide-react';

export default function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinMode, setJoinMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isRegistering) {
      // 1. Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (authData.user) {
        let finalCompanyId = joinCode;

        if (!joinMode) {
          // Generate the ID client-side so we don't have to rely on .select()
          // because RLS will block the .select() since the user_profile isn't created yet!
          finalCompanyId = crypto.randomUUID();

          // 2. Create the Company without returning it
          const { error: companyError } = await supabase.from('companies').insert([{
            id: finalCompanyId,
            name: companyName
          }]);

          if (companyError) {
            setError(companyError.message);
            setLoading(false);
            return;
          }
        }

        // 3. Create the User Profile mapping to the Company as 'admin' (or 'view' if joining)
        const { error: profileError } = await supabase.from('user_profiles').insert([{
          id: authData.user.id,
          company_id: finalCompanyId,
          role: joinMode ? 'view' : 'admin',
          full_name: fullName
        }]);

        if (profileError) {
          setError(profileError.message);
        } else {
          router.push('/');
        }
      }
    } else {
      // Login
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        router.push('/');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-900 via-blue-950 to-black font-sans selection:bg-[#0f172a]/20 select-none">
      <div className="w-full max-w-sm flex flex-col items-center py-12">
        {/* Top Divider */}
        <hr className="w-full border-white/60 mb-10" />

        {/* Title */}
        <h1 className="text-3xl font-light tracking-[0.25em] text-center uppercase mb-10">
          {isRegistering ? 'User Register' : 'User Login'}
        </h1>

        {/* Error Notification */}
        {error && (
          <div className="w-full mb-6 p-3 bg-red-500/10 border-l-2 border-red-500 text-red-700 text-xs tracking-wide font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuth} className="w-full flex flex-col space-y-6">
          {isRegistering && (
            <>
              {/* Workspace Setup Toggle */}
              <div className="flex items-center justify-between text-[11px] tracking-wider">
                <span className="font-semibold uppercase">
                  {joinMode ? 'Organization Code' : 'Company/Brand'}
                </span>
                <button
                  type="button"
                  onClick={() => setJoinMode(!joinMode)}
                  className="underline hover:text-white font-bold uppercase cursor-pointer"
                >
                  {joinMode ? 'Create New Company' : 'Have a join code?'}
                </button>
              </div>

              {/* Workspace Input */}
              <div className="flex items-end border-b border-[#0f172a]/40 pb-2 focus-within:border-[#0f172a] transition-colors duration-200">
                <Building2 className="h-5 w-5 mr-3 shrink-0" />
                {joinMode ? (
                  <input
                    id="company"
                    type="text"
                    required
                    className="bg-transparent border-none outline-none w-full placeholder-gray-300 text-sm p-0 focus:ring-0 focus:outline-none"
                    placeholder="Paste organization ID here"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value)}
                  />
                ) : (
                  <input
                    id="company"
                    type="text"
                    required
                    className="bg-transparent border-none outline-none w-full placeholder-gray-300 text-sm p-0 focus:ring-0 focus:outline-none"
                    placeholder="Acme Corp"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                  />
                )}
              </div>

              {/* Full Name Input */}
              <div className="flex items-end border-b border-[#0f172a]/40 pb-2 focus-within:border-[#0f172a] transition-colors duration-200">
                <UserIcon className="h-5 w-5 mr-3 shrink-0" />
                <input
                  id="name"
                  type="text"
                  required
                  className="bg-transparent border-none outline-none w-full placeholder-gray-300 text-sm p-0 focus:ring-0 focus:outline-none"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Email Input */}
          <div className="flex items-end border-b border-[#0f172a]/40 pb-2 focus-within:border-[#0f172a] transition-colors duration-200">
            <Mail className="h-5 w-5 mr-3 shrink-0" />
            <input
              id="email"
              type="email"
              required
              className="bg-transparent border-none outline-none w-full placeholder-gray-300 text-sm p-0 focus:ring-0 focus:outline-none"
              placeholder="Email ID"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {/* Password Input */}
          <div className="flex items-end border-b border-[#0f172a]/40 pb-2 focus-within:border-[#0f172a] transition-colors duration-200">
            <Lock className="h-5 w-5 mr-3 shrink-0" />
            <input
              id="password"
              type="password"
              required
              className="bg-transparent border-none outline-none w-full placeholder-gray-300 text-sm p-0 focus:ring-0 focus:outline-none"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {/* Remember Me / Forgot Password row */}
          {!isRegistering && (
            <div className="flex justify-between items-center text-[11px] select-none tracking-wider">
              <label className="flex items-center gap-2 cursor-pointer font-medium hover:text-white transition-colors">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-none border border-[#0f172a]/40 accent-[#0f172a] bg-transparent cursor-pointer"
                />
                <span>Remember me</span>
              </label>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Password reset functionality is not configured yet.");
                }}
                className="hover:underline font-medium hover:text-white transition-colors"
              >
                Forgot Password?
              </a>
            </div>
          )}

          {/* Space */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#0f172a] text-white font-semibold uppercase tracking-widest text-[13px] rounded-none hover:bg-[#0f172a]/90 active:scale-[0.99] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? 'Processing...' : (isRegistering ? 'Register' : 'Login')}
            </button>
          </div>

          {/* Toggle Register/Login Link */}
          <div className="text-center text-[11px] tracking-wider">
            {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
              className="underline hover:text-white font-bold uppercase cursor-pointer"
            >
              {isRegistering ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </form>

        {/* Bottom Divider */}
        <hr className="w-full border-white/60 mt-10" />
      </div>
    </div>
  );
}
