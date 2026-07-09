import { NextResponse } from 'next/server';
import { generateWorkflow } from '../../../../../lib/services/blueprintService.js';

export async function POST(request, { params }) {
  try {
    const { version } = await request.json();
    const workflow = await generateWorkflow({
      blueprintId: params.id,
      version: Number(version),
    });
    return NextResponse.json({ workflow });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
