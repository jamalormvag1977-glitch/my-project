import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

interface PPMProject {
  id: number;
  typeBudget: string;
  natureBudget: string;
  numAO: string | number | null;
  entite: string;
  objet: string;
  cp: number;
  ce: number;
  estimationAdmin: number | null;
  dateOuverture: string | null;
  situationAvancement: string;
  dateJugement: string | null;
  attributaire: string | null;
  montantExtrait: number | null;
  numMarche: string | null;
  montantEngagement: number | null;
  engagementCP: number | null;
  engagementCE: number | null;
  dateEngagement: string | null;
}

function formatDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return String(val);
}

function formatNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'upload', 'Etat d\'avancement PPM 2026 au 09-05-2026.xlsx');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    
    const projects: PPMProject[] = [];
    
    for (let i = 3; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row[0]) continue;
      
      const id = Number(row[0]);
      if (isNaN(id) || id === 0) continue;

      projects.push({
        id,
        typeBudget: String(row[1] || ''),
        natureBudget: String(row[2] || ''),
        numAO: row[3] != null ? row[3] : null,
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

    // Compute KPIs
    const totalProjects = projects.length;
    const totalCP = projects.reduce((s, p) => s + (p.cp || 0), 0);
    const totalCE = projects.reduce((s, p) => s + (p.ce || 0), 0);
    const totalEstimation = projects.reduce((s, p) => s + (p.estimationAdmin || 0), 0);
    const totalEngagement = projects.reduce((s, p) => s + (p.montantEngagement || 0), 0);
    const totalMontantExtrait = projects.reduce((s, p) => s + (p.montantExtrait || 0), 0);
    
    // Status distribution
    const statusCount: Record<string, number> = {};
    projects.forEach(p => {
      statusCount[p.situationAvancement] = (statusCount[p.situationAvancement] || 0) + 1;
    });

    // Entity distribution
    const entityBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
    projects.forEach(p => {
      if (!entityBudget[p.entite]) {
        entityBudget[p.entite] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
      }
      entityBudget[p.entite].cp += p.cp || 0;
      entityBudget[p.entite].ce += p.ce || 0;
      entityBudget[p.entite].estimation += p.estimationAdmin || 0;
      entityBudget[p.entite].engagement += p.montantEngagement || 0;
      entityBudget[p.entite].count += 1;
    });

    // Nature distribution
    const natureBudget: Record<string, { cp: number; ce: number; count: number }> = {};
    projects.forEach(p => {
      if (!natureBudget[p.natureBudget]) {
        natureBudget[p.natureBudget] = { cp: 0, ce: 0, count: 0 };
      }
      natureBudget[p.natureBudget].cp += p.cp || 0;
      natureBudget[p.natureBudget].ce += p.ce || 0;
      natureBudget[p.natureBudget].count += 1;
    });

    // Type budget distribution
    const typeBudget: Record<string, { cp: number; ce: number; count: number }> = {};
    projects.forEach(p => {
      if (!typeBudget[p.typeBudget]) {
        typeBudget[p.typeBudget] = { cp: 0, ce: 0, count: 0 };
      }
      typeBudget[p.typeBudget].cp += p.cp || 0;
      typeBudget[p.typeBudget].ce += p.ce || 0;
      typeBudget[p.typeBudget].count += 1;
    });

    // Monthly timeline
    const monthlyTimeline: Record<string, { count: number; estimation: number; engagement: number }> = {};
    projects.forEach(p => {
      if (p.dateOuverture) {
        const month = p.dateOuverture.substring(0, 7);
        if (!monthlyTimeline[month]) {
          monthlyTimeline[month] = { count: 0, estimation: 0, engagement: 0 };
        }
        monthlyTimeline[month].count += 1;
        monthlyTimeline[month].estimation += p.estimationAdmin || 0;
        monthlyTimeline[month].engagement += p.montantEngagement || 0;
      }
    });

    // Engagement rate by entity
    const entityEngagementRate: Record<string, number> = {};
    Object.entries(entityBudget).forEach(([entity, data]) => {
      entityEngagementRate[entity] = data.estimation > 0 ? Math.round((data.engagement / data.estimation) * 100) : 0;
    });

    return NextResponse.json({
      lastUpdated: new Date().toISOString(),
      projects,
      kpis: {
        totalProjects,
        totalCP,
        totalCE,
        totalBudget: totalCP + totalCE,
        totalEstimation,
        totalEngagement,
        totalMontantExtrait,
        engagementRate: totalEstimation > 0 ? Math.round((totalEngagement / totalEstimation) * 100 * 10) / 10 : 0,
        extractionRate: totalEstimation > 0 ? Math.round((totalMontantExtrait / totalEstimation) * 100 * 10) / 10 : 0,
      },
      statusCount,
      entityBudget,
      natureBudget,
      typeBudget,
      monthlyTimeline,
      entityEngagementRate,
    });
  } catch (error) {
    console.error('Error reading Excel file:', error);
    return NextResponse.json({ error: 'Erreur de lecture du fichier' }, { status: 500 });
  }
}
