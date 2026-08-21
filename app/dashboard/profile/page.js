import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Sparkles, Target, GraduationCap, CheckCircle2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ProfileForm from '@/components/adoption/ProfileForm';

export const dynamic = 'force-dynamic';

const WHY = [
  { icon: Target, title: 'Role & department', text: 'Map the automation opportunities that matter to you.' },
  { icon: Sparkles, title: 'Industry & size', text: 'Sharpen the benchmark estimates behind your score.' },
  { icon: GraduationCap, title: 'Skill level', text: 'Tailor recommendations to what you can build today.' },
];

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      <Link href="/dashboard" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-600/10 via-card to-card p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative">
          <Badge variant="outline" className="mb-3 gap-1.5 border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400">
            <User className="h-3 w-3" /> Profile
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Your profile</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">Tell us about your role so we can map the automation opportunities that matter to you — and personalise your adoption score.</p>
        </div>
      </div>

      {/* Content */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Info panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Sparkles className="h-5 w-5" /></span>
              <div>
                <CardTitle className="text-base">Why we ask</CardTitle>
                <CardDescription className="mt-1 text-xs">Every field feeds a better result.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {WHY.map((w) => (
                  <li key={w.title} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><w.icon className="h-4 w-4" /></span>
                    <div>
                      <div className="text-sm font-medium">{w.title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{w.text}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs leading-relaxed text-blue-700 dark:text-blue-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The minimum — role, department and industry — is enough to generate your opportunity map. The rest just makes it sharper.</span>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><User className="h-5 w-5" /></span>
            <div>
              <CardTitle className="text-base">About you</CardTitle>
              <CardDescription className="mt-1 text-xs">Fields marked with the essentials generate your personalised map.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><ProfileForm /></CardContent>
        </Card>
      </div>
    </div>
  );
}
