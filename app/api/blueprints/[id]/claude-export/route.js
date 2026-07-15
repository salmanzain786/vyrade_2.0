import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { generateClaudePackage } from '../../../../../lib/services/blueprintService.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

function slug(s) {
  return String(s || 'automation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'automation';
}

// POST { part?: 'prompt' | 'zip', version?: number }
//  - part: 'prompt' → JSON { prompt, files: [...names] } for the Copy button
//  - otherwise → a ZIP download of the full Claude Code package
export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const body = await request.json().catch(() => ({}));
  const pkg = await generateClaudePackage({
    blueprintId: params.id,
    version: body.version ? Number(body.version) : null,
  });

  if (body.part === 'prompt') {
    return NextResponse.json({ prompt: pkg.prompt, files: Object.keys(pkg.files), mcpCount: pkg.mcpCount });
  }

  const zip = new JSZip();
  for (const [name, content] of Object.entries(pkg.files)) zip.file(name, content);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug(pkg.name)}-claude-package.zip"`,
      'Cache-Control': 'no-store',
    },
  });
});
