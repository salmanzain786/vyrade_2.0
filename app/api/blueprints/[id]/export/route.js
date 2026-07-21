import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { runPlatformExport, UnsupportedPlatformError } from '../../../../../lib/services/exportService.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';
import { trackServer } from '../../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

function slug(s) {
  return String(s || 'automation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'automation';
}

// Unified export endpoint (Task 11).
// POST { platform, version?, part?, allow_generic?, allow_historical? }
//  - platform is REQUIRED — Make/Zapier cannot run without an explicit route.
//  - a "coming soon" platform returns 409 unless allow_generic=true.
//  - n8n → JSON { workflow }
//  - claude/make/zapier → ZIP download (or JSON { prompt } when part='prompt')
export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const body = await request.json().catch(() => ({}));
  if (!body.platform) {
    throw new UnsupportedPlatformError('Select an export platform (n8n, claude, make, or zapier).');
  }

  const result = await runPlatformExport({
    blueprintId: params.id,
    version: body.version ? Number(body.version) : null,
    platform: body.platform,
    allowGeneric: body.allow_generic === true,
    allowHistorical: body.allow_historical === true,
  });

  // The prompt-copy path is a client-tracked action (Claude Prompt Copied); the
  // authoritative "Export Completed" only covers real file/workflow exports.
  if (body.part !== 'prompt') {
    trackServer(EVENTS.EXPORT_COMPLETED, {
      distinctId: user.id,
      blueprint_id: params.id,
      platform: result.platform,
      kind: result.kind,
      readiness: result.readiness ?? null,
      grounded: result.grounded ?? null,
      file_count: result.files ? Object.keys(result.files).length : null,
    });
  }

  if (result.kind === 'workflow') {
    return NextResponse.json({ platform: result.platform, readiness: result.readiness, workflow: result.workflow });
  }

  if (body.part === 'prompt' && result.prompt) {
    return NextResponse.json({ platform: result.platform, prompt: result.prompt, files: Object.keys(result.files || {}) });
  }

  const zip = new JSZip();
  for (const [name, content] of Object.entries(result.files || {})) zip.file(name, content);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  const suffix = result.kind === 'guide' ? 'guide' : 'package';
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug(result.name)}-${result.platform}-${suffix}.zip"`,
      'X-Export-Readiness': result.readiness || '',
      'X-Export-Grounded': String(result.grounded ?? ''),
      'Cache-Control': 'no-store',
    },
  });
});
