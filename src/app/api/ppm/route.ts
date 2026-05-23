import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '@/lib/db';

const UPLOAD_DIR = path.join(process.cwd(), 'upload');

/* ── Helpers ──────────────────────────────────────────── */
function formatDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  // Handle Excel serial date numbers (e.g., 46037 = a date in 2026)
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
  const xlsx = files.find(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
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

/* ── Compute analytics from DB projects ── */
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

/* ── Sync Excel → DB ── */
async function syncExcelToDB(): Promise<{ checksum: string; fileName: string; fileLastModified: string; fileSize: number; projectCount: number; wasNewSync: boolean }> {
  const filePath = findExcelFile();
  if (!filePath) throw new Error('Aucun fichier Excel trouvé');

  const checksum = getFileChecksum(filePath);
  const fileName = path.basename(filePath);
  const fileStats = fs.statSync(filePath);
  const fileLastModified = fileStats.mtime.toISOString();
  const fileSize = fileStats.size;

  // Check if already synced with this checksum
  const existingMeta = await db.fileMetadata.findFirst({ orderBy: { lastSyncAt: 'desc' } });
  if (existingMeta && existingMeta.fileChecksum === checksum) {
    return { checksum, fileName, fileLastModified, fileSize, projectCount: existingMeta.id === '0' ? 0 : (await db.pPMProject.count()), wasNewSync: false };
  }

  // Parse Excel and upsert all projects
  const projects = parseExcelFile(filePath);

  // Delete old data and replace
  await db.$transaction(async (tx) => {
    await tx.pPMProject.deleteMany();
    await tx.fileMetadata.deleteMany();

    await tx.fileMetadata.create({
      data: { fileName, fileChecksum: checksum, fileSize, fileLastModified: new Date(fileLastModified) },
    });

    for (const p of projects) {
      await tx.pPMProject.create({ data: p });
    }
  });

  return { checksum, fileName, fileLastModified, fileSize, projectCount: projects.length, wasNewSync: true };
}

/* ── GET: Load from DB (sync if needed) ── */
export async function GET() {
  try {
    const filePath = findExcelFile();
    const hasExcel = !!filePath;

    // If Excel file exists, check if we need to sync
    if (hasExcel) {
      const syncResult = await syncExcelToDB();
      const projects = await db.pPMProject.findMany({ orderBy: { id: 'asc' } });
      const analytics = computeAnalytics(projects);
      const soumissionnaires = await db.soumissionnaire.findMany({ orderBy: [{ numAOComplet: 'asc' }, { id: 'asc' }] });

      return NextResponse.json({
        lastUpdated: new Date().toISOString(),
        fileChecksum: syncResult.checksum,
        fileName: syncResult.fileName,
        fileLastModified: syncResult.fileLastModified,
        fileSize: syncResult.fileSize,
        dataSaved: true,
        projects,
        soumissionnaires,
        ...analytics,
      });
    }

    // No Excel file: try loading from DB
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
    return NextResponse.json({ error: 'Erreur de chargement des données' }, { status: 500 });
  }
}

/* ── POST: Upload new Excel file & save to DB ── */
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

    // Remove old Excel files
    const existingFiles = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
    existingFiles.forEach(f => fs.unlinkSync(path.join(UPLOAD_DIR, f)));

    // Save new file
    const filePath = path.join(UPLOAD_DIR, file.name);
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(bytes));

    // Sync to DB
    const syncResult = await syncExcelToDB();
    const projects = await db.pPMProject.findMany({ orderBy: { id: 'asc' } });
    const analytics = computeAnalytics(projects);
    const soumissionnaires = await db.soumissionnaire.findMany({ orderBy: [{ numAOComplet: 'asc' }, { id: 'asc' }] });

    return NextResponse.json({
      lastUpdated: new Date().toISOString(),
      fileChecksum: syncResult.checksum,
      fileName: syncResult.fileName,
      fileLastModified: syncResult.fileLastModified,
      fileSize: syncResult.fileSize,
      dataSaved: true,
      uploadSuccess: true,
      message: `Fichier "${file.name}" sauvegardé avec succès — ${syncResult.projectCount} marchés enregistrés en base`,
      projects,
      soumissionnaires,
      ...analytics,
    });
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

    if (!filePath) {
      // Check DB for saved data
      const meta = await db.fileMetadata.findFirst({ orderBy: { lastSyncAt: 'desc' } });
      if (!meta) return NextResponse.json({ changed: true, noFile: true });
      return NextResponse.json({
        changed: clientChecksum !== meta.fileChecksum,
        checksum: meta.fileChecksum,
        fileName: meta.fileName,
        fileLastModified: meta.fileLastModified.toISOString(),
      });
    }

    const currentChecksum = getFileChecksum(filePath);
    const fileStats = fs.statSync(filePath);
    const changed = !clientChecksum || clientChecksum !== currentChecksum;

    return NextResponse.json({
      changed,
      checksum: currentChecksum,
      fileName: path.basename(filePath),
      fileLastModified: fileStats.mtime.toISOString(),
    });
  } catch (error) {
    console.error('Error checking file:', error);
    return NextResponse.json({ error: 'Erreur de vérification' }, { status: 500 });
  }
}
