import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = ['CPS', 'RC', 'PV_OUVERTURE', 'PV_JUGEMENT', 'EXTRAIT_MARCHE', 'AUTRE'] as const;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function safeSegment(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'document';
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Droits administrateur requis pour déposer un document.' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!clientPayload) throw new Error('Informations du document manquantes.');
        let metadata: { year?: number; aoId?: string; category?: string; fileName?: string };
        try { metadata = JSON.parse(clientPayload); }
        catch { throw new Error('Métadonnées du document invalides.'); }

        const year = Number(metadata.year);
        const aoId = String(metadata.aoId || '').trim();
        const category = String(metadata.category || '');
        const fileName = String(metadata.fileName || '');
        if (!Number.isInteger(year) || year < 2020 || year > 2100 || !aoId || !TYPES.includes(category as any)) {
          throw new Error('Exercice, appel d’offres ou catégorie invalide.');
        }
        if (!fileName.toLowerCase().endsWith('.pdf')) throw new Error('Seuls les fichiers PDF sont acceptés.');

        const expectedPrefix = `ged/${year}/${safeSegment(aoId)}/${category}/`;
        if (!pathname.startsWith(expectedPrefix) || pathname.includes('..')) {
          throw new Error('Chemin de classement GED invalide.');
        }

        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ year, aoId: safeSegment(aoId), category, fileName }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // The Blob SDK verifies the completion callback. The document is discoverable
        // from its private Blob pathname; no public URL is stored or exposed.
        console.info('GED PDF uploaded', { pathname: blob.pathname, tokenPayload });
      },
    });
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GED client upload token error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Autorisation de dépôt impossible.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
