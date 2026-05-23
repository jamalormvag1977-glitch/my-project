import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'upload');

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
  if (!fs.existsSync(UPLOAD_DIR)) return null;
  const files = fs.readdirSync(UPLOAD_DIR);
  // Prefer the main PPM file (not the soumissionnaire file)
  const xlsx = files.find(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.toLowerCase().includes('soumissionnaire'));
  return xlsx ? path.join(UPLOAD_DIR, xlsx) : null;
}

function findSoumissionnaireFile(): string | null {
  if (!fs.existsSync(UPLOAD_DIR)) return null;
  const files = fs.readdirSync(UPLOAD_DIR);
  const xlsx = files.find(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && f.toLowerCase().includes('soumissionnaire'));
  return xlsx ? path.join(UPLOAD_DIR, xlsx) : null;
}

function parseExcelFile(filePath: string) {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

  const projects: Array<{
    id: number; typeBudget: string; natureBudget: string; numAO: string | null;
    entite: string; objet: string; cp: number; ce: number; estimationAdmin: number | null;
    dateOuverture: string | null; situationAvancement: string; dateJugement: string | null;
    attributaire: string | null; montantExtrait: number | null; numMarche: string | null;
    montantEngagement: number | null; engagementCP: number | null; engagementCE: number | null;
    dateEngagement: string | null;
  }> = [];

  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[0]) continue;
    const id = Number(row[0]);
    if (isNaN(id) || id === 0) continue;

    projects.push({
      id,
      typeBudget: String(row[1] || ''),
      natureBudget: String(row[2] || ''),
      numAO: row[3] != null ? String(row[3]) : null,
      entite: String(row[4] || ''),
      objet: String(row[5] || ''),
      cp: formatNumber(row[6]) ?? 0,
      ce: formatNumber(row[7]) ?? 0,
      estimationAdmin: formatNumber(row[8]),
      dateOuverture: formatDate(row[9]),
      situationAvancement: String(row[10] || ''),
      dateJugement: formatDate(row[11]),
      attributaire: row[12] ? String(row[12]) : null,
      montantExtrait: formatNumber(row[13]),
      numMarche: row[14] ? String(row[14]) : null,
      montantEngagement: formatNumber(row[15]),
      engagementCP: formatNumber(row[16]),
      engagementCE: formatNumber(row[17]),
      dateEngagement: formatDate(row[18]),
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

/* ── GET: Load data ── */
export async function GET() {
  try {
    // First try: read directly from Excel files (works on Vercel)
    const excelResponse = buildResponseFromExcel();
    if (excelResponse) {
      return NextResponse.json(excelResponse);
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

    const analytics = computeAnalytics(projects);
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
    // Last resort: try Excel again even if there was a DB error
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
