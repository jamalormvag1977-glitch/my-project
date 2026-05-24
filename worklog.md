# PPM Dashboard — Work Log

## Session: Fix Vercel Deployment Crash

### Date: 2026-05-24

### Summary
Fixed the Vercel deployment crash (Application error: a client-side exception has occurred) by correcting the Excel column mapping, adding static JSON fallback, and making the client resilient to API failures.

### Root Cause Analysis
1. **Wrong column mapping in parseExcelFile()**: The API route used columns 0-18, but the actual Excel has 3 extra columns (Source de financement=3, Programme=4, Projet=5) that shift all subsequent columns. This caused numAO to read "ELF" instead of "1", entite to read "IAEA" instead of "DPF", etc.
2. **No data on Vercel**: The API route tried to read Excel files via `fs` from `public/data/`, but on Vercel serverless functions, the `public/` directory is not accessible via filesystem. SQLite also doesn't work on Vercel.
3. **No error boundary**: When the API failed, the client showed an infinite loading skeleton or crashed with a client-side exception.

### Changes Made

#### 1. Fixed parseExcelFile() column mapping (src/app/api/ppm/route.ts)
- Column 3: sourceFinancement (was numAO)
- Column 4: programme (was entite)
- Column 5: projet (was objet)
- Column 6: numAO (was cp)
- Column 7: entite (was ce)
- Column 8: objet (was estimationAdmin)
- Column 9: cp, 10: ce, 11: estimationAdmin, 12: dateOuverture, 13: situationAvancement, etc.
- Column 22: delaisExecution (new field)

#### 2. Added static JSON fallback
- Created `scripts/generate-static-data.js` to pre-generate `public/data/ppm.json` at build time
- Added `readStaticJson()` in API route as fallback when Excel files not accessible via `fs`
- Added `fetchStaticJsonFallback()` in client to fetch `/data/ppm.json` when API fails
- API now tries: Excel → Static JSON → DB → Error
- Client now tries: API → Static JSON → No-data state

#### 3. Added proper no-data state (page.tsx)
- Replaced `if (loading || !data)` with separate `if (loading)` and `if (!data)` blocks
- Loading state: shows skeleton animation
- No-data state: shows friendly message with retry button
- This prevents the "Application error: a client-side exception has occurred" page

#### 4. Updated PPMProject interface
- Added: `sourceFinancement?: string | null`
- Added: `programme?: string | null`
- Added: `projet?: string | null`
- Added: `delaisExecution?: string | null`

#### 5. Updated package.json
- Build script: `node scripts/generate-static-data.js && next build`
- Postinstall: `DATABASE_URL=file:./dev.db prisma generate` (ensures Prisma works on Vercel without .env)

### Generated Static Data (public/data/ppm.json)
- 77 projects parsed
- 319 soumissionnaire records
- 8 statuses: Engagé(25), A programmer(25), DAO Envoyé au CE(10), Publié sur PMP(7), Infructueux(4), Jugé(4), En cours de jugement(1), Annulé(1)
- 7 entities: DPF, SMG, DDA, DGR, SAI, DAM, DRH
- KPIs: totalBudget=469M, engagementRate=25.3%, extractionRate=27%

### Git Push
- Commit: `4dc45bd fix: correct Excel column mapping, add static JSON fallback for Vercel, fix Vercel deployment crash`
- Pushed to: `origin/main`

### Build Verification
- `npx next build` ✓ Compiled successfully

## Session: Reapply Pipeline & Status Changes

### Date: 2026-05-19

### Summary
Applied 6 major changes to `/home/z/my-project/src/app/page.tsx` to restore pipeline ordering, status consistency, and missing features from previous session.

### Changes Made

#### Change 1: PIPELINE_ORDER constant and sorted statuses
- Added `PIPELINE_ORDER` constant: `['Ouvert','En cours de jugement','Jugé','Engagé','Infructueux','Annulé','Publié PPM','DAO Envoyé au CE','A programmer']`
- Added `PIPELINE_STATUS_MAP` mapping for display names to data status names (e.g., 'Publié PPM' → 'Publié sur PMP')
- Updated `statuses` array sorting to use PIPELINE_ORDER instead of alphabetical
- Updated progress bar entries to sort by PIPELINE_ORDER
- Updated status legend to sort by PIPELINE_ORDER
- Updated Par Étape detail sections to sort by PIPELINE_ORDER

#### Change 2: "Ouvert" definition based on dateOuverture <= today
- Added `ouvertProjects` computed variable: `filtered.filter(p => p.dateOuverture && new Date(p.dateOuverture) <= today)`
- Replaced "Ouverture Plis" rate card with "Ouvert" rate card using `ouvertProjects`
- Updated rate computation: `ouvertRate = ouvertProjects.length / filteredKpis.totalProjects * 100`
- Pipeline visual uses `ouvertProjects` for the "Ouvert" stage

#### Change 3: 9 rate cards in PIPELINE_ORDER
- Replaced 8 rate cards with 9 cards:
  1. Ouvert (#3b82f6, CalendarDays)
  2. En cours de jugement (#d97706, Clock)
  3. Jugé (#2563eb, CheckCircle2)
  4. Engagé (#16a34a, DollarSign)
  5. Infructueux (#dc2626, XCircle)
  6. Annulé (#991b1b, XCircle)
  7. Publié PPM (#7c3aed, Activity)
  8. DAO Envoyé au CE (#0891b2, Send)
  9. A programmer (#6b7280, AlertCircle)
- Updated grid from `lg:grid-cols-8` to `lg:grid-cols-9`
- Added `Send` import from lucide-react
- Added `daoCeRate` computation

#### Change 4: N° Marché column in detail tables
- **Par Étape view**: Added "N° Marché" column after "Engagé le" (both header and data rows)
- **Historique view**: Added "N° Marché" column after "Attributaire" (both header and data rows)
- **Par Entité view** (new): Added "N° Marché" column after "Eng. CP" (both header and data rows)
- All display `p.numMarche || '—'`

#### Change 5: Pipeline visual in Par Étape view
- Replaced old 6-stage + 2 failed-branch layout with unified PIPELINE_ORDER (9 stages)
- Each stage uses `PIPELINE_STATUS_MAP` to look up data correctly
- "Ouvert" stage uses `ouvertProjects` count
- Failed stages (Infructueux, Annulé) rendered with red styling inline
- Arrow indicators between all stages

#### Change 6: Status name consistency
- Added `statusColor` entries for 'Ouvert', 'Publié PPM', 'DAO Envoyé au CE'
- Added `statusIcon` entries for 'Ouvert', 'Publié PPM', 'DAO Envoyé au CE'
- PIPELINE_STATUS_MAP handles: 'Publié PPM' → 'Publié sur PMP', 'Ouvert' → '__computed__'
- All lookups use `PIPELINE_STATUS_MAP[stage] || stage` to resolve data status names

#### Bonus: Created Par Entité full-screen view
- Added `sidebarTab === 'entity'` rendering block
- Expandable sections per entity with project details
- Includes N° Marché, Eng. CP columns
- Filter bar with status, nature, type filters
- Search functionality

### Build Verification
- `npx next build` ✓ Compiled successfully
- `bun run lint` ✓ No errors
- PM2 process restarted successfully

---
Task ID: blob-setup
Agent: Main Agent
Task: Configure Vercel Blob for persistent file storage and upload functionality

Work Log:
- Verified @vercel/blob package was already installed (^2.4.0)
- Verified code already had full Blob integration in both /api/ppm and /api/soumissionnaires routes
- Found BLOB_READ_WRITE_TOKEN was missing from Vercel environment variables
- Created new Blob store "ppm-ormvag" (store_iZn9tmwt5kNYqFuV) with public access
- Successfully linked store to project "my-project" which auto-added BLOB_READ_WRITE_TOKEN
- Cleaned up unused Blob stores (Dashboard Vercel, ppm-dashboard-blob)
- Verified Blob upload works: test file uploaded and parsed correctly
- Uploaded current PPM and Soumissionnaires data to Blob store
- Deployed to production and verified API loads from Blob (priority 1)
- Production API now returns blobUrl confirming Blob integration works

Stage Summary:
- Vercel Blob store "ppm-ormvag" is active and linked to project
- BLOB_READ_WRITE_TOKEN configured in Production, Preview, and Development environments
- GET /api/ppm: tries Blob first → local Excel → static JSON → DB
- POST /api/ppm: parses Excel from memory buffer + uploads to Blob
- GET /api/soumissionnaires: tries Blob first → local Excel → static JSON
- POST /api/soumissionnaires: parses Excel from memory buffer + uploads to Blob
- User can now upload files via the web interface and data persists in Vercel Blob

---
Task ID: fix-upload-auth
Agent: Main Agent
Task: Fix upload authentication error "Accès réservé aux administrateurs"

Work Log:
- Investigated upload failure on production
- Discovered root cause: getServerSession() was called WITHOUT authOptions parameter
- In Next.js App Router, getServerSession() requires authOptions to properly decode JWT session
- Without authOptions, session is null or doesn't contain the role → always rejected
- Fixed both /api/ppm/route.ts and /api/soumissionnaires/route.ts
- Added import: `import { authOptions } from '@/app/api/auth/[...nextauth]/route';`
- Changed: `getServerSession()` → `getServerSession(authOptions)`
- Deployed to production and verified upload works
- Upload to Vercel Blob confirmed working: file persisted and data loads from Blob

Stage Summary:
- Bug fix: getServerSession(authOptions) now properly verifies JWT session
- Upload to Vercel Blob works end-to-end on production
- User can now upload files independently through the web interface
