'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthShell, { Field, AuthLink } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState('email'); // 'email' | 'reset' | 'done'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send reset code');
      setNotice(data.message || 'If an account exists, a code is on its way.');
      setStep('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      // 1) Exchange the OTP for a short-lived reset token.
      const verifyRes = await fetch('/api/auth/verify-reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Invalid code');

      // 2) Use that token to set the new password.
      const resetRes = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken: verifyData.resetToken, password }),
      });
      const resetData = await resetRes.json();
      if (!resetRes.ok) throw new Error(resetData.error || 'Could not reset password');

      setStep('done');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <AuthShell title="Password updated" subtitle="Redirecting you to sign in…" notice="Your password has been changed. You can now sign in with it.">
        <AuthLink href="/login">Go to sign in</AuthLink>
      </AuthShell>
    );
  }

  if (step === 'reset') {
    return (
      <AuthShell
        title="Reset your password"
        subtitle={`Enter the 6-digit code sent to ${email} and choose a new password.`}
        error={error}
        notice={notice}
        footer={<AuthLink href="/login">Back to sign in</AuthLink>}
      >
        <form onSubmit={submitReset} className="space-y-4">
          <Field label="Reset code" htmlFor="code">
            <Input
              id="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="tracking-[0.4em] text-center font-mono text-lg"
            />
          </Field>

          <Field label="New password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>

          <Field label="Confirm new password" htmlFor="confirm">
            <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
          </Field>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>

          <button type="button" onClick={() => setStep('email')} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">
            Use a different email
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we’ll send a 6-digit reset code."
      error={error}
      notice={notice}
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <form onSubmit={requestCode} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </Field>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset code'}
        </Button>
      </form>
    </AuthShell>
  );
}
