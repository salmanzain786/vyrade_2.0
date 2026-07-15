'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import AppSidebar from '@/components/shell/AppSidebar';
import ChatBox from '@/components/chat/ChatBox';
import ChatMessage from '@/components/chat/ChatMessage';
import Thinking from '@/components/chat/Thinking';
import BlueprintSheet from '@/components/BlueprintSheet';
import WorkflowModal from '@/components/WorkflowModal';
import { VyradeMark } from '@/components/VyradeLogo';
import { cn } from '@/lib/utils';

export function newChatId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * One chat, addressed by URL: /chat/{sessionId}. Chrome (icon-rail sidebar,
 * top bar, chat, blueprint drawer) mirrors chat-vyrade-ai-next-all; the blueprint
 * engine logic underneath is unchanged.
 */
export default function ChatWorkspace({ sessionId, user }) {
  const router = useRouter();

  const [messages, setMessages] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [query, setQuery] = useState('');
  const [blueprintId, setBlueprintId] = useState(null);
  const [version, setVersion] = useState(null);
  const [blueprint, setBlueprint] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [loadingChat, setLoadingChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [workflowStale, setWorkflowStale] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [exportingPlatform, setExportingPlatform] = useState(null);
  const [platformReadiness, setPlatformReadiness] = useState(null);
  const [, setErrorMsg] = useState(null);

  const scrollRef = useRef(null);

  const persistMessage = useCallback((sid, role, content) => {
    fetch(`/api/conversations/${sid}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    }).catch(() => {});
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.status === 401) { window.location.assign('/login'); return; }
      const data = await res.json();
      if (res.ok) setConversations(data.conversations || []);
    } catch { /* sidebar is non-critical */ }
  }, []);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  // Export-platform readiness (Full export / Guide only / Coming soon).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/export/platforms');
        if (res.ok) { const d = await res.json(); setPlatformReadiness(d.readiness || null); }
      } catch { /* labels fall back to defaults */ }
    })();
  }, []);

  // Hydrate this chat from the DB.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingChat(true);
      try {
        const res = await fetch(`/api/conversations/${sessionId}`);
        if (res.status === 401) { window.location.assign('/login'); return; }
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Failed to load conversation');

        setMessages((data.messages || []).map((m) => ({ role: m.role, content: m.content })));
        setTranscript(
          (data.messages || [])
            .filter((m) => m.role === 'user' || m.role === 'agent')
            .map((m) => (m.role === 'user' ? 'User: ' : 'Vyrade: ') + m.content)
        );
        if (data.blueprint) {
          setBlueprintId(data.blueprint.blueprint_id);
          setVersion(data.blueprint.version);
          setBlueprint(data.blueprint.blueprint);
          setReadiness(data.blueprint.readiness);
        }
        setWorkflow(data.workflow || null);
        setWorkflowStale(!!data.workflowMeta?.is_stale);
      } catch (err) {
        if (!cancelled) setErrorMsg(err.message);
      } finally {
        if (!cancelled) setLoadingChat(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  function pushMessage(role, content) {
    setMessages((prev) => [...prev, { role, content }]);
    persistMessage(sessionId, role, content);
  }

  function announceDone(rdy) {
    if (rdy?.status === 'requirements_complete') {
      pushMessage('system', 'All material requirements are captured. You can generate the workflow whenever you’re ready.');
      return;
    }
    const items = rdy?.blocking_questions?.length ? rdy.blocking_questions : rdy?.blocking_unknowns;
    const list = items?.length ? '\n\n' + items.map((d) => `• ${d}`).join('\n') : '';
    pushMessage('system', `Before I can complete the blueprint, I still need a bit more from you:${list}\n\nJust reply with whatever you can and I’ll fill it in.`);
  }

  async function streamQuestion(id, v, transcriptLines, blueprintUsage = null) {
    const res = await fetch(`/api/blueprints/${id}/next-question/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: v, conversation_so_far: transcriptLines.join('\n'), blueprint_usage: blueprintUsage }),
    });

    setThinking(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to get next question');
    }
    if (res.headers.get('X-Chat-Done') === 'true') return { done: true };

    setMessages((prev) => [...prev, { role: 'agent', content: '', streaming: true }]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'agent', content: acc, streaming: true };
        return copy;
      });
    }

    const text = acc.trim();
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { role: 'agent', content: text, streaming: false };
      return copy;
    });
    setTranscript((t) => [...t, `Vyrade: ${text}`]);
    return { done: false, text };
  }

  async function handleSend() {
    const text = query.trim();
    if (!text || busy) return;
    setQuery('');
    setErrorMsg(null);
    pushMessage('user', text);
    setBusy(true);
    setThinking(true);

    try {
      const nextTranscript = [...transcript, `User: ${text}`];
      setTranscript(nextTranscript);

      if (!blueprintId) {
        const res = await fetch('/api/blueprints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, conversation_text: nextTranscript.join('\n'), source_turn_id: 'turn_1' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create Blueprint');

        setBlueprintId(data.blueprint_id);
        setVersion(data.version);
        setBlueprint(data.blueprint);
        setReadiness(data.readiness);

        const result = await streamQuestion(data.blueprint_id, data.version, nextTranscript, data.usage);
        if (result.done) announceDone(data.readiness);
      } else {
        const res = await fetch(`/api/blueprints/${blueprintId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expected_version: version, new_user_turn: text, source_turn_id: `turn_${messages.length + 1}` }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) throw new Error('The blueprint changed elsewhere before this update landed. Refresh and try again.');
          throw new Error(data.error || 'Failed to update Blueprint');
        }

        setVersion(data.version);
        setBlueprint(data.blueprint);
        setReadiness(data.readiness);
        if (workflow) setWorkflowStale(true);

        const result = await streamQuestion(blueprintId, data.version, nextTranscript, data.usage);
        if (result.done) announceDone(data.readiness);
      }
    } catch (err) {
      setErrorMsg(err.message);
      pushMessage('system', `Something went wrong: ${err.message}`);
    } finally {
      setBusy(false);
      setThinking(false);
      refreshConversations();
    }
  }

  async function handleGenerate() {
    if (!blueprintId || !version) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const finalizeRes = await fetch(`/api/blueprints/${blueprintId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_version: version }),
      });
      const finalizeData = await finalizeRes.json();
      if (!finalizeRes.ok) throw new Error(finalizeData.error || 'Finalize failed');

      setVersion(finalizeData.version);
      setReadiness(finalizeData.readiness);
      if (finalizeData.status !== 'requirements_complete') {
        throw new Error('Blueprint is not yet ready — some material requirements are still missing.');
      }

      const genRes = await fetch(`/api/blueprints/${blueprintId}/generate-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: finalizeData.version }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error || 'Workflow generation failed');

      setWorkflow(genData.workflow);
      setWorkflowStale(false);
      setShowWorkflow(true);
      setMessages((prev) => [...prev, { role: 'system', content: 'Generated n8n workflow.' }]);
    } catch (err) {
      setErrorMsg(err.message);
      pushMessage('system', `Could not generate workflow: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  // Unified export for claude/make/zapier (n8n uses handleGenerate). Downloads
  // the package/guide ZIP for the selected platform.
  async function handleExport(platform) {
    if (!blueprintId || exportingPlatform) return;
    setExportingPlatform(platform);
    try {
      const res = await fetch(`/api/blueprints/${blueprintId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, version }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      a.download = m ? m[1] : `${platform}-export.zip`;
      a.click();
      URL.revokeObjectURL(url);
      const grounded = res.headers.get('X-Export-Grounded');
      const readiness = res.headers.get('X-Export-Readiness');
      toast.success(
        readiness === 'guide' || readiness === 'coming_soon'
          ? `${platform} implementation guide downloaded${grounded === 'false' ? ' (generic)' : ''}`
          : 'Package downloaded'
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExportingPlatform(null);
    }
  }

  async function handleCopyClaudePrompt() {
    if (!blueprintId) return;
    try {
      const res = await fetch(`/api/blueprints/${blueprintId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'claude', part: 'prompt', version }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not build prompt');
      await navigator.clipboard.writeText(data.prompt);
      toast.success('Claude prompt copied to clipboard');
    } catch (err) {
      toast.error(err.message);
    }
  }

  function handleNewChat() { router.push(`/chat/${newChatId()}`); }
  function handleSelectConversation(sid) { if (sid !== sessionId && !busy) router.push(`/chat/${sid}`); }

  const empty = messages.length === 0 && !thinking;
  const statusColor =
    readiness?.status === 'requirements_complete' ? 'bg-green-500'
    : blueprintId ? 'bg-amber-500' : 'bg-muted-foreground/40';

  return (
    <>
      <AppSidebar
        user={user}
        conversations={conversations}
        currentSessionId={sessionId}
        onNewChat={handleNewChat}
        onSelect={handleSelectConversation}
      />

      <div className="sm:ml-16 h-screen flex flex-col bg-sidebar pb-16 sm:pb-0">
        {/* Top header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4">
          <div className="flex items-center gap-2 sm:hidden">
            <VyradeMark className="h-6 w-auto" />
            <span className="text-sm font-semibold">Vyrade.ai</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {blueprintId && <span className={cn('h-2 w-2 rounded-full', statusColor)} />}
            <span>{blueprint?.name || 'New automation'}</span>
          </div>
        </header>

        {/* Chat (left) + Blueprint (right column) */}
        <div className="flex-1 min-h-0 flex">
          <main className="relative flex-1 min-w-0 flex flex-col">
            {empty ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4">
                <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground text-center mb-2 leading-tight">
                    You Know the Goal. We Know the Workflow.
                  </h1>
                  <p className="text-sm sm:text-base lg:text-lg text-muted-foreground text-center mb-8 max-w-xl">
                    Just describe your outcome — we’ll draft the automation blueprint.
                  </p>
                  <div className="w-full">
                    <ChatBox
                      value={query}
                      onChange={setQuery}
                      onSubmit={handleSend}
                      loading={busy}
                      placeholder="e.g. Add every new Facebook lead to HubSpot and alert Sales on Slack"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                  <div className="mx-auto w-full max-w-3xl py-6">
                    {messages.map((m, i) => (
                      <ChatMessage key={i} role={m.role} content={m.content} streaming={m.streaming} />
                    ))}
                    {thinking && (
                      <div className="px-4 py-4"><Thinking /></div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 border-t border-sidebar-border bg-sidebar px-4 pb-4">
                  <div className="mx-auto w-full max-w-3xl">
                    <ChatBox
                      value={query}
                      onChange={setQuery}
                      onSubmit={handleSend}
                      loading={busy}
                      placeholder={blueprintId ? 'Answer the question above…' : 'Describe your automation…'}
                      disclaimer=""
                    />
                  </div>
                </div>
              </>
            )}
          </main>

          {/* Blueprint right column — shown once a blueprint exists */}
          {blueprintId && (
            <aside className="hidden lg:flex w-[70%] xl:w-[70%] shrink-0 flex-col border-l border-border bg-card">
              <BlueprintSheet
                blueprint={blueprint}
                readiness={readiness}
                version={version}
                blueprintId={blueprintId}
                onGenerate={handleGenerate}
                generating={generating}
                workflow={workflow}
                workflowStale={workflowStale}
                onViewWorkflow={() => setShowWorkflow(true)}
                onExportPlatform={handleExport}
                onCopyPrompt={handleCopyClaudePrompt}
                exportingPlatform={exportingPlatform}
                platformReadiness={platformReadiness}
              />
            </aside>
          )}
        </div>
      </div>

      <WorkflowModal workflow={showWorkflow ? workflow : null} onClose={() => setShowWorkflow(false)} />
    </>
  );
}
