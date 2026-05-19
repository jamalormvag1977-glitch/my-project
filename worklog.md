# PPM Dashboard — Work Log

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
