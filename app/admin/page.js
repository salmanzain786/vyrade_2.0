import { getCurrentUser } from '@/lib/auth/session';

// Admin overview stub (the gate landing). The real views (blueprints, failures,
// cost, insights) arrive in milestones 3.3–3.6; this confirms the gate works and
// is the shell they'll hang off.
export const dynamic = 'force-dynamic';

const VIEWS = [
  { href: '/admin/blueprints', title: 'Blueprints', desc: 'All blueprints: status, readiness, version, activity.' },
  { href: '/admin/failures', title: 'Failures & import checks', desc: 'Import failures, failing nodes, repairs.' },
  { href: '/admin/cost', title: 'Cost & usage', desc: 'Per-user token spend, trend, rate-limit blocks.' },
  { href: '/admin/insights', title: 'Operational insights', desc: 'Top failing nodes, doc gaps, outcomes.' },
];

export default async function AdminHome() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Vyrade Admin</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user?.email} · operational visibility</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {VIEWS.map((v) => (
          <a key={v.href} href={v.href} className="rounded-lg border p-4 transition hover:bg-accent">
            <div className="font-medium">{v.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{v.desc}</div>
          </a>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Views are built in milestones 3.3–3.6.</p>
    </main>
  );
}
