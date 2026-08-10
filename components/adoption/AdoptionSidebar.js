'use client';

import { usePathname } from 'next/navigation';
import { Gauge, User, Activity, Building2, Sparkles, Users, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VyradeMark } from '@/components/VyradeLogo';

const NAV = [
  {
    section: 'Your adoption',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Gauge, exact: true },
      { href: '/dashboard/profile', label: 'Profile', icon: User },
      { href: '/dashboard/telemetry', label: 'Telemetry', icon: Activity },
    ],
  },
  {
    section: 'Organisation',
    items: [
      { href: '/org', label: 'Overview', icon: Building2, exact: true },
      { href: '/org/opportunities', label: 'Opportunities', icon: Sparkles },
      { href: '/org/members', label: 'Members', icon: Users },
    ],
  },
];

function isActive(pathname, item) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, active, compact }) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        compact && 'flex-col gap-1 px-3 py-1.5 text-xs',
        active
          ? 'bg-blue-600/10 font-medium text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'text-blue-600 dark:text-blue-400')} />
      <span className={cn(!compact && 'truncate')}>{item.label}</span>
    </a>
  );
}

export default function AdoptionSidebar() {
  const pathname = usePathname() || '/dashboard';
  const allItems = NAV.flatMap((s) => s.items);

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <VyradeMark className="h-6 w-auto" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground">Vyrade</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">AI Adoption</span>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV.map((s) => (
            <div key={s.section} className="space-y-1">
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.section}</p>
              {s.items.map((item) => <NavLink key={item.href} item={item} active={isActive(pathname, item)} />)}
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <a href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to workspace
          </a>
        </div>
      </aside>

      {/* ── Mobile top nav ── */}
      <div className="sticky top-0 z-40 border-b border-border bg-card md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2"><VyradeMark className="h-5 w-auto" /><span className="text-sm font-semibold">AI Adoption</span></div>
          <a href="/" className="text-xs text-muted-foreground hover:text-foreground">Workspace</a>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {allItems.map((item) => <NavLink key={item.href} item={item} active={isActive(pathname, item)} compact />)}
        </nav>
      </div>
    </>
  );
}
