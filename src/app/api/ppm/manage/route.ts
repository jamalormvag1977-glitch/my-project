import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { list, put } from '@vercel/blob';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const runtime = 'nodejs';

type Project = {
  id: number; typeBudget: string; natureBudget: string; sourceFinancement?: string | null;
  programme?: string | null; projet?: string | null; numAO: string | number | null;
  entite: string; objet: string; cp: number; ce: number; estimationAdmin: number | null;
  dateOuverture: string | null; situationAvancement: string; dateJugement: string | null;
  attributaire: string | null; montantExtrait: number | null; numMarche: string | null;
  montantEngagement: number | null; engagementCP: number | null; engagementCE: number | null;
  dateEngagement: string | null; delaisExecution?: string | null;
};
type AuditEntry = { id: string; action: 'CREATION' | 'MODIFICATION' | 'SUPPRESSION'; projectId: number; numAO: string; at: string; user: string; before?: Project; after?: Project };
type Store = { projects: Project[]; auditLog: AuditEntry[]; updatedAt: string; source: string };

const STORE_PATH = 'ppm-manual-data.json';
const DATA_PATH = path.join(process.cwd(), 'public', 'data', 'ppm.json');

function normalizeProject(raw: any, id: number): Project {
  const n = (v: any) => v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  return {
    id, typeBudget: String(raw.typeBudget || ''), natureBudget: String(raw.natureBudget || ''),
    sourceFinancement: raw.sourceFinancement ? String(raw.sourceFinancement) : null,
    programme: raw.programme ? String(raw.programme) : null, projet: raw.projet ? String(raw.projet) : null,
    numAO: raw.numAO === '' || raw.numAO == null ? null : String(raw.numAO),
    entite: String(raw.entite || ''), objet: String(raw.objet || ''),
    cp: n(raw.cp) ?? 0, ce: n(raw.ce) ?? 0, estimationAdmin: n(raw.estimationAdmin),
    dateOuverture: raw.dateOuverture || null, situationAvancement: String(raw.situationAvancement || 'A programmer'),
    dateJugement: raw.dateJugement || null, attributaire: raw.attributaire || null,
    montantExtrait: n(raw.montantExtrait), numMarche: raw.numMarche || null,
    montantEngagement: n(raw.montantEngagement) ?? 0, engagementCP: n(raw.engagementCP),
    engagementCE: n(raw.engagementCE), dateEngagement: raw.dateEngagement || null,
    delaisExecution: raw.delaisExecution || null,
  };
}
function parseExcel(buffer: Buffer): Project[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const result: Project[] = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]; if (!r?.[0]) continue;
    const id = Number(r[0]); if (!Number.isFinite(id) || !id) continue;
    const date = (v: any) => {
      if (!v) return null;
      if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? new Date(Date.UTC(d.y,d.m-1,d.d)).toISOString().slice(0,10) : null; }
      return String(v);
    };
    result.push(normalizeProject({
      typeBudget:r[1], natureBudget:r[2], sourceFinancement:r[3], programme:r[4], projet:r[5],
      numAO:r[6], entite:r[7], objet:r[8], cp:r[9], ce:r[10], estimationAdmin:r[11],
      dateOuverture:date(r[12]), situationAvancement:r[13], dateJugement:date(r[14]),
      attributaire:r[15], montantExtrait:r[16], numMarche:r[17], montantEngagement:r[18],
      engagementCP:r[19], engagementCE:r[20], dateEngagement:date(r[21]), delaisExecution:r[22]
    }, id));
  }
  return result;
}
function analytics(projects: Project[]) {
  const sum = (key: keyof Project) => projects.reduce((s,p) => s + (Number(p[key]) || 0), 0);
  const totalCP=sum('cp'), totalCE=sum('ce'), totalEstimation=sum('estimationAdmin'), totalEngagement=sum('montantEngagement'), totalMontantExtrait=sum('montantExtrait');
  const statusCount: Record<string,number>={}, entityBudget: Record<string,any>={}, natureBudget: Record<string,any>={}, typeBudget: Record<string,any>={}, monthlyTimeline: Record<string,any>={}, entityEngagementRate: Record<string,number>={};
  for (const p of projects) {
    statusCount[p.situationAvancement]=(statusCount[p.situationAvancement]||0)+1;
    const e=p.entite||'Non renseignée'; entityBudget[e] ||= {cp:0,ce:0,estimation:0,engagement:0,count:0};
    entityBudget[e].cp+=p.cp||0; entityBudget[e].ce+=p.ce||0; entityBudget[e].estimation+=p.estimationAdmin||0; entityBudget[e].engagement+=p.montantEngagement||0; entityBudget[e].count++;
    const n=p.natureBudget||'Non renseignée'; natureBudget[n] ||= {cp:0,ce:0,count:0}; natureBudget[n].cp+=p.cp||0; natureBudget[n].ce+=p.ce||0; natureBudget[n].count++;
    const t=p.typeBudget||'Non renseigné'; typeBudget[t] ||= {cp:0,ce:0,count:0}; typeBudget[t].cp+=p.cp||0; typeBudget[t].ce+=p.ce||0; typeBudget[t].count++;
    if(p.dateOuverture){const m=String(p.dateOuverture).slice(0,7);monthlyTimeline[m] ||= {count:0,estimation:0,engagement:0};monthlyTimeline[m].count++;monthlyTimeline[m].estimation+=p.estimationAdmin||0;monthlyTimeline[m].engagement+=p.montantEngagement||0;}
  }
  for(const [e,v] of Object.entries(entityBudget)) entityEngagementRate[e]=v.estimation>0?Math.round(v.engagement/v.estimation*100):0;
  return {kpis:{totalProjects:projects.length,totalCP,totalCE,totalBudget:totalCP+totalCE,totalEstimation,totalEngagement,totalMontantExtrait,engagementRate:totalEstimation?Math.round(totalEngagement/totalEstimation*1000)/10:0,extractionRate:totalEstimation?Math.round(totalMontantExtrait/totalEstimation*1000)/10:0},statusCount,entityBudget,natureBudget,typeBudget,monthlyTimeline,entityEngagementRate};
}
async function readManual(): Promise<Store | null> {
  try {
    const blobs=await list({prefix:STORE_PATH});
    const blob=blobs.blobs.find(b=>b.pathname===STORE_PATH) || blobs.blobs[0];
    if(!blob) return null;
    const res=await fetch(blob.url,{cache:'no-store'}); if(!res.ok) return null;
    return await res.json() as Store;
  } catch { return null; }
}
async function initialProjects(): Promise<Project[]> {
  try {
    const blobs=await list({prefix:'ppm-'});
    const excel=blobs.blobs.filter(b=>!b.pathname.includes('manual-data')).sort((a,b)=>new Date(b.uploadedAt).getTime()-new Date(a.uploadedAt).getTime())[0];
    if(excel){const r=await fetch(excel.url,{cache:'no-store'});if(r.ok)return parseExcel(Buffer.from(await r.arrayBuffer()));}
  } catch {}
  try { const json=JSON.parse(fs.readFileSync(DATA_PATH,'utf8')); if(Array.isArray(json.projects)) return json.projects.map((p:any)=>normalizeProject(p,Number(p.id))); } catch {}
  return [];
}
async function requireAdmin(): Promise<{ error?: NextResponse; user?: string }> {
  const session=await getServerSession(authOptions);
  if(!session) return {error:NextResponse.json({error:'Non authentifié'},{status:401})};
  if((session.user as any)?.role!=='admin') return {error:NextResponse.json({error:'Accès réservé aux administrateurs'},{status:403})};
  return {user:(session.user as any)?.email || (session.user as any)?.name || 'Administrateur'};
}
async function saveStore(store: Store) {
  const payload=JSON.stringify(store);
  await put(STORE_PATH,payload,{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json; charset=utf-8'});
  return crypto.createHash('sha256').update(payload).digest('hex');
}
export async function GET() {
  const auth=await requireAdmin(); if(auth.error)return auth.error;
  try {
    const store=await readManual();
    if(!store) return NextResponse.json({manualMode:false,projects:[],auditLog:[]});
    return NextResponse.json({manualMode:true,projects:store.projects,auditLog:store.auditLog,updatedAt:store.updatedAt,source:store.source,...analytics(store.projects),fileChecksum:crypto.createHash('sha256').update(JSON.stringify(store)).digest('hex'),dataSaved:true});
  } catch(e) { return NextResponse.json({error:'Impossible de lire les données de saisie.'},{status:500}); }
}
export async function POST(request: Request) {
  const auth=await requireAdmin(); if(auth.error)return auth.error;
  try {
    const body=await request.json();
    let store=await readManual();
    if(!store) store={projects:await initialProjects(),auditLog:[],updatedAt:new Date().toISOString(),source:'Import Excel initial'};
    const now=new Date().toISOString();
    if(body.action==='delete') {
      const id=Number(body.id); const before=store.projects.find(p=>p.id===id);
      if(!before)return NextResponse.json({error:'AO introuvable.'},{status:404});
      store.projects=store.projects.filter(p=>p.id!==id);
      store.auditLog.unshift({id:crypto.randomUUID(),action:'SUPPRESSION',projectId:id,numAO:String(before.numAO||id),at:now,user:auth.user!,before});
    } else {
      const raw=body.project||{};
      const requestedId=Number(raw.id);
      const isEdit=Number.isInteger(requestedId)&&store.projects.some(p=>p.id===requestedId);
      const id=isEdit?requestedId:Math.max(0,...store.projects.map(p=>p.id))+1;
      const project=normalizeProject(raw,id);
      if(!project.entite.trim()||!project.objet.trim()||!project.typeBudget.trim()||!project.natureBudget.trim())
        return NextResponse.json({error:'Les champs Entité, Objet, Type et Nature du budget sont obligatoires.'},{status:400});
      const before=isEdit?store.projects.find(p=>p.id===id):undefined;
      store.projects=isEdit?store.projects.map(p=>p.id===id?project:p):[...store.projects,project];
      store.auditLog.unshift({id:crypto.randomUUID(),action:isEdit?'MODIFICATION':'CREATION',projectId:id,numAO:String(project.numAO||id),at:now,user:auth.user!,before,after:project});
    }
    store.auditLog=store.auditLog.slice(0,2000); store.updatedAt=now; store.source='Saisie directe';
    const checksum=await saveStore(store);
    return NextResponse.json({success:true,message:'Modification enregistrée et analyses actualisées.',projects:store.projects,...analytics(store.projects),auditCount:store.auditLog.length,updatedAt:now,fileChecksum:checksum,dataSaved:true});
  } catch(e) {
    console.error('PPM manual save failed',e);
    return NextResponse.json({error:'Échec de sauvegarde permanente. Vérifiez la configuration Vercel Blob et réessayez.'},{status:503});
  }
}
