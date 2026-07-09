import { NextResponse } from 'next/server';
import { finalizeBlueprint } from '../../../../../lib/services/blueprintService.js';

export async function POST(request, { params }) {
  try {
    const { expected_version } = await request.json();
    if (expected_version === undefined) {
      return NextResponse.json({ error: 'expected_version is required' }, { status: 400 });
    }

    const result = await finalizeBlueprint({
      blueprintId: params.id,
      expectedVersion: Number(expected_version),
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
