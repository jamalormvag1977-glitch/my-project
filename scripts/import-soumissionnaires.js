/**
 * Import soumissionnaire data from Excel file into SQLite database
 * Usage: node scripts/import-soumissionnaires.js
 */
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(__dirname, '..', 'upload', 'détail soumissionnaire.xlsx');
  console.log('Reading Excel file:', filePath);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON - header is row 2
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 2 });
  
  console.log(`Found ${rows.length} data rows in sheet "${sheetName}"`);
  
  // Clear existing soumissionnaire data
  await prisma.soumissionnaire.deleteMany({});
  console.log('Cleared existing soumissionnaire data');
  
  let imported = 0;
  let skipped = 0;
  
  for (const row of rows) {
    const semaine = row[0];
    const seance = row[1];
    const numAOComplet = row[2];
    const objetAO = row[3];
    const objetSeance = row[4];
    const president = row[5];
    const nbSoum = row[6];
    const nomSoum = row[7];
    const decision = row[8];
    const offreFin = row[9];
    const decisionOF = row[10];
    
    if (!numAOComplet) {
      skipped++;
      continue;
    }
    
    // Parse numAOComplet to extract numAO and entite
    // Format: "1/2026/DPF" or "39 ex 12/2026/SMG"
    const numAOCompletStr = String(numAOComplet).trim();
    let numAO = '';
    let entite = '';
    
    const parts = numAOCompletStr.split('/');
    if (parts.length === 3) {
      numAO = parts[0].trim();
      entite = parts[2].trim();
    } else {
      numAO = numAOCompletStr;
    }
    
    const nomSoumissionnaire = nomSoum ? String(nomSoum).trim() : null;
    const nbSoumissionnaires = nbSoum ? parseInt(String(nbSoum).trim()) : null;
    const offreFinanciere = offreFin ? String(offreFin).trim() : null;
    const decisionStr = decision ? String(decision).trim() : null;
    const decisionOFStr = decisionOF ? String(decisionOF).trim() : null;
    
    try {
      await prisma.soumissionnaire.create({
        data: {
          numAO,
          entite,
          numAOComplet: numAOCompletStr,
          semaine: semaine ? String(semaine).trim() : null,
          seance: seance ? String(seance).trim() : null,
          objetAO: objetAO ? String(objetAO).trim() : null,
          objetSeance: objetSeance ? String(objetSeance).trim() : null,
          nbSoumissionnaires,
          nomSoumissionnaire,
          decision: decisionStr,
          offreFinanciere,
          decisionOF: decisionOFStr,
        }
      });
      imported++;
    } catch (err) {
      console.error(`Error importing row: ${numAOCompletStr} - ${nomSoumissionnaire}`, err.message);
      skipped++;
    }
  }
  
  console.log(`\nImport complete: ${imported} rows imported, ${skipped} skipped`);
  
  const count = await prisma.soumissionnaire.count();
  console.log(`Total soumissionnaire records in DB: ${count}`);
  
  const uniqueAOs = await prisma.soumissionnaire.findMany({
    select: { numAOComplet: true },
    distinct: ['numAOComplet']
  });
  console.log(`Unique AO with soumissionnaire data: ${uniqueAOs.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
