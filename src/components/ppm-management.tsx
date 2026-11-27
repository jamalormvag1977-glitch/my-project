'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Save, X, RefreshCw, History, ClipboardList, CheckCircle2, AlertCircle } from 'lucide-react';

type Project = {
  id:number; typeBudget:string; natureBudget:string; sourceFinancement?:string|null; programme?:string|null; projet?:string|null;
  numAO:string|number|null; entite:string; objet:string; cp:number; ce:number; estimationAdmin:number|null;
  dateOuverture:string|null; situationAvancement:string; dateJugement:string|null; attributaire:string|null;
  montantExtrait:number|null; numMarche:string|null; montantEngagement:number|null; engagementCP:number|null;
  engagementCE:number|null; dateEngagement:string|null; delaisExecution?:string|null;
};
type Audit = {id:string;action:string;projectId:number;numAO:string;at:string;user:string};
const empty: Omit<Project,'id'> = {
  typeBudget:'',natureBudget:'',sourceFinancement:'',programme:'',projet:'',numAO:'',entite:'',objet:'',
  cp:0,ce:0,estimationAdmin:null,dateOuverture:null,situationAvancement:'A programmer',dateJugement:null,
  attributaire:'',montantExtrait:null,numMarche:'',montantEngagement:0,engagementCP:null,engagementCE:null,
  dateEngagement:null,delaisExecution:''
};
const statusOptions=['A programmer','Publié sur PMP','DAO Envoyé au CE','En cours de jugement','Jugé','Engagé','Infructueux','Annulé'];
const fields: {key:keyof typeof empty;label:string;type?:string;required?:boolean}[]=[
 {key:'numAO',label:'N° AO'},{key:'entite',label:'Entité',required:true},{key:'typeBudget',label:'Type de budget',required:true},
 {key:'natureBudget',label:'Nature de budget',required:true},{key:'sourceFinancement',label:'Source de financement'},
 {key:'programme',label:'Programme'},{key:'projet',label:'Projet'},{key:'objet',label:'Objet du marché',type:'textarea',required:true},
 {key:'cp',label:'CP (MDH)',type:'number'},{key:'ce',label:'CE (MDH)',type:'number'},
 {key:'estimationAdmin',label:'Estimation administrative (MDH)',type:'number'},
 {key:'dateOuverture',label:'Date ouverture des plis',type:'date'},
 {key:'situationAvancement',label:'Situation',type:'select'},
 {key:'dateJugement',label:'Date de jugement',type:'date'},{key:'attributaire',label:'Attributaire'},
 {key:'montantExtrait',label:'Montant extrait (MDH)',type:'number'},{key:'numMarche',label:'N° marché'},
 {key:'montantEngagement',label:'Montant engagement (MDH)',type:'number'},
 {key:'engagementCP',label:'Engagement CP (MDH)',type:'number'},{key:'engagementCE',label:'Engagement CE (MDH)',type:'number'},
 {key:'dateEngagement',label:'Date engagement',type:'date'},{key:'delaisExecution',label:'Délais d’exécution'}
];
export default function PPMManagement({selectedYear,onYearChange,onSaved}:{selectedYear:number;onYearChange:(year:number)=>void;projects:Project[];onSaved:()=>Promise<void>|void}) {
 const [projects,setProjects]=useState<Project[]>([]);
 const [loadingYear,setLoadingYear]=useState(true);
 const loadYear=async(year:number)=>{setLoadingYear(true);try{const r=await fetch(`/api/ppm/manage?year=${year}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Chargement impossible');setProjects(j.projects||[]);setAudit(j.auditLog||[]);}catch(err:any){setMessage({ok:false,text:err.message||'Impossible de charger cet exercice.'});}finally{setLoadingYear(false);}};
 const [form,setForm]=useState<any>(empty);
 const [editingId,setEditingId]=useState<number|null>(null);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
 const [search,setSearch]=useState('');
 const [showForm,setShowForm]=useState(false);
 const [showAudit,setShowAudit]=useState(false);
 const [audit,setAudit]=useState<Audit[]>([]);
 const [auditLoading,setAuditLoading]=useState(false);
 useEffect(()=>{loadYear(selectedYear);setShowForm(false);setEditingId(null);setShowAudit(false);setSearch('');},[selectedYear]);
 const filtered=useMemo(()=>projects.filter(p=>[p.numAO,p.entite,p.objet,p.attributaire,p.numMarche].join(' ').toLowerCase().includes(search.toLowerCase())),[projects,search]);
 const startNew=()=>{setEditingId(null);setForm({...empty});setMessage(null);setShowForm(true);};
 const startEdit=(p:Project)=>{setEditingId(p.id);setForm({...p});setMessage(null);setShowForm(true);};
 const change=(key:string,value:any)=>setForm((old:any)=>({...old,[key]:value}));
 const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setMessage(null);try{
   const payload={...form,...(editingId?{id:editingId}:{})};
   const res=await fetch('/api/ppm/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:selectedYear,project:payload})});
   const json=await res.json();if(!res.ok)throw new Error(json.error||'Erreur de sauvegarde');
   setMessage({ok:true,text:json.message||'AO enregistré.'});await loadYear(selectedYear);await onSaved();setShowForm(false);setEditingId(null);
 }catch(err:any){setMessage({ok:false,text:err.message||'Erreur réseau'});}finally{setSaving(false);}};
 const remove=async(p:Project)=>{if(!window.confirm('Confirmer la suppression de l’AO '+(p.numAO||p.id)+' ? La suppression sera inscrite dans le journal d’audit.'))return;
   setSaving(true);setMessage(null);try{const res=await fetch('/api/ppm/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:selectedYear,action:'delete',id:p.id})});const json=await res.json();if(!res.ok)throw new Error(json.error||'Suppression impossible');setMessage({ok:true,text:'AO supprimé. Les analyses ont été actualisées.'});await loadYear(selectedYear);await onSaved();}catch(err:any){setMessage({ok:false,text:err.message||'Erreur réseau'});}finally{setSaving(false);}};
 const loadAudit=async()=>{setShowAudit(v=>!v);setAuditLoading(true);try{const r=await fetch(`/api/ppm/manage?year=${selectedYear}`,{cache:'no-store'});const j=await r.json();setAudit(j.auditLog||[]);}catch{}finally{setAuditLoading(false);}};
 return <div className="min-h-screen bg-slate-50 text-slate-800">
  <div className="bg-gradient-to-r from-indigo-700 via-violet-700 to-purple-700 text-white px-5 py-5 sm:px-8">
   <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-3">
    <div><div className="flex items-center gap-2 text-xl font-bold"><ClipboardList className="w-6 h-6"/> Saisie et gestion du PPM</div><p className="text-indigo-100 text-xs mt-1">Gestion directe des appels d’offres · Exercice {selectedYear}</p></div>
    <div className="flex items-center gap-2"><label className="text-xs text-indigo-100">Exercice</label><select value={selectedYear} onChange={e=>onYearChange(Number(e.target.value))} className="rounded-lg border border-white/30 bg-indigo-900/40 text-white px-3 py-2 text-sm font-semibold outline-none"><option value={2026} className="text-slate-900">2026</option><option value={2027} className="text-slate-900">2027</option></select><button onClick={loadAudit} className="rounded-lg bg-white/15 hover:bg-white/25 px-3 py-2 text-xs flex items-center gap-2"><History className="w-4 h-4"/> Historique</button><button onClick={startNew} className="rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 px-3 py-2 text-xs font-semibold flex items-center gap-2"><Plus className="w-4 h-4"/> Nouvel AO</button></div>
   </div>
  </div>
  <div className="max-w-[1800px] mx-auto p-4 sm:p-7 space-y-4">
   {selectedYear===2027&&<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Vous travaillez sur le PPM de l’exercice 2027. Les données et l’historique de 2026 sont conservés séparément.</div>}
   {loadingYear&&<div className="rounded-lg bg-white border p-3 text-sm text-slate-500">Chargement de l’exercice {selectedYear}…</div>}
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div className="bg-white rounded-xl border p-4"><div className="text-xs text-slate-500">AO enregistrés</div><div className="text-2xl font-bold mt-1">{projects.length}</div></div>
    <div className="bg-white rounded-xl border p-4"><div className="text-xs text-slate-500">AO engagés</div><div className="text-2xl font-bold mt-1 text-emerald-600">{projects.filter(p=>p.situationAvancement==='Engagé').length}</div></div>
    <div className="bg-white rounded-xl border p-4"><div className="text-xs text-slate-500">Estimation totale</div><div className="text-2xl font-bold mt-1 text-indigo-700">{projects.reduce((s,p)=>s+(Number(p.estimationAdmin)||0),0).toLocaleString('fr-FR',{maximumFractionDigits:2})} MDH</div></div>
   </div>
   {message&&<div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${message.ok?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{message.ok?<CheckCircle2 className="w-4 h-4"/>:<AlertCircle className="w-4 h-4"/>}{message.text}</div>}
   {showForm&&<form onSubmit={save} className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
    <div className="flex items-center justify-between"><div><h2 className="font-bold text-lg">{editingId?'Modifier l’AO':'Créer un nouvel AO'}</h2><p className="text-xs text-slate-500">Les champs marqués * sont obligatoires.</p></div><button type="button" onClick={()=>setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4"/></button></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
     {fields.map(f=><label key={f.key} className={`block space-y-1 ${f.type==='textarea'?'md:col-span-2 xl:col-span-3':''}`}><span className="text-xs font-medium text-slate-600">{f.label}{f.required?' *':''}</span>
      {f.type==='textarea'?<textarea required={f.required} rows={3} value={form[f.key]??''} onChange={e=>change(f.key,e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"/>
      :f.type==='select'?<select value={form[f.key]??''} onChange={e=>change(f.key,e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{statusOptions.map(s=><option key={s}>{s}</option>)}</select>
      :<input required={f.required} type={f.type||'text'} step={f.type==='number'?'0.001':undefined} value={form[f.key]??''} onChange={e=>change(f.key,f.type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"/>}
     </label>)}
    </div>
    <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Annuler</button><button disabled={saving} className="rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4"/>{saving?'Enregistrement…':'Enregistrer et actualiser'}</button></div>
   </form>}
   {showAudit&&<div className="bg-white border rounded-xl p-4"><div className="font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4"/> Journal des modifications</div>{auditLoading?<p className="text-sm text-slate-500">Chargement…</p>:audit.length===0?<p className="text-sm text-slate-500">Aucune modification enregistrée.</p>:<div className="max-h-72 overflow-auto space-y-2">{audit.map(a=><div key={a.id} className="border-b pb-2 text-xs flex flex-wrap justify-between gap-2"><span className="font-semibold">{a.action} · AO {a.numAO}</span><span className="text-slate-500">{new Date(a.at).toLocaleString('fr-FR')} · {a.user}</span></div>)}</div>}</div>}
   <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
    <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Registre des appels d’offres</h2><p className="text-xs text-slate-500">{filtered.length} AO affichés sur {projects.length}</p></div><div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un AO…" className="pl-9 pr-3 py-2 border rounded-lg text-sm w-64 max-w-full"/></div></div>
    <div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr>{['N° AO','Entité','Objet','Nature','Type','Estimation','Statut','Attributaire','Actions'].map(x=><th key={x} className="px-3 py-3 text-left font-semibold">{x}</th>)}</tr></thead><tbody>{filtered.map(p=><tr key={p.id} className="border-t hover:bg-indigo-50/30"><td className="px-3 py-3 font-semibold text-indigo-700">{p.numAO||'—'}</td><td className="px-3 py-3">{p.entite}</td><td className="px-3 py-3 whitespace-normal min-w-[300px] leading-5">{p.objet}</td><td className="px-3 py-3">{p.natureBudget}</td><td className="px-3 py-3">{p.typeBudget}</td><td className="px-3 py-3">{p.estimationAdmin?.toLocaleString('fr-FR')||'—'}</td><td className="px-3 py-3">{p.situationAvancement}</td><td className="px-3 py-3">{p.attributaire||'—'}</td><td className="px-3 py-3"><div className="flex gap-1"><button onClick={()=>startEdit(p)} title="Modifier" className="p-2 rounded-md text-indigo-600 hover:bg-indigo-50"><Pencil className="w-4 h-4"/></button><button disabled={saving} onClick={()=>remove(p)} title="Supprimer" className="p-2 rounded-md text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4"/></button></div></td></tr>)}</tbody></table></div>
   </div>
   <p className="text-[11px] text-slate-500 flex items-center gap-2"><RefreshCw className="w-3 h-3"/> Après chaque enregistrement, les indicateurs et les analyses de l’application sont recalculés automatiquement.</p>
  </div>
 </div>;
}
