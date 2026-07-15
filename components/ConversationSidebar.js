'use client';

import { Plus, MessageSquare } from 'lucide-react';
import { VyradeLogo, VyradeMark } from '@/components/VyradeLogo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

function formatWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ConversationSidebar({ conversations, currentSessionId, onSelect, onNew }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center px-1 py-1.5 group-data-[collapsible=icon]:justify-center">
          {/* Collapsed rail shows the node mark alone; expanded shows the lockup. */}
          <VyradeMark className="hidden h-6 w-auto shrink-0 group-data-[collapsible=icon]:block" />
          <div className="flex min-w-0 flex-col gap-1 group-data-[collapsible=icon]:hidden">
            <VyradeLogo className="h-[18px] w-auto text-sidebar-foreground" />
            {/* <span className="truncate pl-[1px] font-mono text-[10px] text-muted-foreground">
              blueprint engine
            </span> */}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] tracking-[0.14em]">HISTORY</SidebarGroupLabel>
          <SidebarGroupAction title="New chat" onClick={onNew}>
            <Plus />
            <span className="sr-only">New chat</span>
          </SidebarGroupAction>

          <SidebarGroupContent>
            <SidebarMenu>
              {(!conversations || conversations.length === 0) && (
                <p className="px-2 py-3 font-mono text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  No conversations yet.
                </p>
              )}

              {conversations?.map((c) => (
                <SidebarMenuItem key={c.session_id}>
                  <SidebarMenuButton
                    isActive={c.session_id === currentSessionId}
                    onClick={() => onSelect(c.session_id)}
                    tooltip={c.title || 'Untitled automation'}
                    className="h-auto py-2"
                  >
                    <MessageSquare className="shrink-0" />
                    <div className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="w-full truncate text-[13px] leading-snug">
                        {c.title || 'Untitled automation'}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatWhen(c.updated_at)}
                      </span>
                    </div>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="font-mono text-[10px]">
                    {c.message_count ?? 0}
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNew} tooltip="New chat">
              <Plus />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
