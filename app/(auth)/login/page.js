'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import AuthShell, { Field, AuthInput, AuthButton, AuthLink } from '@/components/auth/AuthShell';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsVerification) { router.push(`/verify-email?email=${encodeURIComponent(email)}`); return; }
        throw new Error(data.error || 'Login failed');
      }
      window.location.assign('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign In"
      subtitle="Welcome back — pick up where your blueprints left off."
      error={error}
      footer={<>Don’t have an account? <AuthLink href="/register">Sign Up</AuthLink></>}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field htmlFor="email">
          <AuthInput id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
        </Field>

        <Field htmlFor="password">
          <div className="relative">
            <AuthInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="pr-10"
            />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-3.5 text-white/50 hover:text-white">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>

        <div className="text-right">
          <Link_ href="/forgot-password">Forgot Password?</Link_>
        </div>

        <AuthButton type="submit" loading={busy}>Sign In</AuthButton>
      </form>
    </AuthShell>
  );
}

function Link_({ href, children }) {
  return <a href={href} className="text-sm text-white/50 hover:text-white">{children}</a>;
}
