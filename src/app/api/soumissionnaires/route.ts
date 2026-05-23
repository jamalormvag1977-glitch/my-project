import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * API /api/soumissionnaires
 * GET: Retourne les données des soumissionnaires.
 * POST: Upload un nouveau fichier Excel soumissionnaires.
 * 
 * Query params (GET):
 *   - numAO: filtrer par numéro d'AO (ex: "1")
 *   - entite: filtrer par entité (ex: "DPF")
 *   - key: filtrer par clé combinée (ex: "1/DPF")
 */

function parseNumAO(numAO: string) {
  if (!numAO) return { num: '', entite: '' };
  const parts = String(numAO).split('/');
  return { num: parts[0] || '', entite: parts[parts.length - 1] || '' };
}

function processExcelData(rows: any[][]) {
  const projets: Record<string, any> = {};

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[2]) continue;

    const numAOComplet = String(row[2]).trim();
    const parsed = parseNumAO(numAOComplet);
    const key = parsed.num + '/' + parsed.entite;

    if (!projets[key]) {
      projets[key] = {
        numAO: parsed.num,
        entite: parsed.entite,
        numAOComplet,
        objetAO: row[3] || '',
        nbSoumissionnaires: row[6] || 0,
        soumissionnaires: []
      };
    }

    if (row[6] && Number(row[6]) > 0) {
      projets[key].nbSoumissionnaires = Number(row[6]);
    }

    projets[key].soumissionnaires.push({
      semaine: row[0] || '',
      seance: row[1] || '',
      objetSeance: row[4] || '',
      president: row[5] || '',
      nom: row[7] && row[7] !== '-' ? String(row[7]).trim() : null,
      decisionCommission: row[8] || '',
      offreFinanciere: row[9] && row[9] !== '-' ? String(row[9]).trim() : null,
      decisionCommissionOF: row[10] || ''
    });
  }

  // Calculate unique soumissionnaires per project
  let totalSoumissionnaires = 0;
  Object.values(projets).forEach((p: any) => {
    const uniqueSoums = new Set(
      p.soumissionnaires.filter((s: any) => s.nom).map((s: any) => s.nom)
    );
    p.nbSoumissionnairesUniques = uniqueSoums.size;
    totalSoumissionnaires += uniqueSoums.size;
  });

  return { projets, totalProjets: Object.keys(projets).length, totalSoumissionnaires };
}

function readFromExcel(): Record<string, any> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const excelPath = path.join(process.cwd(), 'public', 'data', 'soumissionnaires.xlsx');

    if (!fs.existsSync(excelPath)) return null;

    const wb = XLSX.readFile(excelPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const { projets } = processExcelData(rows);
    return projets;
  } catch (e: any) {
    console.error('Excel read error:', e.message);
    return null;
  }
}

function readFromStaticJson(): Record<string, any> | null {
  try {
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'soumissionnaires.json');
    if (!fs.existsSync(jsonPath)) return null;
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return data.projets || null;
  } catch (e: any) {
    console.error('JSON read error:', e.message);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const numAO = searchParams.get('numAO');
  const entite = searchParams.get('entite');
  const key = searchParams.get('key');

  let projets = readFromExcel();

  if (!projets) {
    projets = readFromStaticJson();
  }

  if (!projets) {
    return NextResponse.json(
      { error: 'Aucune donnée soumissionnaire disponible' },
      { status: 404 }
    );
  }

  if (key) {
    const projet = projets[key] || null;
    return NextResponse.json({
      totalProjets: projet ? 1 : 0,
      projets: projet ? { [key]: projet } : {}
    });
  }

  if (numAO || entite) {
    const filtered: Record<string, any> = {};
    Object.entries(projets).forEach(([k, p]: [string, any]) => {
      const match = (!numAO || p.numAO === numAO) && (!entite || p.entite === entite);
      if (match) filtered[k] = p;
    });
    return NextResponse.json({
      totalProjets: Object.keys(filtered).length,
      projets: filtered
    });
  }

  return NextResponse.json({
    totalProjets: Object.keys(projets).length,
    projets
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    // Validate file extension
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      return NextResponse.json({ error: 'Format non supporté. Utilisez .xlsx ou .xls' }, { status: 400 });
    }

    // Read the uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Process the data
    const { projets, totalProjets, totalSoumissionnaires } = processExcelData(rows);

    // Save the Excel file to public/data/
    const excelPath = path.join(process.cwd(), 'public', 'data', 'soumissionnaires.xlsx');
    fs.writeFileSync(excelPath, buffer);

    // Also regenerate the static JSON
    const jsonData = {
      lastUpdated: new Date().toISOString(),
      fileName: file.name,
      totalProjets,
      totalSoumissionnaires,
      projets
    };
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'soumissionnaires.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');

    return NextResponse.json({
      success: true,
      message: `Fichier "${file.name}" traité avec succès : ${totalProjets} AO, ${totalSoumissionnaires} soumissionnaires`,
      totalProjets,
      totalSoumissionnaires
    });
  } catch (e: any) {
    console.error('Upload soumissionnaire error:', e.message);
    return NextResponse.json(
      { error: 'Erreur lors du traitement du fichier : ' + e.message },
      { status: 500 }
    );
  }
}
