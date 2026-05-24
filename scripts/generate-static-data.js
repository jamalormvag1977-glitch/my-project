/**
 * Build-time data generator: reads Excel files and outputs a static JSON file.
 * Usage: node scripts/generate-static-data.js
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const PPM_XLSX = path.join(PROJECT_ROOT, 'public', 'data', 'ppm.xlsx');
const SOUM_XLSX = path.join(PROJECT_ROOT, 'public', 'data', 'soumissionnaires.xlsx');
const OUTPUT_JSON = path.join(PROJECT_ROOT, 'public', 'data', 'ppm.json');

/* ── Helpers (same logic as src/app/api/ppm/route.ts) ── */

function formatDate(val) {
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

function formatNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function getFileChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

/* ── PPM Projects parsing ── */
/*
 * Actual column layout in ppm.xlsx (row 2 = headers, row 3 = CP/CE subheaders):
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

function parseExcelFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

  const projects = [];

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

/* ── Soumissionnaire parsing ── */

function parseSoumissionnaireFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 2 });

  const soumissionnaires = [];

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

/* ── Compute analytics ── */

function computeAnalytics(projects) {
  const totalProjects = projects.length;
  const totalCP = projects.reduce((s, p) => s + (p.cp || 0), 0);
  const totalCE = projects.reduce((s, p) => s + (p.ce || 0), 0);
  const totalEstimation = projects.reduce((s, p) => s + (p.estimationAdmin || 0), 0);
  const totalEngagement = projects.reduce((s, p) => s + (p.montantEngagement || 0), 0);
  const totalMontantExtrait = projects.reduce((s, p) => s + (p.montantExtrait || 0), 0);

  const statusCount = {};
  projects.forEach(p => { statusCount[p.situationAvancement] = (statusCount[p.situationAvancement] || 0) + 1; });

  const entityBudget = {};
  projects.forEach(p => {
    if (!entityBudget[p.entite]) entityBudget[p.entite] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    entityBudget[p.entite].cp += p.cp || 0;
    entityBudget[p.entite].ce += p.ce || 0;
    entityBudget[p.entite].estimation += p.estimationAdmin || 0;
    entityBudget[p.entite].engagement += p.montantEngagement || 0;
    entityBudget[p.entite].count += 1;
  });

  const natureBudget = {};
  projects.forEach(p => {
    if (!natureBudget[p.natureBudget]) natureBudget[p.natureBudget] = { cp: 0, ce: 0, count: 0 };
    natureBudget[p.natureBudget].cp += p.cp || 0;
    natureBudget[p.natureBudget].ce += p.ce || 0;
    natureBudget[p.natureBudget].count += 1;
  });

  const typeBudget = {};
  projects.forEach(p => {
    if (!typeBudget[p.typeBudget]) typeBudget[p.typeBudget] = { cp: 0, ce: 0, count: 0 };
    typeBudget[p.typeBudget].cp += p.cp || 0;
    typeBudget[p.typeBudget].ce += p.ce || 0;
    typeBudget[p.typeBudget].count += 1;
  });

  const monthlyTimeline = {};
  projects.forEach(p => {
    if (p.dateOuverture) {
      const month = p.dateOuverture.substring(0, 7);
      if (!monthlyTimeline[month]) monthlyTimeline[month] = { count: 0, estimation: 0, engagement: 0 };
      monthlyTimeline[month].count += 1;
      monthlyTimeline[month].estimation += p.estimationAdmin || 0;
      monthlyTimeline[month].engagement += p.montantEngagement || 0;
    }
  });

  const entityEngagementRate = {};
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

/* ── Main ── */

function main() {
  console.log('🔄 Generating static data from Excel files...');

  // 1. Parse PPM projects
  if (!fs.existsSync(PPM_XLSX)) {
    console.error('❌ PPM Excel file not found:', PPM_XLSX);
    process.exit(1);
  }
  console.log('📖 Reading PPM file:', PPM_XLSX);
  const projects = parseExcelFile(PPM_XLSX);
  console.log(`   → ${projects.length} projects parsed`);

  // 2. Parse soumissionnaires
  let soumissionnaires = [];
  if (fs.existsSync(SOUM_XLSX)) {
    console.log('📖 Reading soumissionnaire file:', SOUM_XLSX);
    soumissionnaires = parseSoumissionnaireFile(SOUM_XLSX);
    console.log(`   → ${soumissionnaires.length} soumissionnaire records parsed`);
  } else {
    console.log('⚠️  Soumissionnaire file not found, skipping:', SOUM_XLSX);
  }

  // 3. Compute analytics
  const analytics = computeAnalytics(projects);
  console.log('📊 Analytics computed:');
  console.log(`   → KPIs: ${analytics.kpis.totalProjects} projects, budget=${analytics.kpis.totalBudget}, engagement rate=${analytics.kpis.engagementRate}%`);
  console.log(`   → ${Object.keys(analytics.statusCount).length} statuses, ${Object.keys(analytics.entityBudget).length} entities`);

  // 4. Build output
  const checksum = getFileChecksum(PPM_XLSX);
  const output = {
    lastUpdated: new Date().toISOString(),
    fileChecksum: checksum,
    fileName: 'ppm.xlsx',
    dataSaved: true,
    projects,
    soumissionnaires,
    ...analytics,
  };

  // 5. Write JSON
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf-8');
  const sizeKB = (fs.statSync(OUTPUT_JSON).size / 1024).toFixed(1);
  console.log(`✅ Static data written to ${OUTPUT_JSON} (${sizeKB} KB)`);
  console.log(`   → Checksum: ${checksum}`);
}

main();
