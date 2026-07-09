# Vyrade — Automation Blueprint (Next.js)

Full-stack Next.js app (App Router) implementing the Automation Blueprint
Engine from `Vyrade_Automation_Blueprint_Developer_Spec_v1_FINAL.docx`, with
a chat UI on the left and a live "drafting sheet" view of the Blueprint on
the right.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in DB + OpenAI credentials
npm run migrate                # creates the MySQL tables
npm run dev                    # http://localhost:3000
```

## What's included

**UI** (`app/page.js` + `components/`)
- Two-pane layout: chat on the left, Blueprint Sheet on the right.
- The Blueprint Sheet fills in section by section as the conversation
  reveals more (business intent, trigger, systems, process steps, business
  rules, volume/approval, open items) — a live view of Section 7/8 of the
  spec, not just a raw JSON dump.
- A readiness meter and status stamp (`IN PROGRESS` / `COMPLETE` / `BLOCKED`)
  driven directly by the readiness check (Section 13) — never by the model
  just saying "done."
- "Create n8n Workflow" is disabled until `status === "requirements_complete"`.
- A title block (drawing no. / rev / sheet) showing `blueprint_id` and
  `version` — the same information your dev team would use to trace
  "conversation → Blueprint version → export" (Section 28).

**Backend** (`app/api/blueprints/**`, `lib/`)
Same engine as the standalone Node/Express version from earlier in this
conversation, ported to Next.js API routes:
- `POST /api/blueprints` — create initial Blueprint (Section 16.1)
- `PATCH /api/blueprints/:id` — patch from a clarification answer, with
  optimistic concurrency (Section 16.2)
- `GET /api/blueprints/:id` — latest version (Section 16.3)
- `GET /api/blueprints/:id/versions/:version` (Section 16.4)
- `POST /api/blueprints/:id/finalize` (Section 16.5)
- `POST /api/blueprints/:id/next-question` — convenience endpoint the chat
  UI uses to decide what to ask next, driven by actual Blueprint gaps
- `POST /api/blueprints/:id/generate-workflow` — **placeholder**. Task 1
  (this doc) doesn't cover the Retrieval Router / n8n Specialist — swap the
  stub in `lib/services/blueprintService.js` (`generateWorkflowStub`) for
  your real n8n RAG + generation pipeline.

## How a session flows

1. User types the first message → creates Blueprint v1, agent asks the
   first clarifying question driven by the actual gaps.
2. Each answer → `PATCH` creates a new version, sheet updates live, next
   question is asked (or "DONE" if nothing material is left).
3. User clicks **Create n8n Workflow** → `finalize` runs one last
   validation/readiness pass → if complete, hands off to
   `generate-workflow` → modal shows the JSON with a download button.

## Design notes

The Blueprint Sheet deliberately looks like an architectural drafting
sheet (grid linework, title block, rotated status stamp) rather than a
generic dashboard card — the product is literally called a "blueprint," so
the UI leans into that instead of a stock chat-app look.

## Things to adapt before production

- No auth/tenant scoping yet — add your existing auth middleware in front
  of the `app/api/blueprints` routes (Section 27).
- `conversation_text` is passed directly from the client for simplicity;
  swap in a server-side conversation-store lookup if you already persist
  chat history, per Section 16.1's `conversation_reference` note.
- Add credential/secret redaction on raw user input before it ever reaches
  the LLM (Section 27).
- `generate-workflow` is a stub — see above.
