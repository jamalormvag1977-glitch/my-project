import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { put, list, del } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SoumissionnaireRow = {
  semaine: string;
  seance: string;
  objetSeance: string;
  president: string;
  nom: string | null;
  decisionCommission: string;
  offreFinanciere: string | null;
  decisionCommissionOF: string;
};

type Projet = {
  numAO: string;
  entite: string;
  numAOComplet: string;
  objetAO: string;
  nbSoumissionnaires: number;
  nbSoumissionnairesUniques: number;
  soumissionnaires: SoumissionnaireRow[];
};

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

function clean(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeHeader(value: unknown): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseNumAO(value: unknown) {
  const complete = clean(value).replace(/\s*\/\s*/g, '/');
  if (!complete) return { num: '', entite: '', complete: '' };
  const parts = complete.split('/');
  return {
    num: (parts[0] || '').trim(),
    entite: (parts[parts.length - 1] || '').trim(),
    complete,
  };
}

// Repère les colonnes par leurs intitulés. Le classeur conserve ainsi sa
// compatibilité même si des colonnes sont déplacées dans Excel.
function findHeader(rows: any[][]) {
  const aliases: Record<string, string[]> = {
    semaine: ['semaine'],
    seance: ['seance'],
    numAO: ['nao', 'numeroao', 'numao'],
    objetAO: ['objetao'],
    objetSeance: ['objetdelaseance', 'objetseance'],
    president: ['president'],
    nbSoumissionnaires: ['nbsoumissionnaires', 'nbsoumissionnaire'],
    nom: ['soumissionnaire', 'nomsoumissionnaire'],
    decision: ['decisioncommission', 'decision'],
    offre: ['offrefinanciereproposee', 'offrefinanciere'],
    decisionOF: ['decisioncommissionof', 'decisionof'],
  };

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex++) {
    const normalized = (rows[rowIndex] || []).map(normalizeHeader);
    const indexes: Record<string, number> = {};
    for (const [field, candidates] of Object.entries(aliases)) {
      const index = normalized.findIndex((cell) => candidates.includes(cell));
      if (index >= 0) indexes[field] = index;
    }
    if (indexes.numAO !== undefined && (indexes.nom !== undefined || indexes.objetAO !== undefined)) {
      return { rowIndex, indexes };
    }
  }

  // Compatibilité avec le modèle historique : titre en première ligne,
  // en-têtes en deuxième ligne, 11 colonnes dans l'ordre initial.
  return {
    rowIndex: 1,
    indexes: {
      semaine: 0, seance: 1, numAO: 2, objetAO: 3, objetSeance: 4,
      president: 5, nbSoumissionnaires: 6, nom: 7, decision: 8,
      offre: 9, decisionOF: 10,
    } as Record<string, number>,
  };
}

function processExcelData(rows: any[][]) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('Le classeur est vide ou ne contient pas de tableau exploitable.');
  }

  const { rowIndex, indexes } = findHeader(rows);
  const value = (row: any[], field: string) => {
    const index = indexes[field];
    return index === undefined ? '' : clean(row?.[index]);
  };

  const projets: Record<string, Projet> = {};
  let totalLignes = 0;

  for (let i = rowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const ao = parseNumAO(value(row, 'numAO'));
    if (!ao.complete || !ao.num || !ao.entite) continue;

    totalLignes++;
    const key = `${ao.num}/${ao.entite}`;
    if (!projets[key]) {
      projets[key] = {
        numAO: ao.num,
        entite: ao.entite,
        numAOComplet: ao.complete,
        objetAO: value(row, 'objetAO'),
        nbSoumissionnaires: 0,
        nbSoumissionnairesUniques: 0,
        soumissionnaires: [],
      };
    }

    const count = Number(value(row, 'nbSoumissionnaires').replace(',', '.'));
    if (Number.isFinite(count) && count > 0) projets[key].nbSoumissionnaires = count;

    const nom = value(row, 'nom');
    const offre = value(row, 'offre');
    projets[key].soumissionnaires.push({
      semaine: value(row, 'semaine'),
      seance: value(row, 'seance'),
      objetSeance: value(row, 'objetSeance'),
      president: value(row, 'president'),
      nom: nom && nom !== '-' ? nom : null,
      decisionCommission: value(row, 'decision'),
      offreFinanciere: offre && offre !== '-' ? offre : null,
      decisionCommissionOF: value(row, 'decisionOF'),
    });
  }

  if (totalLignes === 0) {
    throw new Error('Aucun numéro d’AO valide trouvé. Vérifiez la colonne « N° AO » et la feuille Excel.');
  }

  let totalSoumissionnaires = 0;
  for (const projet of Object.values(projets)) {
    const uniques = new Set(
      projet.soumissionnaires
        .map((item) => item.nom?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim())
        .filter((name): name is string => Boolean(name))
    );
    projet.nbSoumissionnairesUniques = uniques.size;
    totalSoumissionnaires += uniques.size;
  }

  return {
    projets,
    totalProjets: Object.keys(projets).length,
    totalSoumissionnaires,
    totalLignes,
  };
}

function readLocalData() {
  try {
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'soumissionnaires.json');
    if (!fs.existsSync(jsonPath)) return null;
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    console.error('Soumissionnaire JSON read error:', error);
    return null;
  }
}


const validYear = (value: unknown) => { const year = Number(value); return Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : 2027; };
const storePath = (year: number) => `soumissionnaires-manual-${year}.json`;
async function readManual(year: number) {
  const pathname = storePath(year);
  const blobs = await list({ prefix: pathname });
  const blob = blobs.blobs.find((item) => item.pathname === pathname);
  if (!blob) return { projets: {} as Record<string, Projet>, lastUpdated: null as string | null };
  const response = await fetch(blob.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Lecture du registre impossible');
  const saved = await response.json();
  return { projets: (saved.projets || {}) as Record<string, Projet>, lastUpdated: saved.lastUpdated || blob.uploadedAt };
}
function summarize(projets: Record<string, Projet>) {
  let totalSoumissionnaires = 0;
  for (const projet of Object.values(projets)) {
    const names = new Set(projet.soumissionnaires.map((item) => item.nom?.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim()).filter(Boolean));
    projet.nbSoumissionnairesUniques = names.size;
    totalSoumissionnaires += names.size;
    projet.nbSoumissionnaires = Math.max(projet.nbSoumissionnaires || 0, names.size);
  }
  return { projets, totalProjets: Object.keys(projets).length, totalSoumissionnaires };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const numAO = searchParams.get('numAO');
  const entite = searchParams.get('entite');
  const key = searchParams.get('key');
  const year = validYear(searchParams.get('year'));
  let data: any = null;

  if (year !== 2026) {
    try {
      const saved = await readManual(year);
      const summary = summarize(saved.projets);
      let projets = summary.projets;
      if (key) projets = projets[key] ? { [key]: projets[key] } : {};
      else if (numAO || entite) projets = Object.fromEntries(Object.entries(projets).filter(([, p]) => (!numAO || p.numAO === numAO) && (!entite || p.entite === entite)));
      return NextResponse.json({ year, lastUpdated: saved.lastUpdated, fileName: `Saisie directe ${year}`, ...summary, projets }, { headers: noStoreHeaders });
    } catch (error) {
      return NextResponse.json({ error: 'Impossible de lire le registre des soumissionnaires.' }, { status: 500, headers: noStoreHeaders });
    }
  }

  // La version Excel persistée dans Blob est prioritaire.
  try {
    const blobs = await list({ prefix: 'soumissionnaires-' });
    const latest = blobs.blobs
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];

    if (latest) {
      const response = await fetch(latest.url, { cache: 'no-store' });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        data = {
          ...processExcelData(rows),
          lastUpdated: latest.uploadedAt,
          fileName: latest.pathname,
        };
      }
    }
  } catch (error) {
    console.error('Vercel Blob soumissionnaire read failed:', error);
  }

  if (!data) data = readLocalData();
  if (!data?.projets) {
    return NextResponse.json(
      { error: 'Aucune donnée soumissionnaire disponible' },
      { status: 404, headers: noStoreHeaders }
    );
  }

  let projets: Record<string, Projet> = data.projets;
  if (key) {
    const projet = projets[key] || null;
    projets = projet ? { [key]: projet } : {};
  } else if (numAO || entite) {
    projets = Object.fromEntries(
      Object.entries(projets).filter(([, projet]) =>
        (!numAO || projet.numAO === numAO) && (!entite || projet.entite === entite)
      )
    );
  }

  return NextResponse.json({
    lastUpdated: data.lastUpdated || null,
    fileName: data.fileName || 'soumissionnaires.xlsx',
    totalProjets: Object.keys(projets).length,
    totalSoumissionnaires: key || numAO || entite
      ? Object.values(projets).reduce((sum, projet) => sum + (projet.nbSoumissionnairesUniques || 0), 0)
      : (data.totalSoumissionnaires ?? 0),
    projets,
  }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401, headers: noStoreHeaders });
    if ((session.user as any)?.role !== 'admin') return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403, headers: noStoreHeaders });

    if ((request.headers.get('content-type') || '').includes('application/json')) {
      const body = await request.json();
      const year = validYear(body.year);
      if (year === 2026) return NextResponse.json({ error: 'La saisie directe est activée pour 2027 et les exercices suivants. Le registre Excel 2026 est conservé.' }, { status: 400, headers: noStoreHeaders });
      const saved = await readManual(year);
      const projets = saved.projets;
      const action = body.action || 'save';
      const key = clean(body.key || `${body.projet?.numAO || ''}/${body.projet?.entite || ''}`);
      if (action === 'delete') {
        if (!key || !projets[key]) return NextResponse.json({ error: 'AO introuvable.' }, { status: 404, headers: noStoreHeaders });
        delete projets[key];
      } else {
        const raw = body.projet || {};
        const ao = parseNumAO(raw.numAOComplet || `${raw.numAO || ''}/${raw.entite || ''}`);
        if (!ao.num || !ao.entite) return NextResponse.json({ error: 'Le numéro AO et l’entité sont obligatoires.' }, { status: 400, headers: noStoreHeaders });
        const projectKey = `${ao.num}/${ao.entite}`;
        const rows = Array.isArray(raw.soumissionnaires) ? raw.soumissionnaires : [];
        const previous = projets[projectKey];
        projets[projectKey] = {
          numAO: ao.num, entite: ao.entite, numAOComplet: ao.complete,
          objetAO: clean(raw.objetAO), nbSoumissionnaires: Number(raw.nbSoumissionnaires) || rows.length,
          nbSoumissionnairesUniques: 0,
          soumissionnaires: rows.map((item: any) => ({
            semaine: clean(item.semaine), seance: clean(item.seance), objetSeance: clean(item.objetSeance),
            president: clean(item.president), nom: clean(item.nom) || null,
            decisionCommission: clean(item.decisionCommission), offreFinanciere: clean(item.offreFinanciere) || null,
            decisionCommissionOF: clean(item.decisionCommissionOF),
          })),
        };
        if (action === 'update' && !previous) return NextResponse.json({ error: 'AO introuvable pour modification.' }, { status: 404, headers: noStoreHeaders });
      }
      const summary = summarize(projets);
      const updatedAt = new Date().toISOString();
      await put(storePath(year), JSON.stringify({ ...summary, lastUpdated: updatedAt }), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
      return NextResponse.json({ success: true, year, lastUpdated: updatedAt, message: 'Registre des soumissionnaires enregistré.', ...summary }, { headers: noStoreHeaders });
    }
    if (!session) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401, headers: noStoreHeaders });
    }
    if ((session.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403, headers: noStoreHeaders });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400, headers: noStoreHeaders });
    }

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      return NextResponse.json({ error: 'Format non supporté. Utilisez .xlsx ou .xls' }, { status: 400, headers: noStoreHeaders });
    }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier vide ou supérieur à 20 Mo.' }, { status: 400, headers: noStoreHeaders });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames?.length) throw new Error('Le fichier ne contient aucune feuille Excel.');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const parsed = processExcelData(rows);

    // IMPORTANT : enregistrer et valider le nouveau Blob AVANT de supprimer
    // les anciennes versions. Une erreur conserve donc le dernier fichier valide.
    let blobUrl = '';
    try {
      const uploaded = await put(`soumissionnaires-${Date.now()}-${file.name}`, file, {
        access: 'public',
        addRandomSuffix: true,
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      blobUrl = uploaded.url;

      const oldBlobs = await list({ prefix: 'soumissionnaires-' });
      await Promise.all(
        oldBlobs.blobs
          .filter((blob) => blob.url !== uploaded.url)
          .map((blob) => del(blob.url).catch((error) => {
            console.warn('Old soumissionnaire Blob cleanup failed:', error);
          }))
      );
    } catch (blobError) {
      console.error('Vercel Blob upload failed:', blobError);
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({
          error: 'Le fichier a été analysé, mais sa sauvegarde permanente a échoué. Les anciennes données ont été conservées. Vérifiez la configuration Vercel Blob puis réessayez.',
        }, { status: 503, headers: noStoreHeaders });
      }

      const excelPath = path.join(process.cwd(), 'public', 'data', 'soumissionnaires.xlsx');
      const jsonPath = path.join(process.cwd(), 'public', 'data', 'soumissionnaires.json');
      fs.writeFileSync(excelPath, buffer);
      fs.writeFileSync(jsonPath, JSON.stringify({
        ...parsed, lastUpdated: new Date().toISOString(), fileName: file.name,
      }, null, 2), 'utf8');
    }

    return NextResponse.json({
      success: true,
      uploadSuccess: true,
      blobUrl,
      message: `Fichier "${file.name}" enregistré : ${parsed.totalProjets} AO, ${parsed.totalSoumissionnaires} soumissionnaires uniques (${parsed.totalLignes} lignes analysées).`,
      ...parsed,
      lastUpdated: new Date().toISOString(),
      fileName: file.name,
    }, { headers: noStoreHeaders });
  } catch (error: any) {
    console.error('Upload soumissionnaire error:', error);
    return NextResponse.json(
      { error: 'Erreur lors du traitement du fichier : ' + (error?.message || 'erreur inconnue') },
      { status: 400, headers: noStoreHeaders }
    );
  }
}
