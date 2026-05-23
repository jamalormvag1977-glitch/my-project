import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'upload');
const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public', 'data');

// Check if DB (Prisma) is available
let _db: any = null;
let _dbAvailable: boolean | null = null;
async function getDb() {
  if (_dbAvailable === false) return null;
  if (_db) return _db;
  try {
    const { db } = await import('@/lib/db');
    _db = db;
    _dbAvailable = true;
    return db;
  } catch {
    _dbAvailable = false;
    return null;
  }
}

/* ── Helpers ──────────────────────────────────────────── */
function formatDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    try {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) {
        const mm = String(d.m).padStart(2, '0');
        const dd = String(d.d).padStart(2, '0');
        return `${d.y}-${mm}-${dd}`;
      }
    } catch { /* fallthrough */ }
  }
  return String(val);
}

function formatNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function getFileChecksum(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

function findExcelFile(): string | null {
  // Check public/data first (works on Vercel)
  if (fs.existsSync(PUBLIC_DATA_DIR)) {
    const files = fs.readdirSync(PUBLIC_DATA_DIR);
    const xlsx = files.find(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.toLowerCase().includes('soumissionnaire'));
    if (xlsx) return path.join(PUBLIC_DATA_DIR, xlsx);
  }
  // Then check upload dir (local dev)
  if (fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR);
    const xlsx = files.find(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.toLowerCase().includes('soumissionnaire'));
    if (xlsx) return path.join(UPLOAD_DIR, xlsx);
  }
  return null;
}

function findSoumissionnaireFile(): string | null {
  // Check public/data first (works on Vercel)
  if (fs.existsSync(PUBLIC_DATA_DIR)) {
    const files = fs.readdirSync(PUBLIC_DATA_DIR);
    const xlsx = files.find(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && f.toLowerCase().includes('soumissionnaire'));
    if (xlsx) return path.join(PUBLIC_DATA_DIR, xlsx);
  }
  // Then check upload dir (local dev)
  if (fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR);
    const xlsx = files.find(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && f.toLowerCase().includes('soumissionnaire'));
    if (xlsx) return path.join(UPLOAD_DIR, xlsx);
  }
  return null;
}

function parseExcelFile(filePath: string) {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

  const projects: Array<{
    id: number; typeBudget: string; natureBudget: string; numAO: string | null;
    sourceFinancement: string | null; programme: string | null; projet: string | null;
    entite: string; objet: string; cp: number; ce: number; estimationAdmin: number | null;
    dateOuverture: string | null; situationAvancement: string; dateJugement: string | null;
    attributaire: string | null; montantExtrait: number | null; numMarche: string | null;
    montantEngagement: number | null; engagementCP: number | null; engagementCE: number | null;
    dateEngagement: string | null; delaisExecution: string | null;
  }> = [];

  /*
   * Actual column layout in ppm.xlsx:
   *   0  Nombre d'AO (id)
   *   1  Type de budget
   *   2  Nature de budget
   *   3  Source de financement
   *   4  Programme
   *   5  Projet
   *   6  N° AO
   *   7  Entité
   *   8  Objet
   *   9  CP
   *  10  CE
   *  11  Estimation administrative
   *  12  Date d'ouverture des plis
   *  13  Situation avancement
   *  14  Date de jugement
   *  15  Attributaire
   *  16  Montant extrait
   *  17  N° marché
   *  18  Montant engagement
   *  19  Engagement CP
   *  20  Engagement CE
   *  21  Date d'engagement
   *  22  Délais d'exécution
   */

  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[0]) continue;
    const id = Number(row[0]);
    if (isNaN(id) || id === 0) continue;

    projects.push({
      id,
      typeBudget: String(row[1] || ''),
      natureBudget: String(row[2] || ''),
      sourceFinancement: row[3] != null ? String(row[3]) : null,
      programme: row[4] != null ? String(row[4]) : null,
      projet: row[5] != null ? String(row[5]) : null,
      numAO: row[6] != null ? String(row[6]) : null,
      entite: String(row[7] || ''),
      objet: String(row[8] || ''),
      cp: formatNumber(row[9]) ?? 0,
      ce: formatNumber(row[10]) ?? 0,
      estimationAdmin: formatNumber(row[11]),
      dateOuverture: formatDate(row[12]),
      situationAvancement: String(row[13] || ''),
      dateJugement: formatDate(row[14]),
      attributaire: row[15] ? String(row[15]) : null,
      montantExtrait: formatNumber(row[16]),
      numMarche: row[17] ? String(row[17]) : null,
      montantEngagement: formatNumber(row[18]),
      engagementCP: formatNumber(row[19]),
      engagementCE: formatNumber(row[20]),
      dateEngagement: formatDate(row[21]),
      delaisExecution: row[22] ? String(row[22]) : null,
    });
  }
  return projects;
}

function parseSoumissionnaireFile(filePath: string) {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 2 });

  const soumissionnaires: Array<{
    id: number; numAO: string; entite: string; numAOComplet: string;
    semaine: string | null; seance: string | null; objetAO: string | null;
    objetSeance: string | null; nbSoumissionnaires: number | null;
    nomSoumissionnaire: string | null; decision: string | null;
    offreFinanciere: string | null; decisionOF: string | null;
  }> = [];

  rows.forEach((row, idx) => {
    const numAOComplet = row[2] ? String(row[2]).trim() : null;
    if (!numAOComplet) return;

    const parts = numAOComplet.split('/');
    const numAO = parts.length === 3 ? parts[0].trim() : numAOComplet;
    const entite = parts.length === 3 ? parts[2].trim() : '';

    soumissionnaires.push({
      id: idx + 1,
      numAO,
      entite,
      numAOComplet,
      semaine: row[0] ? String(row[0]).trim() : null,
      seance: row[1] ? String(row[1]).trim() : null,
      objetAO: row[3] ? String(row[3]).trim() : null,
      objetSeance: row[4] ? String(row[4]).trim() : null,
      nbSoumissionnaires: row[6] ? parseInt(String(row[6]).trim()) : null,
      nomSoumissionnaire: row[7] ? String(row[7]).trim() : null,
      decision: row[8] ? String(row[8]).trim() : null,
      offreFinanciere: row[9] ? String(row[9]).trim() : null,
      decisionOF: row[10] ? String(row[10]).trim() : null,
    });
  });

  return soumissionnaires;
}

/* ── Compute analytics from projects ── */
function computeAnalytics(projects: Array<{
  id: number; typeBudget: string; natureBudget: string; entite: string;
  cp: number; ce: number; estimationAdmin: number | null; dateOuverture: string | null;
  situationAvancement: string; montantExtrait: number | null; montantEngagement: number | null;
}>) {
  const totalProjects = projects.length;
  const totalCP = projects.reduce((s, p) => s + (p.cp || 0), 0);
  const totalCE = projects.reduce((s, p) => s + (p.ce || 0), 0);
  const totalEstimation = projects.reduce((s, p) => s + (p.estimationAdmin || 0), 0);
  const totalEngagement = projects.reduce((s, p) => s + (p.montantEngagement || 0), 0);
  const totalMontantExtrait = projects.reduce((s, p) => s + (p.montantExtrait || 0), 0);

  const statusCount: Record<string, number> = {};
  projects.forEach(p => { statusCount[p.situationAvancement] = (statusCount[p.situationAvancement] || 0) + 1; });

  const entityBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  projects.forEach(p => {
    if (!entityBudget[p.entite]) entityBudget[p.entite] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    entityBudget[p.entite].cp += p.cp || 0;
    entityBudget[p.entite].ce += p.ce || 0;
    entityBudget[p.entite].estimation += p.estimationAdmin || 0;
    entityBudget[p.entite].engagement += p.montantEngagement || 0;
    entityBudget[p.entite].count += 1;
  });

  const natureBudget: Record<string, { cp: number; ce: number; count: number }> = {};
  projects.forEach(p => {
    if (!natureBudget[p.natureBudget]) natureBudget[p.natureBudget] = { cp: 0, ce: 0, count: 0 };
    natureBudget[p.natureBudget].cp += p.cp || 0;
    natureBudget[p.natureBudget].ce += p.ce || 0;
    natureBudget[p.natureBudget].count += 1;
  });

  const typeBudget: Record<string, { cp: number; ce: number; count: number }> = {};
  projects.forEach(p => {
    if (!typeBudget[p.typeBudget]) typeBudget[p.typeBudget] = { cp: 0, ce: 0, count: 0 };
    typeBudget[p.typeBudget].cp += p.cp || 0;
    typeBudget[p.typeBudget].ce += p.ce || 0;
    typeBudget[p.typeBudget].count += 1;
  });

  const monthlyTimeline: Record<string, { count: number; estimation: number; engagement: number }> = {};
  projects.forEach(p => {
    if (p.dateOuverture) {
      const month = p.dateOuverture.substring(0, 7);
      if (!monthlyTimeline[month]) monthlyTimeline[month] = { count: 0, estimation: 0, engagement: 0 };
      monthlyTimeline[month].count += 1;
      monthlyTimeline[month].estimation += p.estimationAdmin || 0;
      monthlyTimeline[month].engagement += p.montantEngagement || 0;
    }
  });

  const entityEngagementRate: Record<string, number> = {};
  Object.entries(entityBudget).forEach(([entity, data]) => {
    entityEngagementRate[entity] = data.estimation > 0 ? Math.round((data.engagement / data.estimation) * 100) : 0;
  });

  return {
    kpis: {
      totalProjects, totalCP, totalCE,
      totalBudget: totalCP + totalCE,
      totalEstimation, totalEngagement, totalMontantExtrait,
      engagementRate: totalEstimation > 0 ? Math.round((totalEngagement / totalEstimation) * 100 * 10) / 10 : 0,
      extractionRate: totalEstimation > 0 ? Math.round((totalMontantExtrait / totalEstimation) * 100 * 10) / 10 : 0,
    },
    statusCount, entityBudget, natureBudget, typeBudget, monthlyTimeline, entityEngagementRate,
  };
}

/* ── Build response from Excel files (no DB needed) ── */
function buildResponseFromExcel() {
  const filePath = findExcelFile();
  if (!filePath) return null;

  const projects = parseExcelFile(filePath);
  const analytics = computeAnalytics(projects);
  const checksum = getFileChecksum(filePath);
  const fileName = path.basename(filePath);
  const fileStats = fs.statSync(filePath);

  // Parse soumissionnaire file
  const soumFilePath = findSoumissionnaireFile();
  const soumissionnaires = soumFilePath ? parseSoumissionnaireFile(soumFilePath) : [];

  return {
    lastUpdated: new Date().toISOString(),
    fileChecksum: checksum,
    fileName,
    fileLastModified: fileStats.mtime.toISOString(),
    fileSize: fileStats.size,
    dataSaved: true,
    projects,
    soumissionnaires,
    ...analytics,
  };
}

/* ── Try reading static JSON (pre-built, works on Vercel) ── */
function readStaticJson(): PPMResponse | null {
  const jsonPath = path.join(process.cwd(), 'public', 'data', 'ppm.json');
  try {
    if (fs.existsSync(jsonPath)) {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      if (data.projects && data.projects.length > 0) {
        data.lastUpdated = new Date().toISOString();
        return data;
      }
    }
  } catch { /* ignore */ }
  return null;
}

type PPMResponse = {
  lastUpdated: string; fileChecksum?: string; fileName?: string;
  fileLastModified?: string; fileSize?: number; dataSaved?: boolean;
  projects: unknown[]; soumissionnaires: unknown[];
  kpis: unknown; statusCount: unknown; entityBudget: unknown;
  natureBudget: unknown; typeBudget: unknown; monthlyTimeline: unknown;
  entityEngagementRate: unknown;
};

/* ── GET: Load data ── */
export async function GET() {
  try {
    // First try: read directly from Excel files (works locally and on Vercel if files are accessible)
    const excelResponse = buildResponseFromExcel();
    if (excelResponse) {
      return NextResponse.json(excelResponse);
    }

    // Second try: read from pre-built static JSON (works on Vercel where fs may not find public/)
    const staticResponse = readStaticJson();
    if (staticResponse) {
      return NextResponse.json(staticResponse);
    }

    // Fallback: try loading from DB
    const db = await getDb();
    if (!db) {
      return NextResponse.json({ error: 'Aucune donnée disponible. Veuillez uploader un fichier Excel.', noFile: true }, { status: 404 });
    }

    const meta = await db.fileMetadata.findFirst({ orderBy: { lastSyncAt: 'desc' } });
    const projects = await db.pPMProject.findMany({ orderBy: { id: 'asc' } });

    if (projects.length === 0) {
      return NextResponse.json({ error: 'Aucune donnée sauvegardée. Veuillez uploader un fichier Excel.', noFile: true }, { status: 404 });
    }

    const analytics = computeAnalytics(projects as any);
    const soumissionnaires = await db.soumissionnaire.findMany({ orderBy: [{ numAOComplet: 'asc' }, { id: 'asc' }] });
    return NextResponse.json({
      lastUpdated: meta?.lastSyncAt.toISOString() || new Date().toISOString(),
      fileChecksum: meta?.fileChecksum,
      fileName: meta?.fileName,
      fileLastModified: meta?.fileLastModified.toISOString(),
      fileSize: meta?.fileSize,
      dataSaved: true,
      projects,
      soumissionnaires,
      ...analytics,
    });
  } catch (error) {
    console.error('Error loading data:', error);
    // Last resort: try static JSON
    try {
      const staticResponse = readStaticJson();
      if (staticResponse) return NextResponse.json(staticResponse);
    } catch { /* ignore */ }
    // Then try Excel again
    try {
      const excelResponse = buildResponseFromExcel();
      if (excelResponse) return NextResponse.json(excelResponse);
    } catch { /* ignore */ }
    return NextResponse.json({ error: 'Erreur de chargement des données' }, { status: 500 });
  }
}

/* ── POST: Upload new Excel file ── */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });

    const validExtensions = ['.xlsx', '.xls'];
    const fileExt = path.extname(file.name).toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      return NextResponse.json({ error: 'Format non supporté. Utilisez .xlsx ou .xls' }, { status: 400 });
    }

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    // Save file
    const filePath = path.join(UPLOAD_DIR, file.name);
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(bytes));

    // Build response from Excel
    const excelResponse = buildResponseFromExcel();
    if (excelResponse) {
      // Also try to sync to DB if available
      const db = await getDb();
      if (db) {
        try {
          const projects = parseExcelFile(filePath);
          const checksum = getFileChecksum(filePath);
          await db.$transaction(async (tx: any) => {
            await tx.pPMProject.deleteMany();
            await tx.fileMetadata.deleteMany();
            await tx.fileMetadata.create({
              data: { fileName: file.name, fileChecksum: checksum, fileSize: Buffer.from(bytes).length, fileLastModified: new Date() },
            });
            for (const p of projects) {
              await tx.pPMProject.create({ data: p });
            }
          });
        } catch (dbErr) {
          console.error('DB sync failed (non-critical):', dbErr);
        }
      }
      return NextResponse.json({
        ...excelResponse,
        uploadSuccess: true,
        message: `Fichier "${file.name}" sauvegardé avec succès`,
      });
    }

    return NextResponse.json({ error: 'Erreur lors du traitement du fichier' }, { status: 500 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Erreur lors du chargement du fichier' }, { status: 500 });
  }
}

/* ── PUT: Check if file changed ── */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const clientChecksum = body.checksum as string | undefined;
    const filePath = findExcelFile();

    if (filePath) {
      const currentChecksum = getFileChecksum(filePath);
      const fileStats = fs.statSync(filePath);
      const changed = !clientChecksum || clientChecksum !== currentChecksum;
      return NextResponse.json({
        changed,
        checksum: currentChecksum,
        fileName: path.basename(filePath),
        fileLastModified: fileStats.mtime.toISOString(),
      });
    }

    // No Excel: check DB
    const db = await getDb();
    if (!db) return NextResponse.json({ changed: true, noFile: true });

    const meta = await db.fileMetadata.findFirst({ orderBy: { lastSyncAt: 'desc' } });
    if (!meta) return NextResponse.json({ changed: true, noFile: true });
    return NextResponse.json({
      changed: clientChecksum !== meta.fileChecksum,
      checksum: meta.fileChecksum,
      fileName: meta.fileName,
      fileLastModified: meta.fileLastModified.toISOString(),
    });
  } catch (error) {
    console.error('Error checking file:', error);
    return NextResponse.json({ error: 'Erreur de vérification' }, { status: 500 });
  }
}
