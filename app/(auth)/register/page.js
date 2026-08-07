'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import AuthShell, { Field, AuthInput, AuthButton, AuthLink } from '@/components/auth/AuthShell';
import { safeNext } from '@/lib/utils';
import { track } from '@/lib/analytics/mixpanel';
import { EVENTS } from '@/lib/analytics/events';

export default function RegisterPage() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'), '');
  const withNext = (base) => (next ? `${base}${base.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}` : base);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '', department: '', industry: '' });
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
      router.push(withNext(`/verify-email?email=${encodeURIComponent(form.email)}`));
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
      footer={<>Already have an account? <AuthLink href={withNext('/login')}>Sign In</AuthLink></>}
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

        {/* Minimum profile (1.1) — optional, personalises the dashboard from day one. */}
        <div className="pt-1">
          <p className="mb-2 text-xs text-white/40">Optional — helps us tailor your automation opportunities.</p>
          <div className="space-y-3">
            <AuthInput id="role" value={form.role} onChange={set('role')} placeholder="Role (e.g. Marketing Manager)" />
            <select
              id="department"
              value={form.department}
              onChange={set('department')}
              className="w-full rounded-xl border border-[#383839] bg-[#29292B] px-3 py-3 text-sm text-white focus:border-[#4a4a4c] focus:bg-[#383839] focus:outline-none"
            >
              <option value="">Department (optional)</option>
              <option value="marketing">Marketing</option>
              <option value="sales">Sales</option>
              <option value="finance">Finance</option>
              <option value="support">Customer Support</option>
              <option value="operations">Operations</option>
              <option value="hr">People / HR</option>
              <option value="it">IT</option>
              <option value="product">Product</option>
              <option value="general">Other / Cross-functional</option>
            </select>
            <AuthInput id="industry" value={form.industry} onChange={set('industry')} placeholder="Industry (e.g. SaaS)" />
          </div>
        </div>

        <AuthButton type="submit" loading={busy}>Create account</AuthButton>
      </form>
    </AuthShell>
  );
}
