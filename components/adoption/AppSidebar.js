'use client';

import { usePathname } from 'next/navigation';
import { Gauge, User, Activity, Building2, Sparkles, Users, ArrowLeft } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from '@/components/ui/sidebar';
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

export default function AppSidebar() {
  const pathname = usePathname() || '/dashboard';

  return (
    <Sidebar collapsible="icon" className="border-r border-white/10">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-white/5 data-[state=open]:bg-white/5">
              <a href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600/15 text-blue-500">
                  <VyradeMark className="size-5" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold text-white">Vyrade</span>
                  <span className="truncate text-[10px] font-medium uppercase tracking-wider text-blue-400">AI Adoption</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.section}>
            <SidebarGroupLabel className="text-white/40">{group.section}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="text-white/70 hover:bg-white/5 hover:text-white data-[active=true]:bg-blue-600/15 data-[active=true]:text-blue-400 data-[active=true]:font-medium"
                    >
                      <a href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to workspace" className="text-white/60 hover:bg-white/5 hover:text-white">
              <a href="/">
                <ArrowLeft />
                <span>Back to workspace</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
