'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {isRegistering ? 'Create your workspace' : 'Welcome back'}
          </CardTitle>
          <CardDescription>
            {isRegistering 
              ? 'Setup your brand and start managing your finances' 
              : 'Enter your credentials to access your account'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleAuth}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}
            
            {isRegistering && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="company">{joinMode ? 'Organization ID (Join Code)' : 'Company / Brand Name'}</Label>
                    <button 
                      type="button" 
                      onClick={() => setJoinMode(!joinMode)}
                      className="text-xs text-primary hover:underline"
                    >
                      {joinMode ? 'Create new company instead' : 'Have a join code?'}
                    </button>
                  </div>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    {joinMode ? (
                      <Input id="company" required className="pl-9" placeholder="Paste ID here" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
                    ) : (
                      <Input id="company" required className="pl-9" placeholder="Acme Corp" value={companyName} onChange={e => setCompanyName(e.target.value)} />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="name" required className="pl-9" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" required className="pl-9" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="password" type="password" required className="pl-9" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Sign In')}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
              <button 
                type="button" 
                onClick={() => { setIsRegistering(!isRegistering); setError(null); }} 
                className="underline hover:text-primary font-medium"
              >
                {isRegistering ? 'Sign In' : 'Sign Up'}
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
