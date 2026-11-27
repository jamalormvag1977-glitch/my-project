'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Eye, FileText, FolderOpen, Loader2, Plus, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Project = { id: number; numAO: string | number | null; entite: string; objet: string };
type DocumentItem = { pathname: string; aoId: string; category: string; fileName: string; size: number; uploadedAt: string };
const CATEGORIES = [
  { value: 'CPS', label: 'CPS – Cahier des Prescriptions Spéciales' },
  { value: 'RC', label: 'RC – Règlement de Consultation' },
  { value: 'PV_OUVERTURE', label: 'PV d’ouverture des plis' },
  { value: 'PV_JUGEMENT', label: 'PV de jugement' },
  { value: 'EXTRAIT_MARCHE', label: 'Extrait du marché' },
  { value: 'AUTRE', label: 'Autre document' },
];

export default function GedManagement({ year, projects, isAdmin, initialAoId }: {
  year: number; projects: Project[]; isAdmin: boolean; initialAoId?: string | null;
}) {
  const [aoId, setAoId] = useState(initialAoId || 'all');
  const [category, setCategory] = useState('CPS');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setAoId(initialAoId || 'all'); }, [initialAoId, year]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ged?year=${year}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Impossible de charger les documents.');
      setDocuments(json.documents || []);
      setMessage(null);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Erreur de chargement GED.' });
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const visibleDocuments = useMemo(
    () => documents.filter(d => aoId === 'all' || d.aoId === aoId),
    [documents, aoId]
  );
  const selectedProject = projects.find(p => String(p.id) === aoId);

  const upload = async (file?: File) => {
    if (!file) return;
    if (aoId === 'all') {
      setMessage({ ok: false, text: 'Sélectionnez d’abord un appel d’offres.' });
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
      setMessage({ ok: false, text: 'Seuls les fichiers PDF sont acceptés.' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('year', String(year));
    form.append('aoId', aoId);
    form.append('category', category);
    setUploading(true); setMessage(null);
    try {
      const res = await fetch('/api/ged', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Dépôt impossible.');
      setMessage({ ok: true, text: 'Document déposé dans le dossier AO.' });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Erreur pendant le dépôt.' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (doc: DocumentItem) => {
    if (!window.confirm(`Supprimer définitivement « ${doc.fileName} » ?`)) return;
    try {
      const res = await fetch(`/api/ged?pathname=${encodeURIComponent(doc.pathname)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Suppression impossible.');
      setMessage({ ok: true, text: 'Document supprimé.' });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Erreur de suppression.' });
    }
  };

  const openUrl = (doc: DocumentItem, download = false) => {
    const url = `/api/ged/file?pathname=${encodeURIComponent(doc.pathname)}${download ? '&download=1' : ''}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const formatSize = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1024 / 1024).toFixed(2)} Mo`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-900 to-violet-900 p-5 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><FolderOpen className="w-6 h-6" /></div>
          <div><h1 className="text-xl font-bold">GED – Gestion documentaire des AO</h1><p className="text-xs text-indigo-200">Exercice {year} · Documents PDF classés par appel d’offres</p></div>
        </div>
        <Badge className="bg-white/15 text-white border-0">{documents.length} document(s)</Badge>
      </div>

      <Card className="border-slate-200 shadow-sm"><CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)] gap-3">
          <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">Appel d’offres</label>
            <select value={aoId} onChange={e => setAoId(e.target.value)} className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="all">Tous les appels d’offres</option>
              {projects.map(p => <option key={p.id} value={String(p.id)}>AO {p.numAO || p.id} – {p.entite} – {p.objet.slice(0, 75)}</option>)}
            </select>
          </div>
          <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">Type de document à déposer</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        {selectedProject && <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-900"><strong>AO {selectedProject.numAO || selectedProject.id} / {selectedProject.entite}</strong><p className="mt-1">{selectedProject.objet}</p></div>}
        {isAdmin ? <div className="flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => upload(e.target.files?.[0])} />
          <Button disabled={uploading || aoId === 'all'} onClick={() => inputRef.current?.click()} className="gap-2"><UploadCloud className="w-4 h-4"/>{uploading ? 'Dépôt en cours…' : 'Ajouter un PDF'}</Button>
          <span className="text-xs text-slate-500">PDF uniquement · 4 Mo maximum · accès réservé aux utilisateurs connectés</span>
        </div> : <p className="text-xs text-slate-500">Consultation uniquement. Le dépôt et la suppression sont réservés à l’administrateur.</p>}
        {message && <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}><AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>{message.text}</div>}
      </CardContent></Card>

      <Card className="border-slate-200 shadow-sm"><CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold text-slate-800">Documents archivés</h2><p className="text-xs text-slate-500">{visibleDocuments.length} document(s) correspondant au filtre</p></div><Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>Actualiser</Button></div>
        {loading ? <div className="py-10 text-center text-sm text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2"/>Chargement…</div> :
        visibleDocuments.length ? <div className="divide-y divide-slate-100">{visibleDocuments.map(doc => {
          const project = projects.find(p => String(p.id) === doc.aoId);
          const label = CATEGORIES.find(c => c.value === doc.category)?.label || doc.category;
          return <div key={doc.pathname} className="py-3 flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><FileText className="w-5 h-5"/></div>
            <div className="flex-1 min-w-[220px]"><p className="text-sm font-semibold text-slate-800 break-all">{doc.fileName}</p><p className="text-xs text-slate-500">{label} · AO {project?.numAO || doc.aoId} · {project?.entite || 'Entité inconnue'} · {formatSize(doc.size)}</p><p className="text-[10px] text-slate-400">{new Date(doc.uploadedAt).toLocaleString('fr-FR')}</p></div>
            <div className="flex items-center gap-1"><Button size="icon" variant="outline" title="Consulter" onClick={() => openUrl(doc)}><Eye className="w-4 h-4"/></Button><Button size="icon" variant="outline" title="Télécharger" onClick={() => openUrl(doc,true)}><Download className="w-4 h-4"/></Button>{isAdmin && <Button size="icon" variant="outline" title="Supprimer" onClick={() => remove(doc)} className="text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4"/></Button>}</div>
          </div>;
        })}</div> : <div className="py-12 text-center text-slate-400"><FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-40"/><p className="text-sm font-medium">Aucun document dans ce dossier</p><p className="text-xs mt-1">Sélectionnez un AO et déposez son CPS, RC ou ses PV.</p></div>}
      </CardContent></Card>
    </div>
  );
}
