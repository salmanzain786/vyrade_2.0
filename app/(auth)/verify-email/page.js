'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthShell, { Field, AuthInput, AuthButton, AuthLink } from '@/components/auth/AuthShell';

function VerifyEmailInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null); setNotice(null); setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      window.location.assign('/');
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  }

  async function onResend() {
    setError(null); setNotice(null); setResending(true);
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not resend code');
      setNotice(data.message || 'A new code is on its way.');
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Enter the 6-digit code we emailed you. It expires in 10 minutes."
      error={error}
      notice={notice}
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field htmlFor="email">
          <AuthInput id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
        </Field>
        <Field htmlFor="code">
          <AuthInput
            id="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456" className="tracking-[0.4em] text-center text-lg"
          />
        </Field>
        <AuthButton type="submit" loading={busy}>Verify &amp; continue</AuthButton>
      </form>

      <div className="mt-4 text-center text-sm text-white/50">
        Didn’t get it?{' '}
        <button type="button" onClick={onResend} disabled={resending} className="font-medium text-white hover:underline disabled:opacity-50">
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><VerifyEmailInner /></Suspense>;
}
