'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import AuthShell, { Field, AuthInput, AuthButton, AuthLink } from '@/components/auth/AuthShell';
import { track } from '@/lib/analytics/mixpanel';
import { EVENTS } from '@/lib/analytics/events';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    track(EVENTS.SIGN_UP_SUBMITTED);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start drafting automation blueprints in minutes."
      error={error}
      footer={<>Already have an account? <AuthLink href="/login">Sign In</AuthLink></>}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field htmlFor="name">
          <AuthInput id="name" autoComplete="name" required value={form.name} onChange={set('name')} placeholder="Full name" />
        </Field>
        <Field htmlFor="email">
          <AuthInput id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="Email address" />
        </Field>
        <Field htmlFor="password" hint="At least 8 characters.">
          <div className="relative">
            <AuthInput id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={form.password} onChange={set('password')} placeholder="Password" className="pr-10" />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-3.5 text-white/50 hover:text-white">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>

        <AuthButton type="submit" loading={busy}>Create account</AuthButton>
      </form>
    </AuthShell>
  );
}
