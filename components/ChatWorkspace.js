'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ChatPanel from '@/components/ChatPanel';
import BlueprintSheet from '@/components/BlueprintSheet';
import WorkflowModal from '@/components/WorkflowModal';
import ConversationSidebar from '@/components/ConversationSidebar';
import ThemeToggle from '@/components/ThemeToggle';
import { VyradeLogo } from '@/components/VyradeLogo';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { SquarePen } from 'lucide-react';

export function newChatId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * One chat, addressed by URL: /chat/{sessionId}.
 * The route component remounts this via `key={chatId}`, so all state below is
 * scoped to a single conversation — no manual resetting when switching chats.
 */
export default function ChatWorkspace({ sessionId }) {
  const router = useRouter();

  const [messages, setMessages] = useState([]);
  const [transcript, setTranscript] = useState([]); // plain-text lines for LLM context
  const [conversations, setConversations] = useState([]);
  const [blueprintId, setBlueprintId] = useState(null);
  const [version, setVersion] = useState(null);
  const [blueprint, setBlueprint] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [loadingChat, setLoadingChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Persist a chat message to MySQL (fire-and-forget — UI never blocks on it).
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
      const data = await res.json();
      if (res.ok) setConversations(data.conversations || []);
    } catch {
      /* sidebar is non-critical — ignore */
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Hydrate this chat from the DB. A brand-new id simply returns nothing.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingChat(true);
      try {
        const res = await fetch(`/api/conversations/${sessionId}`);
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
      } catch (err) {
        if (!cancelled) setErrorMsg(err.message);
      } finally {
        if (!cancelled) setLoadingChat(false);
      }
    })();

    return () => { cancelled = true; };
  }, [sessionId]);

  // Append to the visible chat AND persist it.
  function pushMessage(role, content) {
    setMessages((prev) => [...prev, { role, content }]);
    persistMessage(sessionId, role, content);
  }

  // Closing message that reflects REAL readiness — never claim "captured"
  // while blocking requirements remain.
  function announceDone(rdy) {
    if (rdy?.status === 'requirements_complete') {
      pushMessage('system', 'All material requirements are captured. You can generate the workflow whenever you’re ready.');
    } else {
      const missing = rdy?.blocking_unknowns?.length ? ` (still needed: ${rdy.blocking_unknowns.join(', ')})` : '';
      pushMessage('system', `Some required details are still missing${missing}. Please add them so I can complete the blueprint.`);
    }
  }

  // Stream the next clarification question token-by-token into a live bubble.
  async function streamQuestion(id, v, transcriptLines) {
    const res = await fetch(`/api/blueprints/${id}/next-question/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: v, conversation_so_far: transcriptLines.join('\n') }),
    });

    setThinking(false); // response is in — swap the "thinking" dots for the stream

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
    persistMessage(sessionId, 'agent', text);
    return { done: false, text };
  }

  async function handleSend(text) {
    setErrorMsg(null);
    pushMessage('user', text);
    setBusy(true);
    setThinking(true);

    try {
      if (!blueprintId) {
        const nextTranscript = [...transcript, `User: ${text}`];
        setTranscript(nextTranscript);

        const res = await fetch('/api/blueprints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            conversation_text: nextTranscript.join('\n'),
            source_turn_id: 'turn_1',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create Blueprint');

        setBlueprintId(data.blueprint_id);
        setVersion(data.version);
        setBlueprint(data.blueprint);
        setReadiness(data.readiness);

        const result = await streamQuestion(data.blueprint_id, data.version, nextTranscript);
        if (result.done) announceDone(data.readiness);
      } else {
        const nextTranscript = [...transcript, `User: ${text}`];
        setTranscript(nextTranscript);

        const res = await fetch(`/api/blueprints/${blueprintId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expected_version: version,
            new_user_turn: text,
            source_turn_id: `turn_${messages.length + 1}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) {
            throw new Error('The blueprint changed elsewhere before this update landed. Refresh and try again.');
          }
          throw new Error(data.error || 'Failed to update Blueprint');
        }

        setVersion(data.version);
        setBlueprint(data.blueprint);
        setReadiness(data.readiness);

        const result = await streamQuestion(blueprintId, data.version, nextTranscript);
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
      setShowWorkflow(true);
    } catch (err) {
      setErrorMsg(err.message);
      pushMessage('system', `Could not generate workflow: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  function handleNewChat() {
    router.push(`/chat/${newChatId()}`);
  }

  function handleSelectConversation(sid) {
    if (sid === sessionId || busy) return;
    router.push(`/chat/${sid}`);
  }

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        currentSessionId={sessionId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
      />

      <SidebarInset className="flex h-screen min-h-0 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <div className="flex items-center gap-2.5">
            <VyradeLogo className="h-[17px] w-auto text-foreground" />
            <span className="hidden font-mono text-[11px] tracking-wide text-muted-foreground sm:inline">
              automation blueprint
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-1.5">
              <SquarePen />
              New chat
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-rows-1">
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            disabled={busy || loadingChat}
            thinking={thinking}
            loading={loadingChat}
            composerPlaceholder={
              blueprintId ? 'Answer the question above…' : 'e.g. "I want every Facebook lead added to HubSpot…"'
            }
          />

          <BlueprintSheet
            blueprint={blueprint}
            readiness={readiness}
            version={version}
            blueprintId={blueprintId}
            onGenerate={handleGenerate}
            generating={generating}
            workflow={workflow}
            onViewWorkflow={() => setShowWorkflow(true)}
          />
        </div>
      </SidebarInset>

      <WorkflowModal
        workflow={showWorkflow ? workflow : null}
        onClose={() => setShowWorkflow(false)}
      />
    </SidebarProvider>
  );
}
