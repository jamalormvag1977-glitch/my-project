import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { get } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  const pathname = request.nextUrl.searchParams.get('pathname') || '';
  if (!/^ged\/\d{4}\/[a-zA-Z0-9_-]+\/[A-Z_]+\//.test(pathname)) {
    return NextResponse.json({ error: 'Document invalide.' }, { status: 400 });
  }
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return new NextResponse('Document introuvable.', { status: 404 });
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('GED file read error', e);
    return new NextResponse('Stockage GED privé indisponible.', { status: 503 });
  }
}
