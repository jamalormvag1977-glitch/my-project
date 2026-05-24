/**
 * Génère le fichier JSON statique des soumissionnaires à partir du fichier Excel.
 * Ce fichier est utilisé comme fallback sur Vercel (pas d'accès filesystem en serverless).
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, '..', 'public', 'data', 'soumissionnaires.xlsx');
const JSON_PATH = path.join(__dirname, '..', 'public', 'data', 'soumissionnaires.json');

function parseNumAO(numAO) {
  // '1/2026/DPF' → { num: '1', entite: 'DPF' }
  if (!numAO) return { num: '', entite: '' };
  const parts = String(numAO).split('/');
  return {
    num: parts[0] || '',
    entite: parts[parts.length - 1] || ''
  };
}

function generateSoumissionnaireData() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.log('⚠️  Fichier soumissionnaires.xlsx non trouvé, skip...');
    // Créer un JSON vide
    const emptyData = {
      lastUpdated: new Date().toISOString(),
      fileName: 'soumissionnaires.xlsx',
      projets: {}
    };
    fs.writeFileSync(JSON_PATH, JSON.stringify(emptyData, null, 2), 'utf8');
    console.log('✅ soumissionnaires.json vide créé');
    return;
  }

  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Ligne 0 = titre, Ligne 1 = en-têtes
  // Col 0: Semaine, 1: Séance, 2: N° AO, 3: Objet AO, 4: Objet de la séance,
  // Col 5: Président, 6: Nb Soumissionnaires, 7: Soumissionnaire,
  // Col 8: Décision Commission, 9: Offre financière proposée, 10: Décision Commission (OF)

  const projets = {}; // key = 'num/entite' → { numAO, entite, objet, seances: [...] }

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
        numAOComplet: numAOComplet,
        objetAO: row[3] || '',
        nbSoumissionnaires: row[6] || 0,
        soumissionnaires: []
      };
    }

    // Mettre à jour le nb de soumissionnaires si on a une valeur
    if (row[6] && Number(row[6]) > 0) {
      projets[key].nbSoumissionnaires = Number(row[6]);
    }

    const soumissionnaire = {
      semaine: row[0] || '',
      seance: row[1] || '',
      objetSeance: row[4] || '',
      president: row[5] || '',
      nom: row[7] && row[7] !== '-' ? String(row[7]).trim() : null,
      decisionCommission: row[8] || '',
      offreFinanciere: row[9] && row[9] !== '-' ? String(row[9]).trim() : null,
      decisionCommissionOF: row[10] || ''
    };

    projets[key].soumissionnaires.push(soumissionnaire);
  }

  // Statistiques
  const totalProjets = Object.keys(projets).length;
  let totalSoumissionnaires = 0;
  Object.values(projets).forEach(p => {
    // Compter les soumissionnaires uniques (non-null)
    const uniqueSoums = new Set(
      p.soumissionnaires
        .filter(s => s.nom)
        .map(s => s.nom)
    );
    p.nbSoumissionnairesUniques = uniqueSoums.size;
    totalSoumissionnaires += uniqueSoums.size;
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    fileName: 'soumissionnaires.xlsx',
    totalProjets,
    totalSoumissionnaires,
    projets
  };

  fs.writeFileSync(JSON_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ soumissionnaires.json généré : ${totalProjets} projets, ${totalSoumissionnaires} soumissionnaires`);
}

generateSoumissionnaireData();
