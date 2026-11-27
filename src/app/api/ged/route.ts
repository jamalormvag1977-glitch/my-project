import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { put, list, del } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = ['CPS', 'RC', 'PV_OUVERTURE', 'PV_JUGEMENT', 'EXTRAIT_MARCHE', 'AUTRE'] as const;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

async function sessionUser() {
  return getServerSession(authOptions);
}
function validYear(v: string | null) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}
function safeSegment(v: string) {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'document';
}
function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const session = await sessionUser();
  if (!session?.user) return error('Authentification requise.', 401);
  const year = validYear(request.nextUrl.searchParams.get('year'));
  if (!year) return error('Exercice invalide.');
  const aoId = request.nextUrl.searchParams.get('aoId');
  try {
    const prefix = aoId
      ? `ged/${year}/${safeSegment(aoId)}/`
      : `ged/${year}/`;
    const result = await list({ prefix, access: 'private', limit: 1000 });
    const documents = result.blobs.map(blob => {
      const parts = blob.pathname.split('/');
      return {
        pathname: blob.pathname,
        aoId: parts[2] || '',
        category: parts[3] || 'AUTRE',
        fileName: decodeURIComponent(parts.slice(4).join('/').replace(/^\d+-/, '')) || blob.pathname.split('/').pop(),
        size: blob.size,
        uploadedAt: blob.uploadedAt,
      };
    }).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GED list error', e);
    return error('Stockage GED privé indisponible. Vérifiez le Blob Store privé Vercel et son jeton.', 503);
  }
}

export async function POST(request: NextRequest) {
  const session = await sessionUser();
  if (!session?.user) return error('Authentification requise.', 401);
  if ((session.user as any).role !== 'admin') return error('Droits administrateur requis pour déposer un document.', 403);
  try {
    const form = await request.formData();
    const file = form.get('file');
    const year = validYear(String(form.get('year') || ''));
    const aoId = String(form.get('aoId') || '').trim();
    const category = String(form.get('category') || 'AUTRE');
    if (!(file instanceof File)) return error('Sélectionnez un fichier PDF.');
    if (!year || !aoId || !TYPES.includes(category as any)) return error('Exercice, AO ou catégorie invalide.');
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) return error('Seuls les fichiers PDF sont acceptés.');
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return error('Le PDF doit peser entre 1 octet et 25 Mo.');
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(bytes) !== '%PDF-') return error('Le fichier ne semble pas être un PDF valide.');
    const fileName = safeSegment(file.name.replace(/\.pdf$/i, '')) + '.pdf';
    const pathname = `ged/${year}/${safeSegment(aoId)}/${category}/${Date.now()}-${fileName}`;
    const blob = await put(pathname, file, {
      access: 'private',
      addRandomSuffix: true,
      contentType: 'application/pdf',
      allowOverwrite: false,
    });
    return NextResponse.json({
      success: true,
      document: { pathname: blob.pathname, aoId, category, fileName: file.name, size: blob.size, uploadedAt: new Date().toISOString() },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GED upload error', e);
    return error('Dépôt impossible. Vérifiez que le Blob Store Vercel est configuré en mode privé.', 503);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await sessionUser();
  if (!session?.user) return error('Authentification requise.', 401);
  if ((session.user as any).role !== 'admin') return error('Droits administrateur requis.', 403);
  const pathname = request.nextUrl.searchParams.get('pathname') || '';
  if (!/^ged\/\d{4}\/[a-zA-Z0-9_-]+\/[A-Z_]+\//.test(pathname)) return error('Document invalide.');
  try {
    await del(pathname, { access: 'private' });
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GED delete error', e);
    return error('Suppression impossible.', 500);
  }
}
