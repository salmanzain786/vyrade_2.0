import { NextResponse } from 'next/server';
import { getVersion } from '../../../../../../lib/services/blueprintRepository.js';

export async function GET(request, { params }) {
  try {
    const bp = await getVersion(params.id, Number(params.version));
    if (!bp) return NextResponse.json({ error: 'Blueprint version not found' }, { status: 404 });
    return NextResponse.json(bp);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
