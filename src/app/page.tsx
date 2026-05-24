'use client';

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  RefreshCw, TrendingUp, TrendingDown, FileText, DollarSign,
  CheckCircle2, Clock, AlertCircle, XCircle, Search,
  BarChart3, PieChart as PieChartIcon, Activity, Building2,
  CalendarDays, ArrowUpRight, ArrowDownRight, Upload, FileSpreadsheet,
  CloudUpload, AlertTriangle, CheckCircle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  X, ClipboardList, History, Download, Printer, Send, Wallet, Shield, Eye, Users, UserCheck, UserX, LogOut,
  Scale, Gavel, FileCheck, FileX, Ban, Megaphone, FileSignature, ListTodo,
  Timer, ArrowLeftRight
} from 'lucide-react';

/* ── Types ────────────────────────────────────────────── */
interface PPMProject {
  id: number;
  typeBudget: string;
  natureBudget: string;
  sourceFinancement?: string | null;
  programme?: string | null;
  projet?: string | null;
  delaisExecution?: string | null;
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
  delaisExecution: string | null;
}

interface Soumissionnaire {
  semaine: string;
  seance: string;
  objetSeance: string;
  president: string;
  nom: string | null;
  decisionCommission: string;
  offreFinanciere: string | null;
  decisionCommissionOF: string;
}

interface SoumissionnaireProjet {
  numAO: string;
  entite: string;
  numAOComplet: string;
  objetAO: string;
  nbSoumissionnaires: number;
  nbSoumissionnairesUniques: number;
  soumissionnaires: Soumissionnaire[];
}

interface SoumissionnaireData {
  lastUpdated: string;
  fileName: string;
  totalProjets: number;
  totalSoumissionnaires: number;
  projets: Record<string, SoumissionnaireProjet>;
}

interface KPIs {
  totalProjects: number;
  totalCP: number;
  totalCE: number;
  totalBudget: number;
  totalEstimation: number;
  totalEngagement: number;
  totalMontantExtrait: number;
  engagementRate: number;
  extractionRate: number;
}

interface PPMData {
  lastUpdated: string;
  fileChecksum?: string;
  fileName?: string;
  fileLastModified?: string;
  fileSize?: number;
  dataSaved?: boolean;
  projects: PPMProject[];
  kpis: KPIs;
  statusCount: Record<string, number>;
  entityBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }>;
  natureBudget: Record<string, { cp: number; ce: number; count: number }>;
  typeBudget: Record<string, { cp: number; ce: number; count: number }>;
  monthlyTimeline: Record<string, { count: number; estimation: number; engagement: number }>;
  entityEngagementRate: Record<string, number>;
}

/* ── Helpers ──────────────────────────────────────────── */
const isAdmisDecision = (d: string | null | undefined): boolean => {
  if (!d) return false;
  return d === 'Admis' || d.includes('Admis') || d.includes('acceptables') || d.includes('retenue');
};

const isEcarteDecision = (d: string | null | undefined): boolean => {
  if (!d) return false;
  return d.includes('Ecarté');
};

const isReporteeDecision = (d: string | null | undefined): boolean => {
  if (!d) return false;
  return d.includes('reportée') || d.includes('reporté');
};

const isAnnuleDecision = (d: string | null | undefined): boolean => {
  if (!d) return false;
  return d.includes('Annulé') || d.includes('Pas de soumissionnaires');
};

// Count unique soumissionnaires by their "best" decision across all séances
// Admis = has at least one "Admis" decision; Ecarté = only "Ecarté" decisions; En attente = neither
const countUniqueByDecision = (soumissionnaires: Soumissionnaire[]): { admis: number; ecarts: number; enAttente: number; reportee: number; annule: number } => {
  const byName: Record<string, { hasAdmis: boolean; hasEcarte: boolean; hasReportee: boolean; hasAnnule: boolean }> = {};
  soumissionnaires.forEach(s => {
    if (!s.nom) return;
    if (!byName[s.nom]) byName[s.nom] = { hasAdmis: false, hasEcarte: false, hasReportee: false, hasAnnule: false };
    if (isAdmisDecision(s.decisionCommission)) byName[s.nom].hasAdmis = true;
    if (isEcarteDecision(s.decisionCommission)) byName[s.nom].hasEcarte = true;
    if (isReporteeDecision(s.decisionCommission)) byName[s.nom].hasReportee = true;
    if (isAnnuleDecision(s.decisionCommission)) byName[s.nom].hasAnnule = true;
  });
  let admis = 0, ecarts = 0, enAttente = 0, reportee = 0, annule = 0;
  Object.values(byName).forEach(v => {
    if (v.hasAdmis) admis++;
    else if (v.hasEcarte) ecarts++;
    else if (v.hasReportee) reportee++;
    else if (v.hasAnnule) annule++;
    else enAttente++;
  });
  return { admis, ecarts, enAttente, reportee, annule };
};

const fmtM = (n: number) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' MDH';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' MDH';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' KDH';
  return n.toLocaleString('fr-FR') + ' DH';
};

// Tooltip for AO numbers containing "ex" (e.g. "25 ex 2" = AO 25 relaunched after AO 2 was cancelled/unsuccessful)
const exAOTitle = (numAO: string | number | null): string | undefined => {
  if (!numAO || !String(numAO).includes('ex')) return undefined;
  const parts = String(numAO).split('ex');
  const newAO = parts[0].trim();
  const refAO = parts[1]?.trim();
  return `AO n°${newAO} relancé suite au jugement de l'AO n°${refAO} (annulé ou infructueux)`;
};

// Helper: extract base AO number (strip "ex" suffix and anything after)
const getBaseAONumber = (numAO: string): string => {
  const exIndex = numAO.indexOf('ex');
  if (exIndex === -1) return numAO.trim();
  return numAO.substring(0, exIndex).trim();
};

// Helper: find PPM project matching a soumissionnaire project
// Handles "ex" notation: soum numAO="25" can match PPM numAO="25 ex 2" and vice versa
const findPPMForSoum = (projects: PPMProject[] | undefined, numAO: string, entite: string): PPMProject | undefined => {
  if (!projects) return undefined;
  // 1. Exact match
  let match = projects.find(p => String(p.numAO) === numAO && p.entite === entite);
  if (match) return match;
  // 2. If soum numAO doesn't have "ex", try matching PPM entries that start with numAO + " ex"
  if (!numAO.includes('ex')) {
    match = projects.find(p => {
      const pNum = String(p.numAO);
      return pNum.startsWith(numAO + ' ex') && p.entite === entite;
    });
    if (match) return match;
  }
  // 3. If soum numAO has "ex", try matching PPM entries by base AO number
  if (numAO.includes('ex')) {
    const baseAO = getBaseAONumber(numAO);
    match = projects.find(p => {
      const pNum = String(p.numAO);
      return (pNum === baseAO || pNum.startsWith(baseAO + ' ex')) && p.entite === entite;
    });
    if (match) return match;
  }
  // 4. Fallback: try matching by base AO number on both sides
  const soumBase = getBaseAONumber(numAO);
  match = projects.find(p => {
    const ppmBase = getBaseAONumber(String(p.numAO));
    return soumBase === ppmBase && p.entite === entite;
  });
  return match;
};

const fmtMDH = (n: number) => (n / 1_000_000).toFixed(2) + ' MDH';
const fmtNum = (n: number) => (n / 1_000_000).toFixed(2);

// Compute AO status indicators for a group of projects
const computeAOIndicators = (projects: PPMProject[]) => {
  const nbOuvert = projects.filter(p => ['En cours de jugement','Jugé','Engagé','Infructueux','Annulé'].includes(p.situationAvancement)).length;
  const nbJuge = projects.filter(p => p.situationAvancement === 'Jugé' || p.situationAvancement === 'En cours de jugement').length;
  const nbEngage = projects.filter(p => p.situationAvancement === 'Engagé').length;
  const nbInfructueux = projects.filter(p => p.situationAvancement === 'Infructueux').length;
  const nbAnnule = projects.filter(p => p.situationAvancement === 'Annulé').length;
  const nbPublie = projects.filter(p => p.situationAvancement === 'Publié sur PMP').length;
  const nbDaoCE = projects.filter(p => p.situationAvancement === 'DAO Envoyé au CE').length;
  const nbProgrammer = projects.filter(p => p.situationAvancement === 'A programmer').length;
  const engCP = projects.reduce((s, p) => s + (p.engagementCP || 0), 0);
  const engCE = projects.reduce((s, p) => s + (p.engagementCE || 0), 0);
  return { nbOuvert, nbJuge, nbEngage, nbInfructueux, nbAnnule, nbPublie, nbDaoCE, nbProgrammer, engCP, engCE };
};

// Reusable AO indicator header columns
const aoIndicatorHeaders = () => (
  <>
    <th className="px-3 py-2.5 text-center text-blue-500">Ouvert</th>
    <th className="px-3 py-2.5 text-center text-amber-500">Jugé</th>
    <th className="px-3 py-2.5 text-center text-green-500">Engagé</th>
    <th className="px-3 py-2.5 text-center text-red-500">Infruct.</th>
    <th className="px-3 py-2.5 text-center text-slate-400">Annulé</th>
    <th className="px-3 py-2.5 text-center text-violet-500">Publié</th>
    <th className="px-3 py-2.5 text-center text-cyan-500">DAO CE</th>
    <th className="px-3 py-2.5 text-center text-gray-400">Progr.</th>
  </>
);

// Reusable AO indicator cells for a row
const aoIndicatorCells = (ind: ReturnType<typeof computeAOIndicators>) => (
  <>
    <td className="px-3 py-2.5 text-center">{ind.nbOuvert > 0 ? <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">{ind.nbOuvert}</Badge> : <span className="text-slate-300">—</span>}</td>
    <td className="px-3 py-2.5 text-center">{ind.nbJuge > 0 ? <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{ind.nbJuge}</Badge> : <span className="text-slate-300">—</span>}</td>
    <td className="px-3 py-2.5 text-center">{ind.nbEngage > 0 ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">{ind.nbEngage}</Badge> : <span className="text-slate-300">—</span>}</td>
    <td className="px-3 py-2.5 text-center">{ind.nbInfructueux > 0 ? <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">{ind.nbInfructueux}</Badge> : <span className="text-slate-300">—</span>}</td>
    <td className="px-3 py-2.5 text-center">{ind.nbAnnule > 0 ? <Badge className="bg-slate-200 text-slate-600 border-0 text-[10px]">{ind.nbAnnule}</Badge> : <span className="text-slate-300">—</span>}</td>
    <td className="px-3 py-2.5 text-center">{ind.nbPublie > 0 ? <Badge className="bg-violet-100 text-violet-700 border-0 text-[10px]">{ind.nbPublie}</Badge> : <span className="text-slate-300">—</span>}</td>
    <td className="px-3 py-2.5 text-center">{ind.nbDaoCE > 0 ? <Badge className="bg-cyan-100 text-cyan-700 border-0 text-[10px]">{ind.nbDaoCE}</Badge> : <span className="text-slate-300">—</span>}</td>
    <td className="px-3 py-2.5 text-center">{ind.nbProgrammer > 0 ? <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">{ind.nbProgrammer}</Badge> : <span className="text-slate-300">—</span>}</td>
  </>
);

// Reusable engagement rate cell (progress bar + percentage)
const tauxEngagementCell = (numerator: number, denominator: number) => {
  const rate = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
  return (
    <td className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
        </div>
        <span className={`font-bold w-8 text-right text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
      </div>
    </td>
  );
};

const fmtFull = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtFileSize = (bytes: number) => {
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' Mo';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' Ko';
  return bytes + ' octets';
};

const statusColor: Record<string, string> = {
  'Ouvert': '#3b82f6',
  'Engagé': '#16a34a',
  'Jugé': '#2563eb',
  'En cours de jugement': '#d97706',
  'En cours de jugement des offres': '#e97c16',
  'Publié sur PMP': '#7c3aed',
  'Publié PPM': '#7c3aed',
  'DAO Envoyé au CE': '#0891b2',
  'A programmer': '#6b7280',
  'Infructueux': '#dc2626',
  'Annulé': '#991b1b',
};

const statusIcon: Record<string, React.ReactNode> = {
  'Ouvert': <CalendarDays className="w-3.5 h-3.5" />,
  'Engagé': <CheckCircle2 className="w-3.5 h-3.5" />,
  'Jugé': <CheckCircle2 className="w-3.5 h-3.5" />,
  'En cours de jugement': <Clock className="w-3.5 h-3.5" />,
  'En cours de jugement des offres': <Clock className="w-3.5 h-3.5" />,
  'Publié sur PMP': <Activity className="w-3.5 h-3.5" />,
  'Publié PPM': <Activity className="w-3.5 h-3.5" />,
  'DAO Envoyé au CE': <Send className="w-3.5 h-3.5" />,
  'A programmer': <AlertCircle className="w-3.5 h-3.5" />,
  'Infructueux': <XCircle className="w-3.5 h-3.5" />,
  'Annulé': <XCircle className="w-3.5 h-3.5" />,
};

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be185d'];

const monthLabel = (m: string) => {
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const parts = m.split('-');
  if (parts.length < 2) return m;
  const [y, mm] = parts;
  const monthIdx = parseInt(mm) - 1;
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return m;
  return months[monthIdx] + ' ' + y.slice(2);
};

/* ── AnimatedNumber Component ──────────────────────────── */
function AnimatedNumber({ value, duration = 1200, format }: { value: number; duration?: number; format?: 'number' | 'mdh' | 'amount' }) {
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  const [display, setDisplay] = useState(safeValue);
  const prevValue = useRef(safeValue);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = prevValue.current;
    const end = safeValue;
    const diff = end - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = format === 'mdh' ? +(start + diff * eased).toFixed(2) : Math.round(start + diff * eased);
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevValue.current = end;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [safeValue, duration, format]);

  if (format === 'mdh') return <>{display.toFixed(2)}</>;
  if (format === 'number') return <>{display.toLocaleString('fr-FR')}</>;
  return <>{fmtM(display)}</>;
}

/* ── Custom Tooltip ───────────────────────────────────── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-xl px-4 py-3 shadow-xl animate-fade-in-up" style={{ animationDuration: '0.2s' }}>
      <p className="text-sm font-semibold text-gray-800 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs flex items-center gap-2 text-gray-600">
          <span className="w-2.5 h-2.5 rounded-full inline-block shadow-sm" style={{ background: p.color }} />
          {p.name} : <strong className="text-gray-900">{fmtM(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

/* ── Upload Component ─────────────────────────────────── */
function FileUploader({ onUploadSuccess }: { onUploadSuccess: (data: PPMData) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const validExts = ['.xlsx', '.xls'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) {
      setUploadResult({ success: false, message: 'Format non supporté. Utilisez .xlsx ou .xls' });
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ppm', { method: 'POST', body: formData });
      const json = await res.json();

      if (res.ok && json.uploadSuccess) {
        setUploadResult({ success: true, message: json.message });
        onUploadSuccess(json);
      } else {
        setUploadResult({ success: false, message: json.error || 'Erreur inconnue' });
      }
    } catch {
      setUploadResult({ success: false, message: 'Erreur réseau lors du chargement' });
    } finally {
      setUploading(false);
    }
  }, [onUploadSuccess]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer
        ${isDragging
          ? 'border-blue-500 bg-blue-50/60 scale-[1.02] shadow-lg shadow-blue-100'
          : 'border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30'
        }
        ${uploading ? 'pointer-events-none opacity-60' : ''}
      `}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleInputChange}
      />

      {uploading ? (
        <div className="space-y-3">
          <div className="relative w-14 h-14 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm font-medium text-blue-600">Chargement en cours...</p>
          <p className="text-xs text-slate-400">Analyse du fichier Excel</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center transition-all duration-300
            ${isDragging ? 'bg-blue-100 scale-110' : 'bg-gradient-to-br from-blue-50 to-blue-100'}`}>
            {isDragging ? (
              <CloudUpload className="w-8 h-8 text-blue-500 animate-bounce" />
            ) : (
              <FileSpreadsheet className="w-8 h-8 text-blue-500" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {isDragging ? 'Déposez le fichier ici' : 'Glissez-déposez votre fichier Excel'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ou <span className="text-blue-500 underline font-medium">cliquez pour parcourir</span>
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
            <Badge variant="outline" className="text-[9px] h-5">.xlsx</Badge>
            <Badge variant="outline" className="text-[9px] h-5">.xls</Badge>
          </div>
        </div>
      )}

      {uploadResult && (
        <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm transition-all duration-300
          ${uploadResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {uploadResult.success ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span className="text-xs font-medium">{uploadResult.message}</span>
        </div>
      )}
    </div>
  );
}

/* ── Live Clock Component ─────────────────────────────── */
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-[10px] font-mono text-slate-400">
      {time.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
      {' · '}
      {time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

/* ── Sparkline Component ──────────────────────────────── */
function Sparkline({ data, color, width = 60, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Skeleton Card for Loading ─────────────────────────── */
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-xl animate-shimmer" />
        <div className="w-16 h-4 rounded animate-shimmer" />
      </div>
      <div className="w-24 h-6 rounded animate-shimmer" />
      <div className="w-32 h-3 rounded animate-shimmer" />
      <div className="w-full h-3 rounded animate-shimmer" />
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────── */
export default function Dashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  
  const [data, setData] = useState<PPMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [filterNature, setFilterNature] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterProgramme, setFilterProgramme] = useState('all');
  const [filterProjet, setFilterProjet] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterAttributaire, setFilterAttributaire] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [fileChanged, setFileChanged] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const lastChecksumRef = useRef<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'entity' | 'step' | 'history' | 'soumissionnaires' | 'reports' | 'alerts' | 'delais' | 'dashboard'>('dashboard');
  const [expandedAO, setExpandedAO] = useState<number | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarStatusFilter, setSidebarStatusFilter] = useState('all');
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reportType, setReportType] = useState<string>('synthese');
  const [expandedReportEntity, setExpandedReportEntity] = useState<string | null>(null);
  const [soumissionnaireData, setSoumissionnaireData] = useState<SoumissionnaireData | null>(null);
  const [selectedSoumProjet, setSelectedSoumProjet] = useState<SoumissionnaireProjet | null>(null);
  const [showSoumModal, setShowSoumModal] = useState(false);
  const [showSoumUpload, setShowSoumUpload] = useState(false);
  const [soumUploading, setSoumUploading] = useState(false);
  const [soumUploadResult, setSoumUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  /* ── Pipeline Order & Status Mapping ── */
  const PIPELINE_ORDER = ['Ouvert','En cours de jugement','Jugé','Engagé','Infructueux','Annulé','Publié PPM','DAO Envoyé au CE','A programmer'] as const;
  const PIPELINE_STATUS_MAP: Record<string, string> = {
    'Ouvert': '__computed__',
    'En cours de jugement': 'En cours de jugement',
    'Jugé': 'Jugé',
    'Engagé': 'Engagé',
    'Infructueux': 'Infructueux',
    'Annulé': 'Annulé',
    'Publié PPM': 'Publié sur PMP',
    'DAO Envoyé au CE': 'DAO Envoyé au CE',
    'A programmer': 'A programmer',
  };

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch('/api/ppm');
      if (res.ok) {
        const json = await res.json();
        if (json.projects && json.projects.length > 0) {
          setData(json);
          lastChecksumRef.current = json.fileChecksum || null;
          setFileChanged(false);
        } else {
          await fetchStaticJsonFallback();
        }
      } else {
        await fetchStaticJsonFallback();
      }
    } catch (e) {
      console.error('API fetch error, trying static JSON fallback:', e);
      await fetchStaticJsonFallback();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchStaticJsonFallback = useCallback(async () => {
    try {
      const res = await fetch('/data/ppm.json');
      if (res.ok) {
        const json = await res.json();
        if (json.projects && json.projects.length > 0) {
          setData(json);
          lastChecksumRef.current = json.fileChecksum || null;
          setFileChanged(false);
        }
      }
    } catch (e2) {
      console.error('Static JSON fallback also failed:', e2);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Mark mounted for animation
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Intelligent auto-refresh: check checksum every 5s, full data fetch only if changed
  useEffect(() => {
    if (!autoRefresh || !lastChecksumRef.current) return;

    const checkInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/ppm', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checksum: lastChecksumRef.current }),
        });
        const json = await res.json();
        if (json.changed) {
          setFileChanged(true);
          // Auto-fetch new data
          const dataRes = await fetch('/api/ppm');
          const newData = await dataRes.json();
          if (dataRes.ok) {
            setData(newData);
            lastChecksumRef.current = newData.fileChecksum || null;
            setFileChanged(false);
          }
        }
      } catch {
        // silently ignore
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [autoRefresh]);

  const handleUploadSuccess = useCallback((newData: PPMData) => {
    setData(newData);
    lastChecksumRef.current = newData.fileChecksum || null;
    setShowUpload(false);
  }, []);

  /* ── Fetch Soumissionnaire Data ── */
  const fetchSoumissionnaires = useCallback(async () => {
    try {
      const res = await fetch('/api/soumissionnaires');
      if (res.ok) {
        const json = await res.json();
        setSoumissionnaireData(json);
      } else {
        // Fallback to static JSON
        const fallbackRes = await fetch('/data/soumissionnaires.json');
        if (fallbackRes.ok) {
          const json = await fallbackRes.json();
          setSoumissionnaireData(json);
        }
      }
    } catch (e) {
      // Try static JSON fallback
      try {
        const fallbackRes = await fetch('/data/soumissionnaires.json');
        if (fallbackRes.ok) {
          const json = await fallbackRes.json();
          setSoumissionnaireData(json);
        }
      } catch (e2) {
        console.error('Soumissionnaire data fetch failed:', e2);
      }
    }
  }, []);

  // Load soumissionnaire data on mount
  useEffect(() => {
    fetchSoumissionnaires();
  }, [fetchSoumissionnaires]);

  /* ── Open soumissionnaire modal for a project ── */
  const openSoumModal = useCallback((numAO: string | number | null, entite: string) => {
    if (!soumissionnaireData || !numAO) return;
    const key = String(numAO) + '/' + entite;
    const projet = soumissionnaireData.projets[key];
    if (projet) {
      setSelectedSoumProjet(projet);
      setShowSoumModal(true);
    }
  }, [soumissionnaireData]);

  /* ── Upload soumissionnaire Excel ── */
  const handleSoumUpload = useCallback(async (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      setSoumUploadResult({ success: false, message: 'Format non supporté. Utilisez .xlsx ou .xls' });
      return;
    }
    setSoumUploading(true);
    setSoumUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/soumissionnaires', { method: 'POST', body: formData });
      const json = await res.json();
      if (res.ok && json.success) {
        setSoumUploadResult({ success: true, message: json.message || 'Fichier soumissionnaires mis à jour avec succès' });
        // Refresh soumissionnaire data
        await fetchSoumissionnaires();
        setTimeout(() => { setShowSoumUpload(false); setSoumUploadResult(null); }, 2000);
      } else {
        setSoumUploadResult({ success: false, message: json.error || 'Erreur lors du chargement' });
      }
    } catch {
      setSoumUploadResult({ success: false, message: 'Erreur réseau lors du chargement' });
    } finally {
      setSoumUploading(false);
    }
  }, [fetchSoumissionnaires]);

  // Reset expanded when filters change
  useEffect(() => {
    setExpandedRow(null);
  }, [filterStatus, filterEntity, filterNature, filterType, filterProgramme, filterProjet, filterSource, filterAttributaire, searchTerm]);

  /* ── exportToExcel - MUST be before early return (Rules of Hooks) ── */
  const exportToExcel = useCallback(() => {
    if (!data) return;
    const projectsToExport = data.projects;
    const headers = ['#', 'Entité', 'Objet', 'Nature', 'Type', 'CP', 'CE', 'Estimation', 'Statut', 'Ouverture Plis', 'Jugement', 'Engagement', 'Engagé le', 'Montant Engagement', 'Engag. CP', 'Engag. CE', 'Montant Extrait', 'Attributaire', 'N° AO', 'N° Marché'];
    const rows = projectsToExport.map(p => [
      p.id, p.entite, `"${p.objet.replace(/"/g, '""')}"`, p.natureBudget, p.typeBudget,
      p.cp || '', p.ce || '', p.estimationAdmin || '',
      p.situationAvancement, p.dateOuverture || '', p.dateJugement || '', p.montantEngagement || '',
      p.dateEngagement || '', p.montantEngagement || '', p.engagementCP || '', p.engagementCE || '',
      p.montantExtrait || '', p.attributaire || '', p.numAO || '', p.numMarche || ''
    ]);
    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PPM_2026_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data]);

  /* ── Auth guard ── */
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <BarChart3 className="w-6 h-6 text-white animate-pulse" />
          </div>
          <p className="text-sm text-gray-400">Vérification de l&apos;authentification...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  /* ── Premium Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dot-pattern">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header skeleton */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl animate-shimmer" />
            <div className="space-y-2">
              <div className="w-48 h-6 rounded animate-shimmer" />
              <div className="w-32 h-3 rounded animate-shimmer" />
            </div>
          </div>
          {/* Filter skeleton */}
          <div className="rounded-xl p-4 mb-6 border border-slate-100 bg-white/70">
            <div className="flex gap-3">
              <div className="flex-1 h-10 rounded-lg animate-shimmer" />
              <div className="w-36 h-10 rounded-lg animate-shimmer" />
              <div className="w-36 h-10 rounded-lg animate-shimmer" />
            </div>
          </div>
          {/* KPI skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[1,2,3,4,5].map(i => (
              <SkeletonCard key={i} />
            ))}
          </div>
          {/* Chart skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1,2].map(i => (
              <div key={i} className="rounded-xl border border-slate-100 bg-white p-5">
                <div className="w-48 h-4 rounded animate-shimmer mb-4" />
                <div className="w-full h-72 rounded-lg animate-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── No data state ── */
  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Chargement des données</h2>
          <p className="text-sm text-slate-500 max-w-md">Impossible de charger les données du PPM. Veuillez vérifier que les fichiers Excel sont disponibles ou réessayez.</p>
          <button
            onClick={() => fetchData(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const { projects, kpis, statusCount, entityBudget, natureBudget, typeBudget, monthlyTimeline, entityEngagementRate } = data;

  /* ── Filtered projects ── */
  const filtered = projects.filter(p => {
    const matchSearch = !searchTerm ||
      p.objet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.entite.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.attributaire?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.situationAvancement === filterStatus;
    const matchEntity = filterEntity === 'all' || p.entite === filterEntity;
    const matchNature = filterNature === 'all' || p.natureBudget === filterNature;
    const matchType = filterType === 'all' || p.typeBudget === filterType;
    const matchProgramme = filterProgramme === 'all' || p.programme === filterProgramme;
    const matchProjet = filterProjet === 'all' || p.projet === filterProjet;
    const matchSource = filterSource === 'all' || p.sourceFinancement === filterSource;
    const matchAttributaire = filterAttributaire === 'all' || p.attributaire === filterAttributaire;
    return matchSearch && matchStatus && matchEntity && matchNature && matchType && matchProgramme && matchProjet && matchSource && matchAttributaire;
  });

  const entities = [...new Set(projects.map(p => p.entite))].sort();
  const natures = [...new Set(projects.map(p => p.natureBudget))].sort();
  const types = [...new Set(projects.map(p => p.typeBudget))].sort();
  const programmes = [...new Set(projects.map(p => p.programme).filter(Boolean))].sort();
  const projets = [...new Set(projects.map(p => p.projet).filter(Boolean))].sort();
  const sources = [...new Set(projects.map(p => p.sourceFinancement).filter(Boolean))].sort();
  const attributaires = [...new Set(projects.map(p => p.attributaire).filter(Boolean))].sort();
  const statuses = [...new Set(projects.map(p => p.situationAvancement))].sort((a, b) => {
    const aIdx = PIPELINE_ORDER.findIndex(p => (PIPELINE_STATUS_MAP[p] || p) === a);
    const bIdx = PIPELINE_ORDER.findIndex(p => (PIPELINE_STATUS_MAP[p] || p) === b);
    const aOrder = aIdx >= 0 ? aIdx : PIPELINE_ORDER.length;
    const bOrder = bIdx >= 0 ? bIdx : PIPELINE_ORDER.length;
    return aOrder - bOrder;
  });

  // Today for filtering daily openings and Ouvert status
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper: check if a date string is valid YYYY-MM-DD
  const isValidDate = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

  // Ouvert projects: dateOuverture exists AND <= today
  const ouvertProjects = filtered.filter(p => isValidDate(p.dateOuverture) && new Date(p.dateOuverture) <= today);

  // Daily openings computation for sidebar history tab — only dates <= today
  const dailyOpenings: Record<string, PPMProject[]> = {};
  filtered.forEach(p => {
    if (isValidDate(p.dateOuverture)) {
      const openingDate = new Date(p.dateOuverture);
      openingDate.setHours(0, 0, 0, 0);
      if (openingDate <= today) {
        if (!dailyOpenings[p.dateOuverture]) dailyOpenings[p.dateOuverture] = [];
        dailyOpenings[p.dateOuverture].push(p);
      }
    }
  });
  const sortedDailyOpenings = Object.entries(dailyOpenings).sort(([a], [b]) => a.localeCompare(b));

  // Compute KPIs from filtered data
  const filteredKpis = {
    totalProjects: filtered.length,
    totalCP: filtered.reduce((s, p) => s + (p.cp || 0), 0),
    totalCE: filtered.reduce((s, p) => s + (p.ce || 0), 0),
    totalBudget: filtered.reduce((s, p) => s + (p.cp || 0) + (p.ce || 0), 0),
    totalEstimation: filtered.reduce((s, p) => s + (p.estimationAdmin || 0), 0),
    totalEngagement: filtered.reduce((s, p) => s + (p.montantEngagement || 0), 0),
    totalEngagementCP: filtered.reduce((s, p) => s + (p.engagementCP || 0), 0),
    totalEngagementCE: filtered.reduce((s, p) => s + (p.engagementCE || 0), 0),
    totalMontantExtrait: filtered.reduce((s, p) => s + (p.montantExtrait || 0), 0),
  };
  // AO Ouvert group: En cours de jugement, Jugé, Engagé, Infructueux, Annulé
  const aoOuvertFilter = (p: Project) => ['En cours de jugement','Jugé','Engagé','Infructueux','Annulé'].includes(p.situationAvancement);
  const aoOuvertCount = filtered.filter(aoOuvertFilter).length;
  const aoOuvertEstimation = filtered.filter(aoOuvertFilter).reduce((s, p) => s + (p.estimationAdmin || 0), 0);
  const aoOuvertEngagement = filtered.filter(aoOuvertFilter).reduce((s, p) => s + (p.montantEngagement || 0), 0);
  const aoOuvertCP = filtered.filter(aoOuvertFilter).reduce((s, p) => s + (p.cp || 0), 0);
  const aoOuvertCE = filtered.filter(aoOuvertFilter).reduce((s, p) => s + (p.ce || 0), 0);
  const aoOuvertEngCP = filtered.filter(aoOuvertFilter).reduce((s, p) => s + (p.engagementCP || 0), 0);
  const aoOuvertEngCE = filtered.filter(aoOuvertFilter).reduce((s, p) => s + (p.engagementCE || 0), 0);
  // AO Restants group: Publié PPM, DAO Envoyé au CE, À programmer
  const aoRestantsFilter = (p: Project) => ['Publié sur PMP','DAO Envoyé au CE','A programmer'].includes(p.situationAvancement);
  const aoRestantsCount = filtered.filter(aoRestantsFilter).length;
  const aoRestantsEstimation = filtered.filter(aoRestantsFilter).reduce((s, p) => s + (p.estimationAdmin || 0), 0);
  const aoRestantsCP = filtered.filter(aoRestantsFilter).reduce((s, p) => s + (p.cp || 0), 0);
  const aoRestantsCE = filtered.filter(aoRestantsFilter).reduce((s, p) => s + (p.ce || 0), 0);
  const aoRestantsEngCP = filtered.filter(aoRestantsFilter).reduce((s, p) => s + (p.engagementCP || 0), 0);
  const aoRestantsEngCE = filtered.filter(aoRestantsFilter).reduce((s, p) => s + (p.engagementCE || 0), 0);
  // Programme budget aggregation
  const filteredProgrammeBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  filtered.forEach(p => {
    if (!filteredProgrammeBudget[p.programme]) filteredProgrammeBudget[p.programme] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    filteredProgrammeBudget[p.programme].cp += p.cp || 0;
    filteredProgrammeBudget[p.programme].ce += p.ce || 0;
    filteredProgrammeBudget[p.programme].estimation += p.estimationAdmin || 0;
    filteredProgrammeBudget[p.programme].engagement += p.montantEngagement || 0;
    filteredProgrammeBudget[p.programme].count += 1;
  });
  const programmeData = Object.entries(filteredProgrammeBudget).map(([name, d]) => ({
    name,
    cp: Math.round(d.cp),
    ce: Math.round(d.ce),
    estimation: Math.round(d.estimation),
    engagement: Math.round(d.engagement),
    count: d.count,
  }));
  const filteredStatusCount: Record<string, number> = {};
  const filteredStatusBudget: Record<string, { estimation: number; engagement: number }> = {};
  filtered.forEach(p => {
    filteredStatusCount[p.situationAvancement] = (filteredStatusCount[p.situationAvancement] || 0) + 1;
    if (!filteredStatusBudget[p.situationAvancement]) filteredStatusBudget[p.situationAvancement] = { estimation: 0, engagement: 0 };
    filteredStatusBudget[p.situationAvancement].estimation += p.estimationAdmin || 0;
    filteredStatusBudget[p.situationAvancement].engagement += p.montantEngagement || 0;
  });
  const filteredEntityBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  filtered.forEach(p => {
    if (!filteredEntityBudget[p.entite]) filteredEntityBudget[p.entite] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    filteredEntityBudget[p.entite].cp += p.cp || 0;
    filteredEntityBudget[p.entite].ce += p.ce || 0;
    filteredEntityBudget[p.entite].estimation += p.estimationAdmin || 0;
    filteredEntityBudget[p.entite].engagement += p.montantEngagement || 0;
    filteredEntityBudget[p.entite].count += 1;
  });
  const filteredNatureBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  filtered.forEach(p => {
    if (!filteredNatureBudget[p.natureBudget]) filteredNatureBudget[p.natureBudget] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    filteredNatureBudget[p.natureBudget].cp += p.cp || 0;
    filteredNatureBudget[p.natureBudget].ce += p.ce || 0;
    filteredNatureBudget[p.natureBudget].estimation += p.estimationAdmin || 0;
    filteredNatureBudget[p.natureBudget].engagement += p.montantEngagement || 0;
    filteredNatureBudget[p.natureBudget].count += 1;
  });
  const filteredTypeBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  filtered.forEach(p => {
    if (!filteredTypeBudget[p.typeBudget]) filteredTypeBudget[p.typeBudget] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    filteredTypeBudget[p.typeBudget].cp += p.cp || 0;
    filteredTypeBudget[p.typeBudget].ce += p.ce || 0;
    filteredTypeBudget[p.typeBudget].estimation += p.estimationAdmin || 0;
    filteredTypeBudget[p.typeBudget].engagement += p.montantEngagement || 0;
    filteredTypeBudget[p.typeBudget].count += 1;
  });
  const filteredSourceBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  filtered.forEach(p => {
    const src = p.sourceFinancement || 'Non spécifié';
    if (!filteredSourceBudget[src]) filteredSourceBudget[src] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    filteredSourceBudget[src].cp += p.cp || 0;
    filteredSourceBudget[src].ce += p.ce || 0;
    filteredSourceBudget[src].estimation += p.estimationAdmin || 0;
    filteredSourceBudget[src].engagement += p.montantEngagement || 0;
    filteredSourceBudget[src].count += 1;
  });
  const filteredProjetBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  filtered.forEach(p => {
    const proj = p.projet || 'Non spécifié';
    if (!filteredProjetBudget[proj]) filteredProjetBudget[proj] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    filteredProjetBudget[proj].cp += p.cp || 0;
    filteredProjetBudget[proj].ce += p.ce || 0;
    filteredProjetBudget[proj].estimation += p.estimationAdmin || 0;
    filteredProjetBudget[proj].engagement += p.montantEngagement || 0;
    filteredProjetBudget[proj].count += 1;
  });
  const filteredMonthlyTimeline: Record<string, { count: number; estimation: number; engagement: number }> = {};
  filtered.forEach(p => {
    if (isValidDate(p.dateOuverture)) {
      const month = p.dateOuverture.substring(0, 7);
      if (/^\d{4}-\d{2}$/.test(month)) {
        if (!filteredMonthlyTimeline[month]) filteredMonthlyTimeline[month] = { count: 0, estimation: 0, engagement: 0 };
        filteredMonthlyTimeline[month].count += 1;
        filteredMonthlyTimeline[month].estimation += p.estimationAdmin || 0;
        filteredMonthlyTimeline[month].engagement += p.montantEngagement || 0;
      }
    }
  });
  const filteredEntityEngagementRate: Record<string, number> = {};
  Object.entries(filteredEntityBudget).forEach(([entity, d]) => {
    filteredEntityEngagementRate[entity] = d.estimation > 0 ? Math.round((d.engagement / d.estimation) * 100) : 0;
  });

  /* ── Derived chart data ── */
  const statusData = Object.entries(filteredStatusCount).map(([name, value]) => ({
    name,
    value,
    estimation: Math.round(filteredStatusBudget[name]?.estimation || 0),
    engagement: Math.round(filteredStatusBudget[name]?.engagement || 0),
  }));
  const entityData = Object.entries(filteredEntityBudget).map(([name, d]) => ({
    name,
    cp: Math.round(d.cp),
    ce: Math.round(d.ce),
    estimation: Math.round(d.estimation),
    engagement: Math.round(d.engagement),
    count: d.count,
  }));
  const timelineData = Object.entries(filteredMonthlyTimeline)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month: monthLabel(month),
      estimation: Math.round(d.estimation),
      engagement: Math.round(d.engagement),
      count: d.count,
    }));
  const natureData = Object.entries(filteredNatureBudget).map(([name, d]) => ({
    name,
    cp: Math.round(d.cp),
    ce: Math.round(d.ce),
    estimation: Math.round(d.estimation),
    engagement: Math.round(d.engagement),
    count: d.count,
  }));
  const typeData = Object.entries(filteredTypeBudget).map(([name, d]) => ({
    name,
    cp: Math.round(d.cp),
    ce: Math.round(d.ce),
    estimation: Math.round(d.estimation),
    engagement: Math.round(d.engagement),
    count: d.count,
  }));
  const engagementRateData = Object.entries(filteredEntityEngagementRate).map(([name, rate]) => ({
    name,
    rate,
    estimation: Math.round(filteredEntityBudget[name]?.estimation || 0),
    engagement: Math.round(filteredEntityBudget[name]?.engagement || 0),
  }));

  // Sparkline data for KPI cards
  const timelineEstimations = timelineData.map(d => d.estimation);
  const timelineEngagements = timelineData.map(d => d.engagement);
  const timelineCounts = timelineData.map(d => d.count);

  const hasActiveFilters = filterStatus !== 'all' || filterEntity !== 'all' || filterNature !== 'all' || filterType !== 'all' || filterProgramme !== 'all' || filterProjet !== 'all' || filterSource !== 'all' || filterAttributaire !== 'all';
  const clearAllFilters = () => { setFilterStatus('all'); setFilterEntity('all'); setFilterNature('all'); setFilterType('all'); setFilterProgramme('all'); setFilterProjet('all'); setFilterSource('all'); setFilterAttributaire('all'); setSearchTerm(''); };

  const engagedCount = filteredStatusCount['Engagé'] || 0;
  const judgedCount = filteredStatusCount['Jugé'] || 0;
  const inProgressCount = filteredStatusCount['En cours de jugement'] || 0;
  const pmpCount = filteredStatusCount['Publié sur PMP'] || 0;
  const toProgramCount = filteredStatusCount['A programmer'] || 0;
  const failedCount = (filteredStatusCount['Infructueux'] || 0) + (filteredStatusCount['Annulé'] || 0);
  const completedCount = engagedCount + judgedCount;

  // Rate computations for rate cards
  const ouvertRate = filteredKpis.totalProjects > 0 ? Math.round(ouvertProjects.length / filteredKpis.totalProjects * 100) : 0;
  const jugementRate = filteredKpis.totalProjects > 0 ? Math.round(filtered.filter(p => p.dateJugement).length / filteredKpis.totalProjects * 100) : 0;
  const engagementRate = filteredKpis.totalProjects > 0 ? Math.round(filtered.filter(p => p.montantEngagement && p.montantEngagement > 0).length / filteredKpis.totalProjects * 100) : 0;
  const annuleRate = filteredKpis.totalProjects > 0 ? Math.round((filteredStatusCount['Annulé'] || 0) / filteredKpis.totalProjects * 100) : 0;
  const infructueuxRate = filteredKpis.totalProjects > 0 ? Math.round((filteredStatusCount['Infructueux'] || 0) / filteredKpis.totalProjects * 100) : 0;
  const aProgrammerRate = filteredKpis.totalProjects > 0 ? Math.round((filteredStatusCount['A programmer'] || 0) / filteredKpis.totalProjects * 100) : 0;
  const enCoursJugementRate = filteredKpis.totalProjects > 0 ? Math.round((filteredStatusCount['En cours de jugement'] || 0) / filteredKpis.totalProjects * 100) : 0;
  const publiePpmRate = filteredKpis.totalProjects > 0 ? Math.round((filteredStatusCount['Publié sur PMP'] || 0) / filteredKpis.totalProjects * 100) : 0;
  const daoCeRate = filteredKpis.totalProjects > 0 ? Math.round((filteredStatusCount['DAO Envoyé au CE'] || 0) / filteredKpis.totalProjects * 100) : 0;

  // Entity color mapping for top accent
  const entityColorMap: Record<string, string> = {};
  const entityColors = ['#3b82f6', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#ea580c'];
  entities.forEach((e, i) => { entityColorMap[e] = entityColors[i % entityColors.length]; });

  /* ── Rate Card Data (9 cards in PIPELINE_ORDER) ── */
  const rateCards = [
    { label: 'Ouvert', rate: ouvertRate, count: ouvertProjects.length, color: '#3b82f6', icon: <CalendarDays className="w-4 h-4" /> },
    { label: 'En cours de jugement', rate: enCoursJugementRate, count: filteredStatusCount['En cours de jugement'] || 0, color: '#d97706', icon: <Clock className="w-4 h-4" /> },
    { label: 'Jugé', rate: jugementRate, count: filtered.filter(p => p.dateJugement).length, color: '#2563eb', icon: <CheckCircle2 className="w-4 h-4" /> },
    { label: 'Engagé', rate: engagementRate, count: filtered.filter(p => p.montantEngagement && p.montantEngagement > 0).length, color: '#16a34a', icon: <DollarSign className="w-4 h-4" /> },
    { label: 'Infructueux', rate: infructueuxRate, count: filteredStatusCount['Infructueux'] || 0, color: '#dc2626', icon: <XCircle className="w-4 h-4" /> },
    { label: 'Annulé', rate: annuleRate, count: filteredStatusCount['Annulé'] || 0, color: '#991b1b', icon: <XCircle className="w-4 h-4" /> },
    { label: 'Publié PPM', rate: publiePpmRate, count: filteredStatusCount['Publié sur PMP'] || 0, color: '#7c3aed', icon: <Activity className="w-4 h-4" /> },
    { label: 'DAO Envoyé au CE', rate: daoCeRate, count: filteredStatusCount['DAO Envoyé au CE'] || 0, color: '#0891b2', icon: <Send className="w-4 h-4" /> },
    { label: 'A programmer', rate: aProgrammerRate, count: filteredStatusCount['A programmer'] || 0, color: '#6b7280', icon: <AlertCircle className="w-4 h-4" /> },
  ];

  // Donut chart data for AO prévus
  const aoPrevusData = statuses.map(s => ({
    name: s,
    value: filteredStatusCount[s] || 0,
    color: statusColor[s] || '#6b7280',
  }));

  /* ── Full-screen sidebar search filter ── */
  const sidebarFiltered = filtered.filter(p =>
    !sidebarSearch ||
    p.objet.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
    p.entite.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
    p.attributaire?.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  /* ── Full-screen status filter ── */
  const sidebarStatusFiltered = sidebarStatusFilter === 'all'
    ? sidebarFiltered
    : sidebarFiltered.filter(p => p.situationAvancement === sidebarStatusFilter);

  return (
    <div className={`min-h-screen bg-slate-50 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* ── Main Layout: Left Sidebar + Content ── */}
      <div className="flex min-h-screen">
        {/* ── Left Black Sidebar ── */}
        <aside className={`print:hidden shrink-0 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col border-r border-gray-800 fixed left-0 top-0 h-screen z-40 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-[60px]' : 'w-[220px]'}`}>
          {/* Sidebar Header */}
          <div className={`border-b border-gray-800 transition-all duration-300 ${sidebarCollapsed ? 'px-2 py-4' : 'px-4 py-5'}`}>
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <BarChart3 className="w-4.5 h-4.5 text-white" />
              </div>
              {!sidebarCollapsed && (
              <div>
                <p className="text-sm font-bold text-white tracking-tight">PPM 2026</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-wider">ORMVAG</p>
              </div>
              )}
            </div>
          </div>
          {/* Toggle Button */}
          <div className={`border-b border-gray-800 flex ${sidebarCollapsed ? 'justify-center px-1' : 'justify-end px-3'} py-2`}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-all duration-200 group"
              title={sidebarCollapsed ? 'Ouvrir la barre latérale' : 'Fermer la barre latérale'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 py-3 px-2 space-y-1">
            {[
              { key: 'dashboard' as const, label: "Vue d'ensemble", icon: <BarChart3 className="w-4.5 h-4.5" /> },
              { key: 'entity' as const, label: 'Par Entité', icon: <Building2 className="w-4.5 h-4.5" /> },
              { key: 'step' as const, label: 'Par Étape', icon: <ClipboardList className="w-4.5 h-4.5" /> },
              { key: 'history' as const, label: 'Historique', icon: <History className="w-4.5 h-4.5" /> },
              { key: 'soumissionnaires' as const, label: 'Soumissionnaires', icon: <Users className="w-4.5 h-4.5" /> },
              { key: 'reports' as const, label: 'Rapports', icon: <FileText className="w-4.5 h-4.5" /> },
              { key: 'delais' as const, label: 'Délais', icon: <Timer className="w-4.5 h-4.5" /> },
              { key: 'alerts' as const, label: 'Alertes', icon: <AlertTriangle className="w-4.5 h-4.5" /> },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setSidebarTab(tab.key)}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group
                  ${sidebarTab === tab.key
                    ? 'bg-gradient-to-r from-blue-600/90 to-violet-600/90 text-white shadow-lg shadow-blue-500/20'
                    : 'text-gray-400 hover:bg-gray-800/80 hover:text-gray-200'
                  }`}
                title={sidebarCollapsed ? tab.label : undefined}
              >
                <span className={`transition-all duration-200 ${sidebarTab === tab.key ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
                  {tab.icon}
                </span>
                {!sidebarCollapsed && <span>{tab.label}</span>}
                {!sidebarCollapsed && sidebarTab === tab.key && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="px-4 py-4 border-t border-gray-800 space-y-2">
            {!sidebarCollapsed && (
            <>
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
                {autoRefresh ? 'Auto-sync ON' : 'Sync OFF'}
              </div>
              <LiveClock />
            </>
            )}
            {sidebarCollapsed && (
              <div className="flex justify-center">
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
              </div>
            )}
          </div>
        </aside>

        {/* ── Main Content Area ── */}
        <main className={`print:ml-0 flex-1 min-w-0 overflow-x-hidden transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'ml-[60px]' : 'ml-[220px]'}`}>
        {/* ── Compact Top Action Bar ── */}
        <div className="print:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
          <div className="px-6 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-sm font-bold text-slate-800">Vue d&apos;ensemble PPM 2026</h1>
                <span className="text-[10px] text-slate-400">
                  {data.fileName ? data.fileName.replace(/\.xlsx?$/i, '') : 'PPM 2026'}
                  {data.fileLastModified && <> · Modifié: {new Date(data.fileLastModified).toLocaleDateString('fr-FR')}</>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {fileChanged && (
                  <div className="flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-full animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Fichier mis à jour
                  </div>
                )}
                {data.dataSaved && (
                  <div className="flex items-center gap-1 text-[10px] bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Sauvegardé
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)} className="text-[10px] h-7 rounded-full px-3">
                  {autoRefresh ? 'Pause' : 'Sync'}
                </Button>
                <Button variant="default" size="sm" onClick={() => fetchData(false)} disabled={refreshing} className="text-[10px] h-7 gap-1 rounded-full px-3 bg-gradient-to-r from-blue-600 to-blue-700">
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
                {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)} className="text-[10px] h-7 gap-1 rounded-full px-3 border-blue-200 text-blue-600 hover:bg-blue-50">
                  <Upload className="w-3 h-3" />
                  Charger
                </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportToExcel} className="text-[10px] h-7 gap-1 rounded-full px-3 border-green-200 text-green-600 hover:bg-green-50">
                  <Download className="w-3 h-3" />
                  Export
                </Button>
                {/* Role indicator & Logout */}
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-700">
                  <Badge className={`text-[9px] h-5 border-0 ${isAdmin ? 'bg-violet-500/20 text-violet-300' : 'bg-blue-500/20 text-blue-300'}`}>
                    <Shield className="w-2.5 h-2.5 mr-1" />
                    {isAdmin ? 'Admin' : 'Observateur'}
                  </Badge>
                  <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-6 h-6 rounded-lg bg-gray-800 hover:bg-red-500/20 flex items-center justify-center transition-colors group" title="Déconnexion">
                    <LogOut className="w-3 h-3 text-gray-500 group-hover:text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* ── Full-Screen View 3: Par Étape ── */}
        {sidebarTab === 'step' && (
          <div className="min-h-screen bg-white text-slate-800 animate-fade-in-up">
            {/* Top Bar */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                      <ClipboardList className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Par Étape</h2>
                      <p className="text-[10px] text-slate-500">Pipeline d&apos;avancement des AO</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input placeholder="Rechercher..." className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 w-48" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              {/* Filter Bar */}
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filterEntity} onValueChange={setFilterEntity}>
                    <SelectTrigger className="h-7 text-[10px] w-[130px] bg-white border-slate-200"><SelectValue placeholder="Entité" /></SelectTrigger>
                    <SelectContent>{entities.map(e => <SelectItem key={e} value={e} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: entityColorMap[e]}} />{e}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes les entités</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterNature} onValueChange={setFilterNature}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Nature" /></SelectTrigger>
                    <SelectContent>{natures.map(n => <SelectItem key={n} value={n} className="text-[10px]">{n}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes natures</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous types</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Programme" /></SelectTrigger>
                    <SelectContent>{programmes.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous programmes</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProjet} onValueChange={setFilterProjet}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Projet" /></SelectTrigger>
                    <SelectContent>{projets.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous AO</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Source financement" /></SelectTrigger>
                    <SelectContent>{sources.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes sources</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterAttributaire} onValueChange={setFilterAttributaire}>
                    <SelectTrigger className="h-7 text-[10px] w-[160px] bg-white border-slate-200"><SelectValue placeholder="Attributaire" /></SelectTrigger>
                    <SelectContent>{attributaires.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous attributaires</SelectItem></SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 gap-1">
                      <X className="w-3 h-3" />Réinitialiser
                    </Button>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">{filtered.length} / {projects.length} AO</span>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
              {/* Visual Pipeline */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Pipeline des Marchés</h3>
                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                  {PIPELINE_ORDER.map((stage, i) => {
                    const dataStatus = PIPELINE_STATUS_MAP[stage] || stage;
                    const count = stage === 'Ouvert' ? ouvertProjects.length : (filteredStatusCount[dataStatus] || 0);
                    const estim = stage === 'Ouvert' ? ouvertProjects.reduce((s,p) => s + (p.estimationAdmin || 0), 0) : (filteredStatusBudget[dataStatus]?.estimation || 0);
                    const engag = stage === 'Ouvert' ? ouvertProjects.reduce((s,p) => s + (p.montantEngagement || 0), 0) : (filteredStatusBudget[dataStatus]?.engagement || 0);
                    const pct = filteredKpis.totalProjects > 0 ? Math.round(count / filteredKpis.totalProjects * 100) : 0;
                    const color = statusColor[stage] || statusColor[dataStatus] || '#6b7280';
                    const isFailed = stage === 'Infructueux' || stage === 'Annulé';
                    return (
                      <div key={stage} className="flex-1 min-w-0">
                        <div className={`relative rounded-xl p-4 text-center hover:shadow-md transition-all duration-200 ${isFailed ? 'bg-red-50/50 border border-red-200' : 'bg-slate-50 border border-slate-200'}`} style={{ borderTop: `4px solid ${color}` }}>
                          <div className="w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-white shadow-sm mb-2" style={{ backgroundColor: color }}>
                            {statusIcon[stage] || statusIcon[dataStatus] || <ClipboardList className="w-4 h-4" />}
                          </div>
                          <p className={`text-[10px] font-semibold leading-tight ${isFailed ? 'text-red-700' : 'text-slate-700'}`}>{stage}</p>
                          <p className={`text-xl font-bold mt-1 ${isFailed ? 'text-red-800' : 'text-slate-800'}`}>{count}</p>
                          <p className={`text-[10px] ${isFailed ? 'text-red-500' : 'text-slate-500'}`}>{pct}% du total</p>
                          <div className="mt-2 space-y-0.5">
                            <p className="text-[9px] text-blue-600">Estim: {fmtM(estim)}</p>
                            <p className="text-[9px] text-green-600">Engagé: {fmtM(engag)}</p>
                          </div>
                          {i < PIPELINE_ORDER.length - 1 && <div className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-slate-300">→</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed expandable sections per status */}
              <div className="space-y-3">
                {Object.entries(filteredStatusCount).sort(([a],[b]) => {
                  const aIdx = PIPELINE_ORDER.findIndex(p => (PIPELINE_STATUS_MAP[p] || p) === a);
                  const bIdx = PIPELINE_ORDER.findIndex(p => (PIPELINE_STATUS_MAP[p] || p) === b);
                  const aOrder = aIdx >= 0 ? aIdx : PIPELINE_ORDER.length;
                  const bOrder = bIdx >= 0 ? bIdx : PIPELINE_ORDER.length;
                  return aOrder - bOrder;
                }).map(([status, count]) => {
                  const statusProjects = filtered.filter(p => p.situationAvancement === status);
                  const isExpanded = expandedAO === -(Object.keys(filteredStatusCount).indexOf(status) + 100);
                  return (
                    <div key={status} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden" style={{ borderLeftWidth: '4px', borderLeftColor: statusColor[status] || '#6b7280' }}>
                      <div className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors" onClick={() => setExpandedAO(isExpanded ? null : -(Object.keys(filteredStatusCount).indexOf(status) + 100))}>
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: statusColor[status] || '#6b7280' }}>{statusIcon[status]}</div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">{status}</h3>
                            <p className="text-[10px] text-slate-500">{count} AO · Estim: {fmtM(filteredStatusBudget[status]?.estimation || 0)} · Engagé: {fmtM(filteredStatusBudget[status]?.engagement || 0)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="text-[9px] h-5 border-0 text-white" style={{ backgroundColor: statusColor[status] || '#6b7280' }}>{count}</Badge>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-slate-100">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-[9px] text-slate-500 uppercase tracking-wider">
                                  <th className="px-3 py-2 text-center w-12">N° AO</th>
                                  <th className="px-3 py-2 text-left">Objet</th>
                                  <th className="px-3 py-2 text-left">Statut</th>
                                  <th className="px-3 py-2 text-right">CP</th>
                                  <th className="px-3 py-2 text-right">CE</th>
                                  <th className="px-3 py-2 text-right">Estimation</th>
                                  <th className="px-3 py-2 text-center">Ouv. Plis</th>
                                  <th className="px-3 py-2 text-center">Jugement</th>
                                  <th className="px-3 py-2 text-center">Engagé le</th>
                                  <th className="px-3 py-2 text-center">N° Marché</th>
                                  <th className="px-3 py-2 text-right">Eng. Total</th>
                                  <th className="px-3 py-2 text-right">Eng. CP</th>
                                  <th className="px-3 py-2 text-right">Eng. CE</th>
                                </tr>
                              </thead>
                              <tbody>
                                {statusProjects.map(p => (
                                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="px-3 py-2 text-center text-slate-600 font-mono text-[10px]" title={exAOTitle(p.numAO) || undefined}>{p.numAO || '—'}{String(p.numAO || '').includes('ex') && <span className="text-[7px] opacity-50 ml-0.5">↻</span>}</td>
                                    <td className="px-3 py-2 text-slate-700 min-w-[200px]">{p.objet}</td>
                                    <td className="px-3 py-2 text-center"><Badge className="text-[8px] h-4 gap-0.5 font-semibold border-0 text-white shadow-sm whitespace-nowrap" style={{ backgroundColor: statusColor[p.situationAvancement] || '#6b7280' }}>{p.situationAvancement}</Badge></td>
                                    <td className="px-3 py-2 text-right text-slate-700">{p.cp ? fmtM(p.cp) : '—'}</td>
                                    <td className="px-3 py-2 text-right text-slate-700">{p.ce ? fmtM(p.ce) : '—'}</td>
                                    <td className="px-3 py-2 text-right text-blue-700">{p.estimationAdmin ? fmtM(p.estimationAdmin) : '—'}</td>
                                    <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateOuverture || '—'}</td>
                                    <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateJugement || '—'}</td>
                                    <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateEngagement || '—'}</td>
                                    <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.numMarche || '—'}</td>
                                    <td className="px-3 py-2 text-right text-green-700">{p.montantEngagement ? fmtM(p.montantEngagement) : '—'}</td>
                                    <td className="px-3 py-2 text-right text-violet-700">{p.engagementCP ? fmtM(p.engagementCP) : '—'}</td>
                                    <td className="px-3 py-2 text-right text-cyan-700">{p.engagementCE ? fmtM(p.engagementCE) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Full-Screen View 2: Par Entité ── */}
        {sidebarTab === 'entity' && (
          <div className="min-h-screen bg-white text-slate-800 animate-fade-in-up">
            {/* Top Bar */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Par Entité</h2>
                      <p className="text-[10px] text-slate-500">Détail des AO par entité</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input placeholder="Rechercher..." className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 w-48" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              {/* Filter Bar */}
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Statut" /></SelectTrigger>
                    <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: statusColor[s]}} />{s}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous les statuts</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterNature} onValueChange={setFilterNature}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Nature" /></SelectTrigger>
                    <SelectContent>{natures.map(n => <SelectItem key={n} value={n} className="text-[10px]">{n}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes natures</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous types</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Programme" /></SelectTrigger>
                    <SelectContent>{programmes.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous programmes</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProjet} onValueChange={setFilterProjet}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Projet" /></SelectTrigger>
                    <SelectContent>{projets.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous AO</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Source financement" /></SelectTrigger>
                    <SelectContent>{sources.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes sources</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterAttributaire} onValueChange={setFilterAttributaire}>
                    <SelectTrigger className="h-7 text-[10px] w-[160px] bg-white border-slate-200"><SelectValue placeholder="Attributaire" /></SelectTrigger>
                    <SelectContent>{attributaires.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous attributaires</SelectItem></SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 gap-1">
                      <X className="w-3 h-3" />Réinitialiser
                    </Button>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">{filtered.length} / {projects.length} AO</span>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-3">
              {Object.entries(filteredEntityBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([entity, d]) => {
                const entityProjects = filtered.filter(p => p.entite === entity);
                const accentColor = entityColorMap[entity] || '#3b82f6';
                const engRate = filteredEntityEngagementRate[entity];
                const isExpanded = expandedAO === -(entities.indexOf(entity) + 200);
                return (
                  <div key={entity} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden" style={{ borderLeftWidth: '4px', borderLeftColor: accentColor }}>
                    <div className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors" onClick={() => setExpandedAO(isExpanded ? null : -(entities.indexOf(entity) + 200))}>
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: accentColor }}>
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">{entity}</h3>
                          <p className="text-[10px] text-slate-500">{d.count} AO · Estim: {fmtM(d.estimation)} · Engagé: {fmtM(d.engagement)} · Taux: {engRate}%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[9px] h-5 border-0 text-white" style={{ backgroundColor: accentColor }}>{d.count}</Badge>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-100 text-[9px] text-slate-500 uppercase tracking-wider">
                                <th className="px-3 py-2 text-center w-12">N° AO</th>
                                <th className="px-3 py-2 text-left">Objet</th>
                                <th className="px-3 py-2 text-left">Statut</th>
                                <th className="px-3 py-2 text-right">CP</th>
                                <th className="px-3 py-2 text-right">CE</th>
                                <th className="px-3 py-2 text-right">Estimation</th>
                                <th className="px-3 py-2 text-center">Ouv. Plis</th>
                                <th className="px-3 py-2 text-center">Jugement</th>
                                <th className="px-3 py-2 text-center">Engagé le</th>
                                <th className="px-3 py-2 text-center">N° Marché</th>
                                <th className="px-3 py-2 text-right">Eng. Total</th>
                                <th className="px-3 py-2 text-right">Eng. CP</th>
                                <th className="px-3 py-2 text-right">Eng. CE</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entityProjects.map(p => (
                                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="px-3 py-2 text-center text-slate-600 font-mono text-[10px]" title={exAOTitle(p.numAO) || undefined}>{p.numAO || '—'}{String(p.numAO || '').includes('ex') && <span className="text-[7px] opacity-50 ml-0.5">↻</span>}</td>
                                  <td className="px-3 py-2 text-slate-700 min-w-[200px]">{p.objet}</td>
                                  <td className="px-3 py-2 text-center"><Badge className="text-[8px] h-4 gap-0.5 font-semibold border-0 text-white shadow-sm whitespace-nowrap" style={{ backgroundColor: statusColor[p.situationAvancement] || '#6b7280' }}>{p.situationAvancement}</Badge></td>
                                  <td className="px-3 py-2 text-right text-slate-700">{p.cp ? fmtM(p.cp) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{p.ce ? fmtM(p.ce) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-blue-700">{p.estimationAdmin ? fmtM(p.estimationAdmin) : '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateOuverture || '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateJugement || '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateEngagement || '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.numMarche || '—'}</td>
                                  <td className="px-3 py-2 text-right text-green-700">{p.montantEngagement ? fmtM(p.montantEngagement) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-violet-700">{p.engagementCP ? fmtM(p.engagementCP) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-cyan-700">{p.engagementCE ? fmtM(p.engagementCE) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Full-Screen View 4: Historique ── */}
        {sidebarTab === 'history' && (
          <div className="min-h-screen bg-white text-slate-800 animate-fade-in-up">
            {/* Top Bar */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                      <History className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Historique Ouvertures Plis</h2>
                      <p className="text-[10px] text-slate-500">{sortedDailyOpenings.length} jours d&apos;ouverture</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input placeholder="Rechercher..." className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 w-48" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              {/* Filter Bar */}
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filterEntity} onValueChange={setFilterEntity}>
                    <SelectTrigger className="h-7 text-[10px] w-[130px] bg-white border-slate-200"><SelectValue placeholder="Entité" /></SelectTrigger>
                    <SelectContent>{entities.map(e => <SelectItem key={e} value={e} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: entityColorMap[e]}} />{e}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes les entités</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Statut" /></SelectTrigger>
                    <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: statusColor[s]}} />{s}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous les statuts</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterNature} onValueChange={setFilterNature}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Nature" /></SelectTrigger>
                    <SelectContent>{natures.map(n => <SelectItem key={n} value={n} className="text-[10px]">{n}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes natures</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous types</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Programme" /></SelectTrigger>
                    <SelectContent>{programmes.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous programmes</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProjet} onValueChange={setFilterProjet}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Projet" /></SelectTrigger>
                    <SelectContent>{projets.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous AO</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Source financement" /></SelectTrigger>
                    <SelectContent>{sources.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes sources</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterAttributaire} onValueChange={setFilterAttributaire}>
                    <SelectTrigger className="h-7 text-[10px] w-[160px] bg-white border-slate-200"><SelectValue placeholder="Attributaire" /></SelectTrigger>
                    <SelectContent>{attributaires.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous attributaires</SelectItem></SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 gap-1">
                      <X className="w-3 h-3" />Réinitialiser
                    </Button>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">{filtered.length} / {projects.length} AO</span>
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center"><CalendarDays className="w-5 h-5 text-violet-500" /></div>
                  <div><p className="text-2xl font-bold text-slate-800">{sortedDailyOpenings.length}</p><p className="text-[10px] text-slate-500">Jours d&apos;ouverture</p></div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><FileText className="w-5 h-5 text-blue-500" /></div>
                  <div><p className="text-2xl font-bold text-slate-800">{filtered.filter(p => p.dateOuverture).length}</p><p className="text-[10px] text-slate-500">Total AO avec date</p></div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-500" /></div>
                  <div><p className="text-2xl font-bold text-slate-800 mdh-lg">{fmtM(filtered.filter(p => p.dateOuverture).reduce((s, p) => s + (p.estimationAdmin || 0), 0))}</p><p className="text-[10px] text-slate-500">Estimation totale (DH)</p></div>
                </div>
              </div>

              {/* Vertical Timeline */}
              {sortedDailyOpenings.length === 0 && (
                <div className="text-center py-16"><CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-400">Aucune date d&apos;ouverture trouvée</p></div>
              )}
              <div className="relative pl-8">
                <div className="absolute left-[11px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-violet-400 via-blue-400 to-slate-200" />
                {sortedDailyOpenings.map(([date, projectsList]) => {
                  const totalEstim = projectsList.reduce((s, p) => s + (p.estimationAdmin || 0), 0);
                  const totalEngag = projectsList.reduce((s, p) => s + (p.montantEngagement || 0), 0);
                  const engRatio = totalEstim > 0 ? Math.round((totalEngag / totalEstim) * 100) : 0;
                  return (
                    <div key={date} className="relative mb-6">
                      <div className="absolute -left-8 top-2 w-6 h-6 rounded-full bg-white border-2 border-violet-400 flex items-center justify-center z-10 shadow-sm">
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-violet-400 to-blue-400" />
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ml-4">
                        <div className="bg-gradient-to-r from-violet-50 to-blue-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-violet-500" /><span className="text-sm font-bold text-slate-800">{date}</span></div>
                          <div className="flex items-center gap-3">
                            <Badge className="text-[9px] h-5 bg-violet-100 text-violet-700 border-violet-200 border hover:bg-violet-200">{projectsList.length} AO</Badge>
                            <span className="text-[10px] text-slate-500">Estim: <strong className="text-blue-600">{fmtM(totalEstim)}</strong></span>
                            <span className="text-[10px] text-slate-500">Engagé: <strong className="text-green-600">{engRatio}%</strong></span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="bg-slate-50 border-b border-slate-100 text-[9px] text-slate-500 uppercase tracking-wider">
                              <th className="px-3 py-2 text-center w-12">N° AO</th><th className="px-3 py-2 text-left">Objet</th><th className="px-3 py-2 text-left">Statut</th><th className="px-3 py-2 text-right">CP</th><th className="px-3 py-2 text-right">CE</th><th className="px-3 py-2 text-right">Estimation</th><th className="px-3 py-2 text-center">Ouv. Plis</th><th className="px-3 py-2 text-center">Jugement</th><th className="px-3 py-2 text-center">Engagé le</th><th className="px-3 py-2 text-center">N° Marché</th><th className="px-3 py-2 text-right">Eng. Total</th><th className="px-3 py-2 text-right">Eng. CP</th><th className="px-3 py-2 text-right">Eng. CE</th>
                            </tr></thead>
                            <tbody>
                              {projectsList.map(p => (
                                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => { setSidebarTab('dashboard'); setTimeout(() => setExpandedAO(p.id), 100); }}>
                                  <td className="px-3 py-2 text-center text-slate-600 font-mono text-[10px]" title={exAOTitle(p.numAO) || undefined}>{p.numAO || '—'}{String(p.numAO || '').includes('ex') && <span className="text-[7px] opacity-50 ml-0.5">↻</span>}</td>
                                  <td className="px-3 py-2 text-slate-700 min-w-[200px]">{p.objet}</td>
                                  <td className="px-3 py-2 text-center"><Badge className="text-[8px] h-4 gap-0.5 font-semibold border-0 text-white shadow-sm whitespace-nowrap" style={{ backgroundColor: statusColor[p.situationAvancement] || '#6b7280' }}>{p.situationAvancement}</Badge></td>
                                  <td className="px-3 py-2 text-right text-slate-700">{p.cp ? fmtM(p.cp) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{p.ce ? fmtM(p.ce) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-blue-700">{p.estimationAdmin ? fmtM(p.estimationAdmin) : '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateOuverture || '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateJugement || '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.dateEngagement || '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{p.numMarche || '—'}</td>
                                  <td className="px-3 py-2 text-right text-green-700">{p.montantEngagement ? fmtM(p.montantEngagement) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-violet-700">{p.engagementCP ? fmtM(p.engagementCP) : '—'}</td>
                                  <td className="px-3 py-2 text-right text-cyan-700">{p.engagementCE ? fmtM(p.engagementCE) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Full-Screen View: Soumissionnaires ── */}
        {sidebarTab === 'soumissionnaires' && (
          <div className="min-h-screen bg-slate-50 text-slate-800 animate-fade-in-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">Soumissionnaires</h1>
                    <p className="text-xs text-indigo-200">Résultats des Séances d&apos;Ouverture</p>
                  </div>
                  {soumissionnaireData && Object.keys(soumissionnaireData.projets).length > 0 && (
                    <div className="flex items-center gap-2 ml-4">
                      <Badge className="bg-white/20 text-white border-0 text-xs">
                        {soumissionnaireData.totalProjets} AO
                      </Badge>
                      <Badge className="bg-white/20 text-white border-0 text-xs">
                        <Users className="w-3 h-3 mr-1" /> {soumissionnaireData.totalSoumissionnaires} soumissionnaires
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-white hover:text-indigo-600 hover:bg-white border-white/30 hover:border-white bg-transparent gap-1.5"
                    onClick={() => setShowSoumUpload(!showSoumUpload)}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {showSoumUpload ? 'Fermer upload' : 'Mettre à jour'}
                  </Button>
                  )}
                  <Button onClick={() => setSidebarTab('dashboard')} variant="outline" size="sm" className="h-8 text-xs text-white hover:text-indigo-600 hover:bg-white border-white/30 hover:border-white bg-transparent gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" />Vue d&apos;ensemble
                  </Button>
                </div>
              </div>
            </div>

            <div className="px-6 py-6 space-y-5">
              {/* Upload zone */}
              {showSoumUpload && (
                <Card className="border-0 shadow-md animate-fade-in-up" style={{ borderTop: '4px solid #6366f1' }}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700">Mettre à jour les soumissionnaires</h4>
                        <p className="text-[10px] text-slate-400">Uploadez le fichier Excel des résultats des séances d&apos;ouverture</p>
                      </div>
                    </div>
                    <div
                      className="relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 border-slate-300 bg-slate-50/50"
                      onClick={() => document.getElementById('soum-file-input2')?.click()}
                    >
                      <input
                        id="soum-file-input2"
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleSoumUpload(file);
                        }}
                      />
                      {soumUploading ? (
                        <div className="space-y-2">
                          <div className="relative w-10 h-10 mx-auto">
                            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
                            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                          </div>
                          <p className="text-xs font-medium text-indigo-600">Chargement en cours...</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <CloudUpload className="w-8 h-8 mx-auto text-indigo-400" />
                          <p className="text-xs font-medium text-slate-600">
                            Glissez ou <span className="text-indigo-500 underline">cliquez pour parcourir</span>
                          </p>
                          <p className="text-[10px] text-slate-400">Fichier Excel des séances d&apos;ouverture (.xlsx, .xls)</p>
                        </div>
                      )}
                    </div>
                    {soumUploadResult && (
                      <div className={`mt-3 p-3 rounded-xl flex items-center gap-2 text-xs ${soumUploadResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {soumUploadResult.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                        <span className="font-medium">{soumUploadResult.message}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* KPI Cards */}
              {soumissionnaireData && Object.keys(soumissionnaireData.projets).length > 0 && (() => {
                // Apply filters to get filtered projets
                const filteredSoumProjets = Object.values(soumissionnaireData.projets).filter(sp => {
                  const ppmMatch = findPPMForSoum(data?.projects, sp.numAO, sp.entite);
                  const matchEntity = filterEntity === 'all' || sp.entite === filterEntity;
                  const matchStatus = filterStatus === 'all' || ppmMatch?.situationAvancement === filterStatus;
                  const matchNature = filterNature === 'all' || ppmMatch?.natureBudget === filterNature;
                  const matchType = filterType === 'all' || ppmMatch?.typeBudget === filterType;
                  const matchProgramme = filterProgramme === 'all' || ppmMatch?.programme === filterProgramme;
                  const matchProjet = filterProjet === 'all' || ppmMatch?.projet === filterProjet;
                  const matchSource = filterSource === 'all' || ppmMatch?.sourceFinancement === filterSource;
                  const matchAttributaire = filterAttributaire === 'all' || ppmMatch?.attributaire === filterAttributaire;
                  return matchEntity && matchStatus && matchNature && matchType && matchProgramme && matchProjet && matchSource && matchAttributaire;
                });
                // Aggregate per-project unique soumissionnaire counts
                const perProject = filteredSoumProjets.map(sp => countUniqueByDecision(sp.soumissionnaires));
                const totalAdmis = perProject.reduce((s, c) => s + c.admis, 0);
                const totalEcartes = perProject.reduce((s, c) => s + c.ecarts, 0);
                const totalEnAttente = perProject.reduce((s, c) => s + c.enAttente, 0);
                const totalReportee = perProject.reduce((s, c) => s + c.reportee, 0);
                const totalAnnule = perProject.reduce((s, c) => s + c.annule, 0);
                const totalUniques = filteredSoumProjets.reduce((s, sp) => s + sp.nbSoumissionnairesUniques, 0);
                const admisRate = totalUniques > 0 ? Math.round(totalAdmis / totalUniques * 100) : 0;
                const hasSoumFiltersKPI = filterEntity !== 'all' || filterStatus !== 'all' || filterNature !== 'all' || filterType !== 'all' || filterProgramme !== 'all' || filterProjet !== 'all' || filterSource !== 'all' || filterAttributaire !== 'all';

                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #6366f1' }}>
                      <CardContent className="p-4 text-center">
                        <Users className="w-6 h-6 text-indigo-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-indigo-700">{totalUniques}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Soumissionnaires{hasSoumFiltersKPI ? ' (filtrés)' : ''}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #16a34a' }}>
                      <CardContent className="p-4 text-center">
                        <UserCheck className="w-6 h-6 text-green-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-green-700">{totalAdmis}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Admis ({admisRate}%)</p>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #dc2626' }}>
                      <CardContent className="p-4 text-center">
                        <UserX className="w-6 h-6 text-red-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-red-700">{totalEcartes}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Ecartés</p>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #d97706' }}>
                      <CardContent className="p-4 text-center">
                        <Clock className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-amber-700">{totalEnAttente > 0 ? totalEnAttente : '—'}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">En attente</p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Soumissionnaire Filters */}
              {soumissionnaireData && Object.keys(soumissionnaireData.projets).length > 0 && (
                <div className="max-w-[1800px] mx-auto px-0 pb-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={filterEntity} onValueChange={setFilterEntity}>
                      <SelectTrigger className="h-7 text-[10px] w-[130px] bg-white border-slate-200"><SelectValue placeholder="Entité" /></SelectTrigger>
                      <SelectContent>{entities.map(e => <SelectItem key={e} value={e} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: entityColorMap[e]}} />{e}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes les entités</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Statut" /></SelectTrigger>
                      <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: statusColor[s]}} />{s}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous les statuts</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterNature} onValueChange={setFilterNature}>
                      <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Nature" /></SelectTrigger>
                      <SelectContent>{natures.map(n => <SelectItem key={n} value={n} className="text-[10px]">{n}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes natures</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous types</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                      <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Programme" /></SelectTrigger>
                      <SelectContent>{programmes.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous programmes</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterProjet} onValueChange={setFilterProjet}>
                      <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Projet" /></SelectTrigger>
                      <SelectContent>{projets.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous AO</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterSource} onValueChange={setFilterSource}>
                      <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Source financement" /></SelectTrigger>
                      <SelectContent>{sources.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes sources</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterAttributaire} onValueChange={setFilterAttributaire}>
                      <SelectTrigger className="h-7 text-[10px] w-[160px] bg-white border-slate-200"><SelectValue placeholder="Attributaire" /></SelectTrigger>
                      <SelectContent>{attributaires.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous attributaires</SelectItem></SelectContent>
                    </Select>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 gap-1">
                        <X className="w-3 h-3" />Réinitialiser
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Main Table */}
              {soumissionnaireData && Object.keys(soumissionnaireData.projets).length > 0 ? (
                <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #6366f1' }}>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 text-[10px] text-indigo-700 uppercase tracking-wider">
                            <th className="px-4 py-3 text-left">N° AO</th>
                            <th className="px-4 py-3 text-left">Entité</th>
                            <th className="px-4 py-3 text-left">Objet</th>
                            <th className="px-4 py-3 text-left">Séance</th>
                            <th className="px-4 py-3 text-center">Nb Soum.</th>
                            <th className="px-4 py-3 text-center">Admis</th>
                            <th className="px-4 py-3 text-center">Ecartés</th>
                            <th className="px-4 py-3 text-center">Taux</th>
                            <th className="px-4 py-3 text-left">Date Jugement</th>
                            <th className="px-4 py-3 text-left">Attributaire</th>
                            <th className="px-4 py-3 text-left">N° Marché</th>
                            <th className="px-4 py-3 text-center">Statut</th>
                            <th className="px-4 py-3 text-center">Détail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(soumissionnaireData.projets)
                            .filter(([, sp]) => {
                              const ppmMatch = findPPMForSoum(data?.projects, sp.numAO, sp.entite);
                              const matchEntity = filterEntity === 'all' || sp.entite === filterEntity;
                              const matchStatus = filterStatus === 'all' || ppmMatch?.situationAvancement === filterStatus;
                              const matchNature = filterNature === 'all' || ppmMatch?.natureBudget === filterNature;
                              const matchType = filterType === 'all' || ppmMatch?.typeBudget === filterType;
                              const matchProgramme = filterProgramme === 'all' || ppmMatch?.programme === filterProgramme;
                              const matchProjet = filterProjet === 'all' || ppmMatch?.projet === filterProjet;
                              const matchSource = filterSource === 'all' || ppmMatch?.sourceFinancement === filterSource;
                              const matchAttributaire = filterAttributaire === 'all' || ppmMatch?.attributaire === filterAttributaire;
                              return matchEntity && matchStatus && matchNature && matchType && matchProgramme && matchProjet && matchSource && matchAttributaire;
                            })
                            .sort(([,a],[,b]) => {
                              const parseSeanceDate = (sp: typeof a) => {
                                const seances = sp.soumissionnaires.map(s => s.seance).filter(Boolean);
                                if (seances.length === 0) return new Date('9999-12-31');
                                const dates = seances.map(s => {
                                  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
                                  if (m) { try { return new Date(`${m[2]} ${m[1]}, ${m[3]}`); } catch { return new Date('9999-12-31'); } }
                                  return new Date('9999-12-31');
                                });
                                return dates.reduce((min, d) => d < min ? d : min, dates[0]);
                              };
                              const dateA = parseSeanceDate(a);
                              const dateB = parseSeanceDate(b);
                              return dateA.getTime() - dateB.getTime();
                            })
                            .map(([key, sp]) => {
                            const { admis, ecarts, enAttente: enAtt, reportee: rep, annule: ann } = countUniqueByDecision(sp.soumissionnaires);
                            const taux = sp.nbSoumissionnairesUniques > 0 ? Math.round(admis / sp.nbSoumissionnairesUniques * 100) : 0;
                            // Séances uniques
                            const seances = [...new Set(sp.soumissionnaires.map(s => s.seance))].filter(Boolean);
                            // Find matching PPM project for dateJugement & attributaire
                            const ppmMatch = findPPMForSoum(data?.projects, sp.numAO, sp.entite);
                            return (
                              <tr key={key} className="border-b border-slate-50 hover:bg-indigo-50/30 transition-colors">
                                <td className="px-4 py-3">
                                  <Badge
                                    className="bg-indigo-100 text-indigo-700 border-0 text-[10px] font-mono cursor-help"
                                    title={exAOTitle(ppmMatch?.numAO || sp.numAOComplet)}
                                  >
                                    {ppmMatch?.numAO ? `${ppmMatch.numAO}/${sp.numAOComplet.split('/').slice(1).join('/')}` : sp.numAOComplet}
                                    {(ppmMatch?.numAO && String(ppmMatch.numAO).includes('ex') || sp.numAOComplet.includes('ex')) && <span className="ml-1 text-[8px] opacity-60">↻</span>}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="font-semibold text-slate-700">{sp.entite}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-600" style={{ maxWidth: '280px', whiteSpace: 'normal', lineHeight: '1.4' }}>{sp.objetAO}</td>
                                <td className="px-4 py-3">
                                  <div className="space-y-0.5">
                                    {seances.slice(0, 3).map((seance, i) => (
                                      <div key={i} className="flex items-center gap-1 text-[10px]">
                                        <CalendarDays className="w-3 h-3 text-indigo-400" />
                                        <span className="text-slate-600">{seance}</span>
                                      </div>
                                    ))}
                                    {seances.length > 3 && (
                                      <span className="text-[9px] text-indigo-400">+{seances.length - 3} autres</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                                    <Users className="w-3 h-3" />
                                    {sp.nbSoumissionnairesUniques}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {admis > 0 ? (
                                    <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">
                                      <UserCheck className="w-3 h-3 mr-0.5" />{admis}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {ecarts > 0 ? (
                                    <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">
                                      <UserX className="w-3 h-3 mr-0.5" />{ecarts}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-14 h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${taux >= 70 ? 'bg-green-500' : taux >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                        style={{ width: `${taux}%` }}
                                      />
                                    </div>
                                    <span className={`text-[10px] font-bold ${taux >= 70 ? 'text-green-700' : taux >= 40 ? 'text-amber-700' : 'text-red-700'}`}>{taux}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {ppmMatch?.dateJugement ? (
                                    <div className="flex items-center gap-1.5">
                                      <CalendarDays className="w-3.5 h-3.5 text-blue-400" />
                                      <span className="text-slate-700 font-medium">{new Date(ppmMatch.dateJugement).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {ppmMatch?.attributaire ? (
                                    <div className="flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                      <span className="font-semibold text-green-700" style={{ whiteSpace: 'normal', lineHeight: '1.3' }}>{ppmMatch.attributaire}</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {ppmMatch?.numMarche ? (
                                    <Badge className="bg-cyan-100 text-cyan-700 border-0 text-[10px] font-mono">{ppmMatch.numMarche}</Badge>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {ppmMatch?.situationAvancement ? (
                                    <Badge
                                      className="border-0 text-[10px]"
                                      style={{
                                        backgroundColor: (statusColor[ppmMatch.situationAvancement] || '#6b7280') + '18',
                                        color: statusColor[ppmMatch.situationAvancement] || '#6b7280',
                                      }}
                                    >
                                      {statusIcon[ppmMatch.situationAvancement]}
                                      <span className="ml-1">{ppmMatch.situationAvancement}</span>
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-600 hover:text-indigo-800 transition-all duration-200 hover:shadow-md hover:scale-110 active:scale-95"
                                    title="Voir le détail complet"
                                    onClick={() => { setSelectedSoumProjet(sp); setShowSoumModal(true); }}
                                  >
                                    <ArrowUpRight className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-md">
                  <CardContent className="p-12 text-center">
                    <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-500 mb-1">Aucune donnée de soumissionnaires</h3>
                    <p className="text-xs text-slate-400">Uploadez le fichier Excel des résultats des séances d&apos;ouverture pour voir les données.</p>
                  </CardContent>
                </Card>
              )}

              {/* Source info */}
              {soumissionnaireData && (
                <div className="text-center text-[10px] text-slate-400 py-2">
                  Source : {soumissionnaireData.fileName || 'soumissionnaires.xlsx'} — Mis à jour : {soumissionnaireData.lastUpdated ? new Date(soumissionnaireData.lastUpdated).toLocaleString('fr-FR') : '—'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Full-Screen View 5: Rapports ── */}
        {sidebarTab === 'reports' && (() => {
          /* ── Alert categories for report ── */
          const alertCats = [
            { key: 'ouvert-sans-date', label: 'Ouvert sans date', color: '#3b82f6', count: filtered.filter(p => (p.situationAvancement === 'Ouvert' || (PIPELINE_STATUS_MAP['Ouvert'] !== '__computed__' && p.situationAvancement === PIPELINE_STATUS_MAP['Ouvert'])) && !isValidDate(p.dateOuverture)).length },
            { key: 'juge-sans-engagement', label: 'Jugé sans engagement', color: '#d97706', count: filtered.filter(p => p.situationAvancement === 'Jugé' && (!p.montantEngagement || p.montantEngagement === 0)).length },
            { key: 'juge-sans-date', label: 'Jugé sans date', color: '#2563eb', count: filtered.filter(p => p.situationAvancement === 'Jugé' && !isValidDate(p.dateJugement)).length },
            { key: 'infructueux-sans-date', label: 'Infructueux sans date', color: '#dc2626', count: filtered.filter(p => p.situationAvancement === 'Infructueux' && !isValidDate(p.dateJugement)).length },
            { key: 'annule-sans-date', label: 'Annulé sans date', color: '#991b1b', count: filtered.filter(p => p.situationAvancement === 'Annulé' && !isValidDate(p.dateJugement)).length },
            { key: 'dao-sans-date', label: 'DAO CE sans date', color: '#0891b2', count: filtered.filter(p => p.situationAvancement === 'DAO Envoyé au CE' && !isValidDate(p.dateJugement) && !isValidDate(p.dateOuverture)).length },
            { key: 'publie-sans-date', label: 'Publié PPM sans date', color: '#7c3aed', count: filtered.filter(p => p.situationAvancement === 'Publié sur PMP' && !isValidDate(p.dateOuverture)).length },
            { key: 'a-programmer', label: 'À programmer', color: '#6b7280', count: filtered.filter(p => p.situationAvancement === 'A programmer').length },
          ];
          const totalAlertCount = alertCats.reduce((s, a) => s + a.count, 0);
          const engRate = filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0;

          const reportTypes = [
            { key: 'synthese', icon: <BarChart3 className="w-5 h-5" />, label: 'Synthèse Générale', desc: 'Vue d\'ensemble complète', color: '#2563eb' },
            { key: 'entite', icon: <Building2 className="w-5 h-5" />, label: 'Par Entité', desc: 'Répartition par entité', color: '#16a34a' },
            { key: 'statut', icon: <ClipboardList className="w-5 h-5" />, label: 'Par Statut / Étape', desc: 'Pipeline et statuts', color: '#d97706' },
            { key: 'alertes', icon: <AlertTriangle className="w-5 h-5" />, label: 'Alertes', desc: 'Points d\'attention', color: '#dc2626' },
            { key: 'financier', icon: <Wallet className="w-5 h-5" />, label: 'Suivi Financier', desc: 'Budgets et engagements', color: '#0891b2' },
            { key: 'chrono', icon: <CalendarDays className="w-5 h-5" />, label: 'Chronologique', desc: 'Timeline mensuelle', color: '#7c3aed' },
          ];

          /* ── Print-optimized header ── */
          const printHeader = (
            <div className="hidden print:block mb-8">
              <div className="flex items-center justify-between border-b-2 border-gray-800 pb-4 mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
                    <BarChart3 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Office Régional de Mise en Valeur Agricole du Gharb</h1>
                    <p className="text-sm text-gray-600 font-medium">Plan de Passation des Marchés — Exercice 2026</p>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>Rapport généré le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  <p>à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            </div>
          );

          /* ── Action bar for print/export ── */
          const actionBar = (
            <div className="print:hidden flex items-center justify-between bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3 mt-6">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Eye className="w-4 h-4" />
                <span>{filtered.length} AO · {reportTypes.find(r => r.key === reportType)?.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setSidebarTab('dashboard')} variant="outline" className="h-8 text-xs gap-1.5 border-slate-200 hover:bg-slate-50">
                  <BarChart3 className="w-3.5 h-3.5" />Retour Vue d&apos;ensemble
                </Button>
                <Button onClick={exportToExcel} variant="outline" className="h-8 text-xs gap-1.5 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">
                  <Download className="w-3.5 h-3.5" />Exporter CSV
                </Button>
                <Button onClick={() => window.print()} className="h-8 text-xs gap-1.5 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 shadow-sm">
                  <Printer className="w-3.5 h-3.5" />Imprimer
                </Button>
              </div>
            </div>
          );

          return (
          <div className="min-h-screen bg-slate-50 text-slate-800 animate-fade-in-up">
            {/* ── Print-specific CSS ── */}
            <style>{`
              @media print {
                body * { visibility: visible !important; }
                aside, .print\\:hidden { display: none !important; }
                main { margin-left: 0 !important; }
                .print\\:break-before { page-break-before: always; }
                .print\\:break-after { page-break-after: always; }
                .print\\:no-break { page-break-inside: avoid; }
              }
            `}</style>

            {/* ── Top Sticky Bar ── */}
            <div className="print:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-teal-600 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Rapports</h2>
                      <p className="text-[10px] text-slate-500">Génération et impression des rapports PPM 2026</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input placeholder="Rechercher..." className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 w-48" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              {/* Filter Bar */}
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filterEntity} onValueChange={setFilterEntity}>
                    <SelectTrigger className="h-7 text-[10px] w-[130px] bg-white border-slate-200"><SelectValue placeholder="Entité" /></SelectTrigger>
                    <SelectContent>{entities.map(e => <SelectItem key={e} value={e} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: entityColorMap[e]}} />{e}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes les entités</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Statut" /></SelectTrigger>
                    <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: statusColor[s]}} />{s}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous les statuts</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterNature} onValueChange={setFilterNature}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Nature" /></SelectTrigger>
                    <SelectContent>{natures.map(n => <SelectItem key={n} value={n} className="text-[10px]">{n}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes natures</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous types</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Programme" /></SelectTrigger>
                    <SelectContent>{programmes.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous programmes</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProjet} onValueChange={setFilterProjet}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Projet" /></SelectTrigger>
                    <SelectContent>{projets.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous AO</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Source financement" /></SelectTrigger>
                    <SelectContent>{sources.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes sources</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterAttributaire} onValueChange={setFilterAttributaire}>
                    <SelectTrigger className="h-7 text-[10px] w-[160px] bg-white border-slate-200"><SelectValue placeholder="Attributaire" /></SelectTrigger>
                    <SelectContent>{attributaires.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous attributaires</SelectItem></SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 gap-1">
                      <X className="w-3 h-3" />Réinitialiser
                    </Button>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">{filtered.length} / {projects.length} AO</span>
                </div>
              </div>
            </div>

            {/* ── Report Type Selector ── */}
            <div className="print:hidden max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {reportTypes.map(rt => (
                  <button
                    key={rt.key}
                    onClick={() => setReportType(rt.key)}
                    className={`shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 cursor-pointer min-w-[180px]
                      ${reportType === rt.key
                        ? 'bg-white shadow-lg -translate-y-0.5'
                        : 'bg-white/60 border-transparent hover:bg-white hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    style={{ borderColor: reportType === rt.key ? rt.color : 'transparent' }}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200
                      ${reportType === rt.key ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}
                      style={{ backgroundColor: reportType === rt.key ? rt.color : undefined }}
                    >
                      {rt.icon}
                    </div>
                    <div className="text-left">
                      <p className={`text-xs font-semibold transition-colors ${reportType === rt.key ? 'text-slate-900' : 'text-slate-600'}`}>{rt.label}</p>
                      <p className="text-[9px] text-slate-400">{rt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Report Content Area ── */}
            <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6">

              {printHeader}

              {/* ════════════════════════════════════════════════════
                  📊 SYNTHÈSE GÉNÉRALE
              ════════════════════════════════════════════════════ */}
              {reportType === 'synthese' && (
                <div className="space-y-6">
                  {/* Professional header */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-white">Rapport de Synthèse Générale</h2>
                            <p className="text-xs text-slate-300">Plan de Passation des Marchés — ORMVAG — Exercice 2026</p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <p>{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                          <p>{filtered.length} AO analysés</p>
                        </div>
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="p-6">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4 border border-blue-100">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-600" /></div>
                            <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">Total Projets</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900">{filteredKpis.totalProjects}</p>
                          <p className="text-[10px] text-slate-500 mt-1">{filtered.length} AO dans le PPM</p>
                        </div>
                        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 rounded-xl p-4 border border-violet-100">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center"><DollarSign className="w-4 h-4 text-violet-600" /></div>
                            <span className="text-[10px] font-medium text-violet-600 uppercase tracking-wide">Budget Total</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900">{fmtMDH(filteredKpis.totalBudget)}</p>
                          <p className="text-[10px] text-slate-500 mt-1">CP + CE cumulés</p>
                        </div>
                        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-4 border border-amber-100">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-amber-600" /></div>
                            <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">Estimation</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900">{fmtMDH(filteredKpis.totalEstimation)}</p>
                          <p className="text-[10px] text-slate-500 mt-1">Estimation administrative</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-4 border border-green-100">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-600" /></div>
                            <span className="text-[10px] font-medium text-green-600 uppercase tracking-wide">Engagements</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900">{fmtMDH(filteredKpis.totalEngagement)}</p>
                          <p className="text-[10px] text-slate-500 mt-1">Montant engagé total</p>
                        </div>
                      </div>

                      {/* Engagement Rate */}
                      <div className="mt-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-slate-700">Taux d&apos;engagement global</span>
                          <span className={`text-sm font-bold ${engRate >= 50 ? 'text-green-600' : engRate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{engRate}%</span>
                        </div>
                        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, engRate)}%`, backgroundColor: engRate >= 50 ? '#16a34a' : engRate >= 25 ? '#d97706' : '#dc2626' }} />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Distribution Table + Chart */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Status Distribution Table */}
                    <div className="lg:col-span-2 print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-800">Répartition par Statut</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Statut</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Nb Projets</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-slate-600">%</th>
                              <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Estimation</th>
                              <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Engagement</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statuses.map(s => {
                              const count = filteredStatusCount[s] || 0;
                              const pct = filteredKpis.totalProjects > 0 ? (count / filteredKpis.totalProjects * 100).toFixed(1) : '0.0';
                              return (
                                <tr key={s} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor[s] }} />
                                      <span className="font-medium text-slate-700">{s}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-center font-semibold text-slate-800">{count}</td>
                                  <td className="px-4 py-2.5 text-center text-slate-500">{pct}%</td>
                                  <td className="px-4 py-2.5 text-right font-medium text-blue-600">{fmtNum(filteredStatusBudget[s]?.estimation || 0)}</td>
                                  <td className="px-4 py-2.5 text-right font-medium text-green-600">{fmtNum(filteredStatusBudget[s]?.engagement || 0)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 font-semibold">
                              <td className="px-4 py-2.5 text-slate-800">Total</td>
                              <td className="px-4 py-2.5 text-center text-slate-800">{filteredKpis.totalProjects}</td>
                              <td className="px-4 py-2.5 text-center text-slate-800">100%</td>
                              <td className="px-4 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                              <td className="px-4 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Mini Pie Chart */}
                    <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h3 className="text-sm font-bold text-slate-800 mb-3">Distribution des Statuts</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name">
                            {statusData.map((entry, i) => (
                              <Cell key={i} fill={statusColor[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`${v} AO`, '']} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Auto-generated Summary */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <h3 className="text-sm font-bold text-slate-800">Synthèse Automatique</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Le PPM 2026 de l&apos;ORMVAG comprend <strong>{filteredKpis.totalProjects} AO</strong> pour un budget total de <strong>{fmtMDH(filteredKpis.totalBudget)}</strong>.
                      L&apos;estimation administrative s&apos;élève à <strong>{fmtMDH(filteredKpis.totalEstimation)}</strong> et les engagements atteignent <strong>{fmtMDH(filteredKpis.totalEngagement)}</strong>,
                      soit un taux d&apos;engagement de <strong>{engRate}%</strong>.
                      {filteredStatusCount['Engagé'] > 0 && ` ${filteredStatusCount['Engagé']} AO sont engagés.`}
                      {filteredStatusCount['Ouvert'] > 0 && ` ${filteredStatusCount['Ouvert']} AO restent ouverts.`}
                      {filteredStatusCount['Jugé'] > 0 && ` ${filteredStatusCount['Jugé']} AO ont été jugés.`}
                      {totalAlertCount > 0 && ` ${totalAlertCount} point(s) d'attention nécessitent un suivi.`}
                      {engRate >= 50
                        ? ' Le taux d\'engagement est satisfaisant, supérieur à 50%.'
                        : engRate >= 25
                        ? ' Le taux d\'engagement est moyen, des actions d\'accélération sont recommandées.'
                        : ' Le taux d\'engagement est faible, des mesures correctives urgentes sont nécessaires.'
                      }
                    </p>
                  </div>

                  {actionBar}
                </div>
              )}

              {/* ════════════════════════════════════════════════════
                  🏢 PAR ENTITÉ
              ════════════════════════════════════════════════════ */}
              {reportType === 'entite' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-green-700 to-emerald-800 px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-white">Rapport par Entité</h2>
                            <p className="text-xs text-green-200">Répartition détaillée des AO par entité — PPM 2026</p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-green-200">
                          <p>{entities.length} entités</p>
                          <p>{filtered.length} AO</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Entity Detail Table */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800">Détail par Entité</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Entité</th>
                            <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Nb Projets</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Estimation (MDH)</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Engagement (MDH)</th>
                            <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Taux Engagement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(filteredEntityBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
                            const rate = d.estimation > 0 ? Math.round((d.engagement / d.estimation) * 100) : 0;
                            const entityProjects = filtered.filter(p => p.entite === name);
                            const isExpanded = expandedReportEntity === name;
                            return (
                              <Fragment key={name}>
                                <tr className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer ${isExpanded ? 'bg-green-50/30' : ''}`} onClick={() => setExpandedReportEntity(isExpanded ? null : name)}>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entityColorMap[name] }} />
                                      <span className="font-semibold text-slate-700">{name}</span>
                                      <span className="print:hidden">{isExpanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-center font-semibold text-slate-800">{d.count}</td>
                                  <td className="px-4 py-2.5 text-right font-medium text-blue-600">{fmtNum(d.estimation)}</td>
                                  <td className="px-4 py-2.5 text-right font-medium text-green-600">{fmtNum(d.engagement)}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
                                      </div>
                                      <span className={`font-bold w-8 text-right text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && entityProjects.map(p => (
                                  <tr key={`${name}-${p.id}`} className="bg-slate-50/50 border-b border-slate-100">
                                    <td className="px-4 py-2 pl-10 text-slate-600" colSpan={2}>{p.objet.length > 60 ? p.objet.substring(0, 60) + '...' : p.objet}</td>
                                    <td className="px-4 py-2 text-right text-blue-500">{fmtNum(p.estimationAdmin || 0)}</td>
                                    <td className="px-4 py-2 text-right text-green-500">{fmtNum(p.montantEngagement || 0)}</td>
                                    <td className="px-4 py-2">
                                      <Badge className="text-[9px] h-4" style={{ backgroundColor: statusColor[p.situationAvancement] + '20', color: statusColor[p.situationAvancement], borderColor: statusColor[p.situationAvancement] + '30' }} variant="outline">
                                        {p.situationAvancement}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-semibold">
                            <td className="px-4 py-2.5 text-slate-800">Total</td>
                            <td className="px-4 py-2.5 text-center text-slate-800">{filteredKpis.totalProjects}</td>
                            <td className="px-4 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                            <td className="px-4 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, engRate)}%`, backgroundColor: engRate >= 50 ? '#16a34a' : engRate >= 25 ? '#d97706' : '#dc2626' }} />
                                </div>
                                <span className="font-bold w-8 text-right text-[10px]">{engRate}%</span>
                              </div>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Entity Comparison Chart */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Comparaison Estimation vs Engagement par Entité</h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={entityData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtMDH(v)} />
                        <Tooltip formatter={(v: number) => fmtMDH(v)} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="estimation" name="Estimation" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="engagement" name="Engagement" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {actionBar}
                </div>
              )}

              {/* ════════════════════════════════════════════════════
                  📋 PAR STATUT / ÉTAPE
              ════════════════════════════════════════════════════ */}
              {reportType === 'statut' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            <ClipboardList className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-white">Rapport par Statut / Étape</h2>
                            <p className="text-xs text-amber-200">Pipeline d&apos;avancement des AO — PPM 2026</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pipeline Visualization */}
                    <div className="p-6">
                      <div className="flex items-center gap-0 overflow-x-auto pb-2">
                        {PIPELINE_ORDER.map((step, i) => {
                          const mappedStatus = PIPELINE_STATUS_MAP[step];
                          const count = mappedStatus === '__computed__' ? ouvertProjects.length : (filteredStatusCount[mappedStatus] || 0);
                          const color = statusColor[mappedStatus === '__computed__' ? 'Ouvert' : mappedStatus] || '#6b7280';
                          return (
                            <div key={step} className="flex items-center shrink-0">
                              <div className="flex flex-col items-center min-w-[100px]">
                                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md" style={{ backgroundColor: color }}>
                                  {count}
                                </div>
                                <p className="text-[9px] font-medium text-slate-600 text-center mt-1.5 leading-tight max-w-[100px]">{step}</p>
                              </div>
                              {i < PIPELINE_ORDER.length - 1 && (
                                <div className="w-8 h-0.5 bg-slate-200 mx-1 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Status Detail Table */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800">Détail par Statut</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Statut</th>
                            <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Nb Projets</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Estimation (MDH)</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Engagement (MDH)</th>
                            <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Taux Engag.</th>
                            <th className="px-4 py-2.5 w-[140px] font-semibold text-slate-600 text-center">Répartition</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statuses.map(s => {
                            const count = filteredStatusCount[s] || 0;
                            const est = filteredStatusBudget[s]?.estimation || 0;
                            const eng = filteredStatusBudget[s]?.engagement || 0;
                            const sRate = est > 0 ? Math.round((eng / est) * 100) : 0;
                            const pct = filteredKpis.totalProjects > 0 ? (count / filteredKpis.totalProjects * 100) : 0;
                            return (
                              <tr key={s} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor[s] }} />
                                    <span className="font-semibold text-slate-700">{s}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center font-semibold text-slate-800">{count}</td>
                                <td className="px-4 py-2.5 text-right font-medium text-blue-600">{fmtNum(est)}</td>
                                <td className="px-4 py-2.5 text-right font-medium text-green-600">{fmtNum(eng)}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`font-bold ${sRate >= 50 ? 'text-green-600' : sRate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{sRate}%</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 2)}%`, backgroundColor: statusColor[s] }} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 w-8 text-right">{pct.toFixed(0)}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Status Distribution Pie Chart */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Distribution des Statuts</h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3} dataKey="value" nameKey="name" label={({ name, percent }: { name: string; percent: number }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                          {statusData.map((entry, i) => (
                            <Cell key={i} fill={statusColor[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [`${v} AO`, '']} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {actionBar}
                </div>
              )}

              {/* ════════════════════════════════════════════════════
                  ⚠️ ALERTES
              ════════════════════════════════════════════════════ */}
              {reportType === 'alertes' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-white">Rapport d&apos;Alertes</h2>
                            <p className="text-xs text-red-200">Points d&apos;attention nécessitant un suivi — PPM 2026</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <span className="text-3xl font-bold text-white">{totalAlertCount}</span>
                            <span className="text-xs text-red-200">alertes<br/>actives</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Alert Summary Cards */}
                    <div className="p-6">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {alertCats.filter(a => a.count > 0).slice(0, 4).map(cat => (
                          <div key={cat.key} className="rounded-xl border p-3" style={{ borderColor: cat.color + '30', backgroundColor: cat.color + '08' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                              <span className="text-[10px] font-medium text-slate-600">{cat.label}</span>
                            </div>
                            <p className="text-xl font-bold" style={{ color: cat.color }}>{cat.count}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Alert Detail Table */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800">Détail des Alertes</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Catégorie</th>
                            <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Nombre</th>
                            <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Sévérité</th>
                            <th className="px-4 py-2.5 w-[200px] font-semibold text-slate-600">Proportion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alertCats.map(cat => (
                            <tr key={cat.key} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                  <span className="font-medium text-slate-700">{cat.label}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="font-bold text-lg" style={{ color: cat.color }}>{cat.count}</span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <Badge className="text-[9px]" variant="outline" style={{ color: cat.count > 5 ? '#dc2626' : cat.count > 2 ? '#d97706' : '#16a34a', borderColor: cat.count > 5 ? '#dc262630' : cat.count > 2 ? '#d9770630' : '#16a34a30', backgroundColor: cat.count > 5 ? '#dc262608' : cat.count > 2 ? '#d9770608' : '#16a34a08' }}>
                                  {cat.count > 5 ? 'Élevée' : cat.count > 2 ? 'Moyenne' : 'Faible'}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${filteredKpis.totalProjects > 0 ? Math.min(100, (cat.count / filteredKpis.totalProjects) * 100 * 3) : 0}%`, backgroundColor: cat.color }} />
                                  </div>
                                  <span className="text-[10px] text-slate-500 w-10 text-right">{filteredKpis.totalProjects > 0 ? (cat.count / filteredKpis.totalProjects * 100).toFixed(1) : '0.0'}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Link to Alertes tab */}
                  <div className="print:hidden flex justify-center">
                    <Button onClick={() => setSidebarTab('alerts')} className="h-10 text-sm gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-500/20 px-8">
                      <AlertTriangle className="w-4 h-4" />Voir les Alertes Détaillées
                    </Button>
                  </div>

                  {actionBar}
                </div>
              )}

              {/* ════════════════════════════════════════════════════
                  💰 SUIVI FINANCIER
              ════════════════════════════════════════════════════ */}
              {reportType === 'financier' && (() => {
                const totalReste = filteredKpis.totalEstimation - filteredKpis.totalEngagement;
                const top5Engagements = [...filtered].filter(p => p.montantEngagement && p.montantEngagement > 0).sort((a, b) => (b.montantEngagement || 0) - (a.montantEngagement || 0)).slice(0, 5);
                const top5Unengaged = [...filtered].filter(p => p.situationAvancement === 'Jugé' && (!p.montantEngagement || p.montantEngagement === 0)).sort((a, b) => (b.estimationAdmin || 0) - (a.estimationAdmin || 0)).slice(0, 5);

                return (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-cyan-700 to-teal-700 px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            <Wallet className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-white">Suivi Financier</h2>
                            <p className="text-xs text-cyan-200">Tableau de bord financier — PPM 2026</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Financial Comparison Cards */}
                    <div className="p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 rounded-xl p-5 border border-violet-100 text-center">
                          <DollarSign className="w-6 h-6 text-violet-500 mx-auto mb-2" />
                          <p className="text-[10px] font-medium text-violet-600 uppercase tracking-wide">Budget (CP+CE)</p>
                          <p className="text-xl font-bold text-slate-900 mt-1">{fmtMDH(filteredKpis.totalBudget)}</p>
                          <p className="text-[10px] text-slate-400 mt-1">CP: {fmtMDH(filteredKpis.totalCP)} · CE: {fmtMDH(filteredKpis.totalCE)}</p>
                        </div>
                        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-5 border border-amber-100 text-center">
                          <TrendingUp className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                          <p className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">Estimation Admin.</p>
                          <p className="text-xl font-bold text-slate-900 mt-1">{fmtMDH(filteredKpis.totalEstimation)}</p>
                          <p className="text-[10px] text-slate-400 mt-1">Total des estimations</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-5 border border-green-100 text-center">
                          <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                          <p className="text-[10px] font-medium text-green-600 uppercase tracking-wide">Engagement</p>
                          <p className="text-xl font-bold text-slate-900 mt-1">{fmtMDH(filteredKpis.totalEngagement)}</p>
                          <p className="text-[10px] text-slate-400 mt-1">Reste à engager: {fmtMDH(totalReste)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Entity Financial Breakdown Table */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800">Ventilation Financière par Entité</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Entité</th>
                            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Budget CP</th>
                            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Budget CE</th>
                            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Estimation</th>
                            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Engagement</th>
                            <th className="px-3 py-2.5 text-center font-semibold text-slate-600">Taux</th>
                            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Reste à engager</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(filteredEntityBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
                            const rate = d.estimation > 0 ? Math.round((d.engagement / d.estimation) * 100) : 0;
                            const reste = d.estimation - d.engagement;
                            return (
                              <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entityColorMap[name] }} />
                                    <span className="font-semibold text-slate-700">{name}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{fmtNum(d.cp)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{fmtNum(d.ce)}</td>
                                <td className="px-3 py-2.5 text-right font-medium text-blue-600">{fmtNum(d.estimation)}</td>
                                <td className="px-3 py-2.5 text-right font-medium text-green-600">{fmtNum(d.engagement)}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
                                    </div>
                                    <span className={`font-bold text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium text-red-600">{fmtNum(reste)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-semibold">
                            <td className="px-3 py-2.5 text-slate-800">Total</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{fmtNum(filteredKpis.totalCP)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{fmtNum(filteredKpis.totalCE)}</td>
                            <td className="px-3 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                            <td className="px-3 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`font-bold text-[10px] ${engRate >= 50 ? 'text-green-600' : engRate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{engRate}%</span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-red-700">{fmtNum(totalReste)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Top 5 Lists */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top 5 Engagements */}
                    <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <h3 className="text-sm font-bold text-slate-800">Top 5 Engagements</h3>
                      </div>
                      {top5Engagements.length > 0 ? (
                        <div className="space-y-3">
                          {top5Engagements.map((p, i) => (
                            <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-green-50/50 border border-green-100/50">
                              <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium text-slate-700 truncate">{p.objet}</p>
                                <p className="text-[9px] text-slate-400">{p.entite}</p>
                              </div>
                              <span className="text-xs font-bold text-green-600 shrink-0">{fmtMDH(p.montantEngagement || 0)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-4">Aucun engagement enregistré</p>
                      )}
                    </div>

                    {/* Top 5 Unengaged */}
                    <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-bold text-slate-800">Top 5 Jugés sans Engagement</h3>
                      </div>
                      {top5Unengaged.length > 0 ? (
                        <div className="space-y-3">
                          {top5Unengaged.map((p, i) => (
                            <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-amber-50/50 border border-amber-100/50">
                              <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium text-slate-700 truncate">{p.objet}</p>
                                <p className="text-[9px] text-slate-400">{p.entite}</p>
                              </div>
                              <span className="text-xs font-bold text-amber-600 shrink-0">{fmtMDH(p.estimationAdmin || 0)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-4">Aucun AO jugé sans engagement</p>
                      )}
                    </div>
                  </div>

                  {actionBar}
                </div>
                );
              })()}

              {/* ════════════════════════════════════════════════════
                  📅 CHRONOLOGIQUE
              ════════════════════════════════════════════════════ */}
              {reportType === 'chrono' && (() => {
                const monthlyEntries = Object.entries(filteredMonthlyTimeline).sort(([a], [b]) => a.localeCompare(b));

                return (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-violet-700 to-purple-700 px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            <CalendarDays className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-white">Rapport Chronologique</h2>
                            <p className="text-xs text-violet-200">Timeline des ouvertures par mois — PPM 2026</p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-violet-200">
                          <p>{monthlyEntries.length} mois actifs</p>
                          <p>{filtered.filter(p => isValidDate(p.dateOuverture)).length} ouvertures planifiées</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Table */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800">Ouvertures par Mois</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Mois</th>
                            <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Nb AO</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Estimation (MDH)</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Engagement (MDH)</th>
                            <th className="px-4 py-2.5 w-[140px] font-semibold text-slate-600 text-center">Activité</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyEntries.map(([month, d]) => {
                            const maxCount = Math.max(...monthlyEntries.map(([, md]) => md.count), 1);
                            const barWidth = (d.count / maxCount) * 100;
                            return (
                              <tr key={month} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-2.5">
                                  <span className="font-semibold text-slate-700">{monthLabel(month)}</span>
                                </td>
                                <td className="px-4 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                                <td className="px-4 py-2.5 text-right font-medium text-blue-600">{fmtNum(d.estimation)}</td>
                                <td className="px-4 py-2.5 text-right font-medium text-green-600">{fmtNum(d.engagement)}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${barWidth}%` }} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 w-6 text-right">{d.count}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-semibold">
                            <td className="px-4 py-2.5 text-slate-800">Total</td>
                            <td className="px-4 py-2.5 text-center text-slate-800">{monthlyEntries.reduce((s, [, d]) => s + d.count, 0)}</td>
                            <td className="px-4 py-2.5 text-right text-blue-700">{fmtNum(monthlyEntries.reduce((s, [, d]) => s + d.estimation, 0))}</td>
                            <td className="px-4 py-2.5 text-right text-green-700">{fmtNum(monthlyEntries.reduce((s, [, d]) => s + d.engagement, 0))}</td>
                            <td className="px-4 py-2.5"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Monthly Trend Area Chart */}
                  <div className="print:no-break bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Tendance Mensuelle</h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={timelineData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="estGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtMDH(v)} />
                        <Tooltip formatter={(v: number) => fmtMDH(v)} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="estimation" name="Estimation" stroke="#3b82f6" fill="url(#estGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="engagement" name="Engagement" stroke="#16a34a" fill="url(#engGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {actionBar}
                </div>
                );
              })()}

            </div>
          </div>
          );
        })()}

        {/* ── Full-Screen View: Délais ── */}
        {sidebarTab === 'delais' && (() => {
          // Compute delays between key dates
          type DelayRecord = { id: number; objet: string; entite: string; statut: string; estimation: number; dateOuverture: string; dateJugement: string | null; dateEngagement: string | null; delaiOuvJuge: number | null; delaiOuvEng: number | null; delaiJugeEng: number | null; };
          const delayData: DelayRecord[] = sidebarStatusFiltered.filter(p => isValidDate(p.dateOuverture)).map(p => {
            const dOuv = new Date(p.dateOuverture);
            let delaiOuvJuge: number | null = null;
            let delaiOuvEng: number | null = null;
            let delaiJugeEng: number | null = null;
            if (isValidDate(p.dateJugement)) {
              const dJuge = new Date(p.dateJugement);
              const days = Math.round((dJuge.getTime() - dOuv.getTime()) / (1000 * 60 * 60 * 24));
              delaiOuvJuge = days >= 0 ? days : null; // negative = anomalie de données, laisser vide
            }
            if (isValidDate(p.dateEngagement)) {
              const dEng = new Date(p.dateEngagement);
              const days = Math.round((dEng.getTime() - dOuv.getTime()) / (1000 * 60 * 60 * 24));
              delaiOuvEng = days >= 0 ? days : null;
            }
            if (isValidDate(p.dateJugement) && isValidDate(p.dateEngagement)) {
              const dJuge = new Date(p.dateJugement);
              const dEng = new Date(p.dateEngagement);
              const days = Math.round((dEng.getTime() - dJuge.getTime()) / (1000 * 60 * 60 * 24));
              delaiJugeEng = days >= 0 ? days : null;
            }
            return { id: p.id, objet: p.objet, entite: p.entite, statut: p.situationAvancement, estimation: p.estimationAdmin || 0, dateOuverture: p.dateOuverture, dateJugement: p.dateJugement, dateEngagement: p.dateEngagement, delaiOuvJuge, delaiOuvEng, delaiJugeEng };
          });

          const withOuvJuge = delayData.filter(d => d.delaiOuvJuge !== null);
          const withOuvEng = delayData.filter(d => d.delaiOuvEng !== null);
          const withJugeEng = delayData.filter(d => d.delaiJugeEng !== null);

          const avgOuvJuge = withOuvJuge.length > 0 ? Math.round(withOuvJuge.reduce((s, d) => s + (d.delaiOuvJuge || 0), 0) / withOuvJuge.length) : 0;
          const avgOuvEng = withOuvEng.length > 0 ? Math.round(withOuvEng.reduce((s, d) => s + (d.delaiOuvEng || 0), 0) / withOuvEng.length) : 0;
          const avgJugeEng = withJugeEng.length > 0 ? Math.round(withJugeEng.reduce((s, d) => s + (d.delaiJugeEng || 0), 0) / withJugeEng.length) : 0;

          const minOuvJuge = withOuvJuge.length > 0 ? Math.min(...withOuvJuge.map(d => d.delaiOuvJuge || 0)) : 0;
          const maxOuvJuge = withOuvJuge.length > 0 ? Math.max(...withOuvJuge.map(d => d.delaiOuvJuge || 0)) : 0;
          const minOuvEng = withOuvEng.length > 0 ? Math.min(...withOuvEng.map(d => d.delaiOuvEng || 0)) : 0;
          const maxOuvEng = withOuvEng.length > 0 ? Math.max(...withOuvEng.map(d => d.delaiOuvEng || 0)) : 0;
          const minJugeEng = withJugeEng.length > 0 ? Math.min(...withJugeEng.map(d => d.delaiJugeEng || 0)) : 0;
          const maxJugeEng = withJugeEng.length > 0 ? Math.max(...withJugeEng.map(d => d.delaiJugeEng || 0)) : 0;

          // Distribution buckets
          const bucketSize = 15;
          const makeBuckets = (data: DelayRecord[], key: 'delaiOuvJuge' | 'delaiOuvEng' | 'delaiJugeEng') => {
            if (data.length === 0) return [];
            const vals = data.map(d => d[key] || 0);
            const mn = Math.min(...vals);
            const mx = Math.max(...vals);
            const buckets: { label: string; count: number; min: number; max: number }[] = [];
            for (let i = Math.floor(mn / bucketSize) * bucketSize; i <= mx; i += bucketSize) {
              const label = `${i}-${i + bucketSize}j`;
              const count = vals.filter(v => v >= i && v < i + bucketSize).length;
              buckets.push({ label, count, min: i, max: i + bucketSize });
            }
            return buckets;
          };

          // Per-entity delays
          const entityDelays: Record<string, { count: number; avgOuvJuge: number; avgOuvEng: number; avgJugeEng: number }> = {};
          delayData.forEach(d => {
            if (!entityDelays[d.entite]) entityDelays[d.entite] = { count: 0, avgOuvJuge: 0, avgOuvEng: 0, avgJugeEng: 0 };
            entityDelays[d.entite].count += 1;
          });
          Object.keys(entityDelays).forEach(ent => {
            const entData = delayData.filter(d => d.entite === ent);
            const oj = entData.filter(d => d.delaiOuvJuge !== null);
            const oe = entData.filter(d => d.delaiOuvEng !== null);
            const je = entData.filter(d => d.delaiJugeEng !== null);
            entityDelays[ent].avgOuvJuge = oj.length > 0 ? Math.round(oj.reduce((s, d) => s + (d.delaiOuvJuge || 0), 0) / oj.length) : 0;
            entityDelays[ent].avgOuvEng = oe.length > 0 ? Math.round(oe.reduce((s, d) => s + (d.delaiOuvEng || 0), 0) / oe.length) : 0;
            entityDelays[ent].avgJugeEng = je.length > 0 ? Math.round(je.reduce((s, d) => s + (d.delaiJugeEng || 0), 0) / je.length) : 0;
          });

          // Per-status delays
          const statusDelays: Record<string, { count: number; avgOuvJuge: number; avgOuvEng: number; avgJugeEng: number }> = {};
          delayData.forEach(d => {
            if (!statusDelays[d.statut]) statusDelays[d.statut] = { count: 0, avgOuvJuge: 0, avgOuvEng: 0, avgJugeEng: 0 };
            statusDelays[d.statut].count += 1;
          });
          Object.keys(statusDelays).forEach(st => {
            const stData = delayData.filter(d => d.statut === st);
            const oj = stData.filter(d => d.delaiOuvJuge !== null);
            const oe = stData.filter(d => d.delaiOuvEng !== null);
            const je = stData.filter(d => d.delaiJugeEng !== null);
            statusDelays[st].avgOuvJuge = oj.length > 0 ? Math.round(oj.reduce((s, d) => s + (d.delaiOuvJuge || 0), 0) / oj.length) : 0;
            statusDelays[st].avgOuvEng = oe.length > 0 ? Math.round(oe.reduce((s, d) => s + (d.delaiOuvEng || 0), 0) / oe.length) : 0;
            statusDelays[st].avgJugeEng = je.length > 0 ? Math.round(je.reduce((s, d) => s + (d.delaiJugeEng || 0), 0) / je.length) : 0;
          });

          // AO still pending (ouvert, no jugement yet) — compute days since ouverture
          const today = new Date();
          const pendingSinceOuv = delayData.filter(d => d.delaiOuvJuge === null).map(d => ({
            ...d,
            joursEnAttente: Math.round((today.getTime() - new Date(d.dateOuverture).getTime()) / (1000 * 60 * 60 * 24)),
          })).sort((a, b) => b.joursEnAttente - a.joursEnAttente);

          // Slowest AO per category
          const slowestOuvJuge = [...delayData].filter(d => d.delaiOuvJuge !== null).sort((a, b) => (b.delaiOuvJuge || 0) - (a.delaiOuvJuge || 0)).slice(0, 10);
          const slowestJugeEng = [...delayData].filter(d => d.delaiJugeEng !== null).sort((a, b) => (b.delaiJugeEng || 0) - (a.delaiJugeEng || 0)).slice(0, 10);
          const slowestOuvEng = [...delayData].filter(d => d.delaiOuvEng !== null).sort((a, b) => (b.delaiOuvEng || 0) - (a.delaiOuvEng || 0)).slice(0, 10);

          // Chart data for recharts
          const bucketChartOJ = makeBuckets(withOuvJuge, 'delaiOuvJuge');
          const bucketChartOE = makeBuckets(withOuvEng, 'delaiOuvEng');
          const bucketChartJE = makeBuckets(withJugeEng, 'delaiJugeEng');

          const statusColorMap: Record<string, string> = { 'Engagé': '#16a34a', 'Jugé': '#8b5cf6', 'En cours de jugement': '#f59e0b', 'Infructueux': '#dc2626', 'Annulé': '#991b1b', 'Publié sur PMP': '#7c3aed', 'DAO Envoyé au CE': '#0891b2', 'A programmer': '#6b7280' };

          return (
          <div className="min-h-screen bg-white text-slate-800 animate-fade-in-up">
            {/* Top Bar */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
                      <Timer className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Analyse des Délais</h2>
                      <p className="text-[10px] text-slate-500">Délais entre Ouverture des Plis, Jugement et Engagement</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input placeholder="Rechercher AO..." className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 w-48" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              {/* Filter Bar */}
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filterEntity} onValueChange={setFilterEntity}>
                    <SelectTrigger className="h-7 text-[10px] w-[130px] bg-white border-slate-200"><SelectValue placeholder="Entité" /></SelectTrigger>
                    <SelectContent>{entities.map(e => <SelectItem key={e} value={e} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: entityColorMap[e]}} />{e}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes les entités</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Statut" /></SelectTrigger>
                    <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: statusColor[s]}} />{s}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous les statuts</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterNature} onValueChange={setFilterNature}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Nature" /></SelectTrigger>
                    <SelectContent>{natures.map(n => <SelectItem key={n} value={n} className="text-[10px]">{n}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes natures</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous types</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                    <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Programme" /></SelectTrigger>
                    <SelectContent>{programmes.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous programmes</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterProjet} onValueChange={setFilterProjet}>
                    <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Projet" /></SelectTrigger>
                    <SelectContent>{projets.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous AO</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="h-7 text-[10px] w-[130px] bg-white border-slate-200"><SelectValue placeholder="Source" /></SelectTrigger>
                    <SelectContent>{sources.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes sources</SelectItem></SelectContent>
                  </Select>
                  <span className="text-[10px] text-slate-400 ml-auto">{sidebarStatusFiltered.length} AO</span>
                </div>
              </div>
            </div>

            <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Ouv -> Jugé */}
                <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #f59e0b' }}>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm"><ArrowLeftRight className="w-4 h-4 text-white" /></span>
                      Délai Ouverture → Jugement
                      <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200 border ml-auto">{withOuvJuge.length} AO</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="text-center mb-3">
                      <p className="text-3xl font-bold text-amber-600">{avgOuvJuge} <span className="text-sm text-slate-500">jours</span></p>
                      <p className="text-[10px] text-slate-400">Délai moyen</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-amber-50 rounded-lg p-2">
                        <p className="text-[9px] text-slate-500">Min</p>
                        <p className="text-sm font-bold text-amber-700">{minOuvJuge}j</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-2">
                        <p className="text-[9px] text-slate-500">Max</p>
                        <p className="text-sm font-bold text-amber-700">{maxOuvJuge}j</p>
                      </div>
                    </div>
                    {/* Distribution */}
                    {bucketChartOJ.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">Distribution</p>
                        {bucketChartOJ.map(b => (
                          <div key={b.label} className="flex items-center gap-2 text-[9px]">
                            <span className="w-16 text-slate-500 text-right">{b.label}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-400" style={{ width: `${withOuvJuge.length > 0 ? (b.count / withOuvJuge.length) * 100 : 0}%` }} />
                            </div>
                            <span className="w-6 text-slate-700 font-bold">{b.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Juge -> Eng (2nd étape chronologique) */}
                <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #16a34a' }}>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-green-500 flex items-center justify-center shadow-sm"><ArrowLeftRight className="w-4 h-4 text-white" /></span>
                      Délai Jugement → Engagement
                      <Badge className="text-[9px] bg-green-100 text-green-700 border-green-200 border ml-auto">{withJugeEng.length} AO</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="text-center mb-3">
                      <p className="text-3xl font-bold text-green-600">{avgJugeEng} <span className="text-sm text-slate-500">jours</span></p>
                      <p className="text-[10px] text-slate-400">Délai moyen</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-green-50 rounded-lg p-2">
                        <p className="text-[9px] text-slate-500">Min</p>
                        <p className="text-sm font-bold text-green-700">{minJugeEng}j</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2">
                        <p className="text-[9px] text-slate-500">Max</p>
                        <p className="text-sm font-bold text-green-700">{maxJugeEng}j</p>
                      </div>
                    </div>
                    {/* Distribution */}
                    {bucketChartJE.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">Distribution</p>
                        {bucketChartJE.map(b => (
                          <div key={b.label} className="flex items-center gap-2 text-[9px]">
                            <span className="w-16 text-slate-500 text-right">{b.label}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-green-400" style={{ width: `${withJugeEng.length > 0 ? (b.count / withJugeEng.length) * 100 : 0}%` }} />
                            </div>
                            <span className="w-6 text-slate-700 font-bold">{b.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Ouv -> Eng (3ème étape chronologique — délai global) */}
                <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #3b82f6' }}>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shadow-sm"><ArrowLeftRight className="w-4 h-4 text-white" /></span>
                      Délai Ouverture → Engagement
                      <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200 border ml-auto">{withOuvEng.length} AO</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="text-center mb-3">
                      <p className="text-3xl font-bold text-blue-600">{avgOuvEng} <span className="text-sm text-slate-500">jours</span></p>
                      <p className="text-[10px] text-slate-400">Délai moyen</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-blue-50 rounded-lg p-2">
                        <p className="text-[9px] text-slate-500">Min</p>
                        <p className="text-sm font-bold text-blue-700">{minOuvEng}j</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2">
                        <p className="text-[9px] text-slate-500">Max</p>
                        <p className="text-sm font-bold text-blue-700">{maxOuvEng}j</p>
                      </div>
                    </div>
                    {/* Distribution */}
                    {bucketChartOE.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">Distribution</p>
                        {bucketChartOE.map(b => (
                          <div key={b.label} className="flex items-center gap-2 text-[9px]">
                            <span className="w-16 text-slate-500 text-right">{b.label}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-blue-400" style={{ width: `${withOuvEng.length > 0 ? (b.count / withOuvEng.length) * 100 : 0}%` }} />
                            </div>
                            <span className="w-6 text-slate-700 font-bold">{b.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Bar Charts for Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="border-0 shadow-md">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-xs font-semibold text-slate-700">Distribution Ouv. → Jugé (jours)</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bucketChartOJ} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                          <Tooltip contentStyle={{ fontSize: 10 }} />
                          <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Nb AO" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-xs font-semibold text-slate-700">Distribution Jugé → Engagé (jours)</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bucketChartJE} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                          <Tooltip contentStyle={{ fontSize: 10 }} />
                          <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} name="Nb AO" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-xs font-semibold text-slate-700">Distribution Ouv. → Engagé (jours)</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bucketChartOE} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                          <Tooltip contentStyle={{ fontSize: 10 }} />
                          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Nb AO" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Per-Entity Delay Analysis */}
              <Card className="border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-green-500" />
                    Délais Moyens par Entité
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                          <th className="px-4 py-2.5 text-left">Entité</th>
                          <th className="px-4 py-2.5 text-center">Nb AO</th>
                          <th className="px-4 py-2.5 text-center">Avg Ouv.→Jugé (j)</th>
                          <th className="px-4 py-2.5 text-center">Avg Jugé→Eng. (j)</th>
                          <th className="px-4 py-2.5 text-center">Avg Ouv.→Eng. (j)</th>
                          <th className="px-4 py-2.5 text-left">Comparaison</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(entityDelays).sort(([, a], [, b]) => b.avgOuvEng - a.avgOuvEng).map(([name, d]) => {
                          const maxAvg = Math.max(d.avgOuvJuge, d.avgOuvEng, d.avgJugeEng, 1);
                          return (
                            <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entityColorMap[name] || '#3b82f6' }} />
                                  <span className="font-semibold text-slate-700">{name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                              <td className="px-4 py-2.5 text-center">
                                {d.avgOuvJuge > 0 ? (
                                  <span className="font-bold text-amber-600">{d.avgOuvJuge}j</span>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {d.avgJugeEng > 0 ? (
                                  <span className="font-bold text-green-600">{d.avgJugeEng}j</span>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {d.avgOuvEng > 0 ? (
                                  <span className="font-bold text-blue-600">{d.avgOuvEng}j</span>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1 items-center">
                                  {d.avgOuvJuge > 0 && (
                                    <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(100, (d.avgOuvJuge / maxAvg) * 60)}px` }} title={`Ouv→Jugé: ${d.avgOuvJuge}j`} />
                                  )}
                                  {d.avgJugeEng > 0 && (
                                    <div className="h-2 rounded-full bg-green-400" style={{ width: `${Math.min(100, (d.avgJugeEng / maxAvg) * 60)}px` }} title={`Jugé→Eng: ${d.avgJugeEng}j`} />
                                  )}
                                  {d.avgOuvEng > 0 && (
                                    <div className="h-2 rounded-full bg-blue-400" style={{ width: `${Math.min(100, (d.avgOuvEng / maxAvg) * 60)}px` }} title={`Ouv→Eng: ${d.avgOuvEng}j`} />
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Per-Status Delay Analysis */}
              <Card className="border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-violet-500" />
                    Délais Moyens par Statut
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                          <th className="px-4 py-2.5 text-left">Statut</th>
                          <th className="px-4 py-2.5 text-center">Nb AO</th>
                          <th className="px-4 py-2.5 text-center">Avg Ouv.→Jugé (j)</th>
                          <th className="px-4 py-2.5 text-center">Avg Jugé→Eng. (j)</th>
                          <th className="px-4 py-2.5 text-center">Avg Ouv.→Eng. (j)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(statusDelays).sort(([, a], [, b]) => b.count - a.count).map(([name, d]) => (
                          <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: statusColorMap[name] || '#6b7280' }} />
                                <span className="font-semibold text-slate-700">{name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                            <td className="px-4 py-2.5 text-center">
                              {d.avgOuvJuge > 0 ? <span className="font-bold text-amber-600">{d.avgOuvJuge}j</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {d.avgJugeEng > 0 ? <span className="font-bold text-green-600">{d.avgJugeEng}j</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {d.avgOuvEng > 0 ? <span className="font-bold text-blue-600">{d.avgOuvEng}j</span> : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Top 5 Rankings per Delay Type */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Top 5 Ouv→Jugé */}
                <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #f59e0b' }}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-amber-500" />
                      Top 5 Ouv. → Jugé
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-amber-50/50 border-b border-amber-100 text-[9px] text-amber-700 uppercase tracking-wider">
                          <th className="px-2 py-1.5 text-center">#</th>
                          <th className="px-2 py-1.5 text-left">Objet</th>
                          <th className="px-2 py-1.5 text-center font-bold">Jours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slowestOuvJuge.slice(0, 5).map((d, i) => (
                          <tr key={d.id} className="border-b border-slate-50 hover:bg-amber-50/30 transition-colors">
                            <td className="px-2 py-1.5 text-center">
                              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold ${i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                            </td>
                            <td className="px-2 py-1.5 text-slate-700 max-w-[180px] truncate text-[10px]" title={d.objet}>{d.objet}</td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={`font-bold ${d.delaiOuvJuge! > avgOuvJuge ? 'text-red-600' : 'text-amber-600'}`}>{d.delaiOuvJuge}j</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Top 5 Jugé→Eng */}
                <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #16a34a' }}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-green-500" />
                      Top 5 Jugé → Engagé
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-green-50/50 border-b border-green-100 text-[9px] text-green-700 uppercase tracking-wider">
                          <th className="px-2 py-1.5 text-center">#</th>
                          <th className="px-2 py-1.5 text-left">Objet</th>
                          <th className="px-2 py-1.5 text-center font-bold">Jours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slowestJugeEng.slice(0, 5).map((d, i) => (
                          <tr key={d.id} className="border-b border-slate-50 hover:bg-green-50/30 transition-colors">
                            <td className="px-2 py-1.5 text-center">
                              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold ${i < 3 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                            </td>
                            <td className="px-2 py-1.5 text-slate-700 max-w-[180px] truncate text-[10px]" title={d.objet}>{d.objet}</td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={`font-bold ${d.delaiJugeEng! > avgJugeEng ? 'text-red-600' : 'text-green-600'}`}>{d.delaiJugeEng}j</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Top 5 Ouv→Eng */}
                <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #3b82f6' }}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500" />
                      Top 5 Ouv. → Engagé
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-blue-50/50 border-b border-blue-100 text-[9px] text-blue-700 uppercase tracking-wider">
                          <th className="px-2 py-1.5 text-center">#</th>
                          <th className="px-2 py-1.5 text-left">Objet</th>
                          <th className="px-2 py-1.5 text-center font-bold">Jours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slowestOuvEng.slice(0, 5).map((d, i) => (
                          <tr key={d.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                            <td className="px-2 py-1.5 text-center">
                              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold ${i < 3 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                            </td>
                            <td className="px-2 py-1.5 text-slate-700 max-w-[180px] truncate text-[10px]" title={d.objet}>{d.objet}</td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={`font-bold ${d.delaiOuvEng! > avgOuvEng ? 'text-red-600' : 'text-blue-600'}`}>{d.delaiOuvEng}j</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              {/* AO en attente (no jugement yet) */}
              {pendingSinceOuv.length > 0 && (
              <Card className="border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    AO en attente de Jugement
                    <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200 border ml-auto">{pendingSinceOuv.length} AO</Badge>
                  </CardTitle>
                  <p className="text-[10px] text-slate-400">AO avec date d&apos;ouverture mais sans jugement — jours écoulés depuis l&apos;ouverture</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                          <th className="px-3 py-2.5 text-left">Objet</th>
                          <th className="px-3 py-2.5 text-left">Entité</th>
                          <th className="px-3 py-2.5 text-center">Statut</th>
                          <th className="px-3 py-2.5 text-center">Date Ouverture</th>
                          <th className="px-3 py-2.5 text-center font-bold">Jours en attente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingSinceOuv.slice(0, 20).map(d => (
                          <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2 text-slate-700 max-w-[300px] truncate" title={d.objet}>{d.objet}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entityColorMap[d.entite] || '#3b82f6' }} />
                                <span className="text-slate-600">{d.entite}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge className="text-[9px] border-0" style={{ backgroundColor: `${statusColorMap[d.statut] || '#6b7280'}20`, color: statusColorMap[d.statut] || '#6b7280' }}>{d.statut}</Badge>
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{d.dateOuverture}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (d.joursEnAttente / Math.max(...pendingSinceOuv.map(p => p.joursEnAttente), 1)) * 100)}%`, backgroundColor: d.joursEnAttente > 60 ? '#dc2626' : d.joursEnAttente > 30 ? '#f59e0b' : '#16a34a' }} />
                                </div>
                                <span className={`font-bold ${d.joursEnAttente > 60 ? 'text-red-600' : d.joursEnAttente > 30 ? 'text-amber-600' : 'text-green-600'}`}>{d.joursEnAttente}j</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Full Detail Table */}
              <Card className="border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Détail des Délais par AO
                    <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200 border ml-auto">{delayData.length} AO</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                          <th className="px-3 py-2.5 text-left">Objet</th>
                          <th className="px-3 py-2.5 text-left">Entité</th>
                          <th className="px-3 py-2.5 text-center">Statut</th>
                          <th className="px-3 py-2.5 text-center">Ouv. Plis</th>
                          <th className="px-3 py-2.5 text-center">Jugement</th>
                          <th className="px-3 py-2.5 text-center">Engagement</th>
                          <th className="px-3 py-2.5 text-center text-amber-600">Ouv→Jugé</th>
                          <th className="px-3 py-2.5 text-center text-green-600">Jugé→Eng</th>
                          <th className="px-3 py-2.5 text-center text-blue-600">Ouv→Eng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delayData.sort((a, b) => {
                          // Sort by Ouv→Eng desc, nulls at bottom
                          if (a.delaiOuvEng === null && b.delaiOuvEng === null) return 0;
                          if (a.delaiOuvEng === null) return 1;
                          if (b.delaiOuvEng === null) return -1;
                          return (b.delaiOuvEng || 0) - (a.delaiOuvEng || 0);
                        }).map(d => (
                          <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2 text-slate-700 max-w-[250px] truncate" title={d.objet}>{d.objet}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entityColorMap[d.entite] || '#3b82f6' }} />
                                <span className="text-slate-600">{d.entite}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge className="text-[9px] border-0" style={{ backgroundColor: `${statusColorMap[d.statut] || '#6b7280'}20`, color: statusColorMap[d.statut] || '#6b7280' }}>{d.statut}</Badge>
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{d.dateOuverture}</td>
                            <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{d.dateJugement || '—'}</td>
                            <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-600">{d.dateEngagement || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {d.delaiOuvJuge !== null ? <span className="font-bold text-amber-600">{d.delaiOuvJuge}j</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {d.delaiJugeEng !== null ? <span className="font-bold text-green-600">{d.delaiJugeEng}j</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {d.delaiOuvEng !== null ? <span className="font-bold text-blue-600">{d.delaiOuvEng}j</span> : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          );
        })()}

        {/* ── Full-Screen View 6: Alertes ── */}
        {sidebarTab === 'alerts' && (() => {
          const alertCategories = [
            {
              key: 'ouvert-sans-date',
              label: 'Ouvert sans date d\'ouverture des plis',
              icon: <CalendarDays className="w-4 h-4" />,
              color: '#3b82f6',
              bg: 'bg-blue-50',
              border: 'border-blue-200',
              textColor: 'text-blue-700',
              headerBg: 'bg-blue-500',
              items: filtered.filter(p => (p.situationAvancement === 'Ouvert' || (PIPELINE_STATUS_MAP['Ouvert'] !== '__computed__' && p.situationAvancement === PIPELINE_STATUS_MAP['Ouvert'])) && !isValidDate(p.dateOuverture)),
              columns: ['Objet', 'Entité', 'Estimation', 'N° AO'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'N° AO') return p.numAO || '—';
                return '';
              },
            },
            {
              key: 'juge-sans-engagement',
              label: 'Jugé sans engagement',
              icon: <DollarSign className="w-4 h-4" />,
              color: '#d97706',
              bg: 'bg-amber-50',
              border: 'border-amber-200',
              textColor: 'text-amber-700',
              headerBg: 'bg-amber-500',
              items: filtered.filter(p => p.situationAvancement === 'Jugé' && (!p.montantEngagement || p.montantEngagement === 0)),
              columns: ['Objet', 'Entité', 'Estimation', 'Date Jugement'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'Date Jugement') return isValidDate(p.dateJugement) ? p.dateJugement : '—';
                return '';
              },
            },
            {
              key: 'juge-sans-date',
              label: 'Jugé sans date de jugement',
              icon: <Clock className="w-4 h-4" />,
              color: '#2563eb',
              bg: 'bg-indigo-50',
              border: 'border-indigo-200',
              textColor: 'text-indigo-700',
              headerBg: 'bg-indigo-500',
              items: filtered.filter(p => p.situationAvancement === 'Jugé' && !isValidDate(p.dateJugement)),
              columns: ['Objet', 'Entité', 'Estimation', 'Ouverture Plis'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'Ouverture Plis') return isValidDate(p.dateOuverture) ? p.dateOuverture : '—';
                return '';
              },
            },
            {
              key: 'infructueux-sans-date',
              label: 'Infructueux sans date de jugement',
              icon: <XCircle className="w-4 h-4" />,
              color: '#dc2626',
              bg: 'bg-red-50',
              border: 'border-red-200',
              textColor: 'text-red-700',
              headerBg: 'bg-red-500',
              items: filtered.filter(p => p.situationAvancement === 'Infructueux' && !isValidDate(p.dateJugement)),
              columns: ['Objet', 'Entité', 'Estimation', 'Ouverture Plis'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'Ouverture Plis') return isValidDate(p.dateOuverture) ? p.dateOuverture : '—';
                return '';
              },
            },
            {
              key: 'annule-sans-date',
              label: 'Annulé sans date de jugement',
              icon: <XCircle className="w-4 h-4" />,
              color: '#991b1b',
              bg: 'bg-rose-50',
              border: 'border-rose-200',
              textColor: 'text-rose-700',
              headerBg: 'bg-rose-600',
              items: filtered.filter(p => p.situationAvancement === 'Annulé' && !isValidDate(p.dateJugement)),
              columns: ['Objet', 'Entité', 'Estimation', 'Ouverture Plis'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'Ouverture Plis') return isValidDate(p.dateOuverture) ? p.dateOuverture : '—';
                return '';
              },
            },
            {
              key: 'dao-sans-date',
              label: 'DAO Envoyé au CE sans date',
              icon: <Send className="w-4 h-4" />,
              color: '#0891b2',
              bg: 'bg-cyan-50',
              border: 'border-cyan-200',
              textColor: 'text-cyan-700',
              headerBg: 'bg-cyan-500',
              items: filtered.filter(p => p.situationAvancement === 'DAO Envoyé au CE' && !isValidDate(p.dateJugement) && !isValidDate(p.dateOuverture)),
              columns: ['Objet', 'Entité', 'Estimation', 'N° AO'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'N° AO') return p.numAO || '—';
                return '';
              },
            },
            {
              key: 'publie-sans-date',
              label: 'Publié PPM sans date d\'ouverture',
              icon: <Activity className="w-4 h-4" />,
              color: '#7c3aed',
              bg: 'bg-violet-50',
              border: 'border-violet-200',
              textColor: 'text-violet-700',
              headerBg: 'bg-violet-500',
              items: filtered.filter(p => p.situationAvancement === 'Publié sur PMP' && !isValidDate(p.dateOuverture)),
              columns: ['Objet', 'Entité', 'Estimation', 'N° AO'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'N° AO') return p.numAO || '—';
                return '';
              },
            },
            {
              key: 'a-programmer',
              label: 'À programmer',
              icon: <AlertCircle className="w-4 h-4" />,
              color: '#6b7280',
              bg: 'bg-slate-50',
              border: 'border-slate-200',
              textColor: 'text-slate-700',
              headerBg: 'bg-slate-500',
              items: filtered.filter(p => p.situationAvancement === 'A programmer'),
              columns: ['Objet', 'Entité', 'Estimation', 'CP'] as const,
              getCellValue: (p: PPMProject, col: string) => {
                if (col === 'Objet') return p.objet;
                if (col === 'Entité') return p.entite;
                if (col === 'Estimation') return fmtMDH(p.estimationAdmin || 0);
                if (col === 'CP') return fmtM(p.cp || 0);
                return '';
              },
            },
          ];

          const activeAlerts = alertCategories.filter(a => a.items.length > 0);
          const totalAlertCount = activeAlerts.reduce((s, a) => s + a.items.length, 0);
          const totalAlertEstimation = activeAlerts.reduce((s, a) => s + a.items.reduce((ss, p) => ss + (p.estimationAdmin || 0), 0), 0);

          return (
            <div className="min-h-screen bg-white text-slate-800 animate-fade-in-up">
              {/* Top Bar */}
              <div className="print:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
                <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-800">Alertes Information</h2>
                        <p className="text-[10px] text-slate-500">Marchés nécessitant une attention particulière</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <Input placeholder="Rechercher..." className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 w-48" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Filter Bar */}
                <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={filterEntity} onValueChange={setFilterEntity}>
                      <SelectTrigger className="h-7 text-[10px] w-[130px] bg-white border-slate-200"><SelectValue placeholder="Entité" /></SelectTrigger>
                      <SelectContent>{entities.map(e => <SelectItem key={e} value={e} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: entityColorMap[e]}} />{e}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes les entités</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Statut" /></SelectTrigger>
                      <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="text-[10px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{backgroundColor: statusColor[s]}} />{s}</span></SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous les statuts</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterNature} onValueChange={setFilterNature}>
                      <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Nature" /></SelectTrigger>
                      <SelectContent>{natures.map(n => <SelectItem key={n} value={n} className="text-[10px]">{n}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes natures</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous types</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                      <SelectTrigger className="h-7 text-[10px] w-[120px] bg-white border-slate-200"><SelectValue placeholder="Programme" /></SelectTrigger>
                      <SelectContent>{programmes.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous programmes</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterProjet} onValueChange={setFilterProjet}>
                      <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Projet" /></SelectTrigger>
                      <SelectContent>{projets.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous AO</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterSource} onValueChange={setFilterSource}>
                      <SelectTrigger className="h-7 text-[10px] w-[140px] bg-white border-slate-200"><SelectValue placeholder="Source financement" /></SelectTrigger>
                      <SelectContent>{sources.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Toutes sources</SelectItem></SelectContent>
                    </Select>
                    <Select value={filterAttributaire} onValueChange={setFilterAttributaire}>
                      <SelectTrigger className="h-7 text-[10px] w-[160px] bg-white border-slate-200"><SelectValue placeholder="Attributaire" /></SelectTrigger>
                      <SelectContent>{attributaires.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}<SelectItem value="all" className="text-[10px]">Tous attributaires</SelectItem></SelectContent>
                    </Select>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 gap-1">
                        <X className="w-3 h-3" />Réinitialiser
                      </Button>
                    )}
                    <span className="text-[10px] text-slate-400 ml-auto">{filtered.length} / {projects.length} AO</span>
                  </div>
                </div>
              </div>
              {/* Content */}
              <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4" style={{ borderTop: '4px solid #f59e0b' }}>
                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-800">{totalAlertCount}</p>
                      <p className="text-[10px] text-slate-500">Total alertes</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4" style={{ borderTop: '4px solid #ef4444' }}>
                    <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-800">{activeAlerts.length} <span className="text-sm font-normal text-slate-400">/ {alertCategories.length}</span></p>
                      <p className="text-[10px] text-slate-500">Catégories actives</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4" style={{ borderTop: '4px solid #3b82f6' }}>
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-800">{fmtMDH(totalAlertEstimation)}</p>
                      <p className="text-[10px] text-slate-500">Estimation à risque</p>
                    </div>
                  </div>
                </div>

                {/* Alert Category Cards */}
                {alertCategories.map(cat => (
                  <div key={cat.key} className={`rounded-xl shadow-sm border ${cat.border} ${cat.bg} overflow-hidden`} style={{ borderLeftWidth: '5px', borderLeftColor: cat.color }}>
                    {/* Category Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: cat.color }}>
                          {cat.icon}
                        </div>
                        <div>
                          <h3 className={`text-sm font-semibold ${cat.textColor}`}>{cat.label}</h3>
                          <p className="text-[10px] text-slate-500">{cat.items.length} AO{cat.items.length > 1 ? 's' : ''} concerné{cat.items.length > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <Badge className="text-[10px] h-6 border-0 text-white" style={{ backgroundColor: cat.color }}>
                        {cat.items.length}
                      </Badge>
                    </div>
                    {/* Category Table */}
                    {cat.items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-slate-50/80">
                              <th className="px-4 py-2 text-left font-semibold text-slate-600 w-10">#</th>
                              {cat.columns.map(col => (
                                <th key={col} className="px-4 py-2 text-left font-semibold text-slate-600">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/50">
                            {cat.items.map((p, i) => (
                              <tr key={p.id || i} className="hover:bg-white/60 transition-colors">
                                <td className="px-4 py-2 text-slate-400 font-mono">{i + 1}</td>
                                {cat.columns.map(col => (
                                  <td key={col} className={`px-4 py-2 ${col === 'Objet' ? 'font-medium text-slate-800 max-w-[300px] truncate' : col === 'Estimation' ? 'font-semibold text-blue-700' : 'text-slate-600'}`}>
                                    {cat.getCellValue(p, col)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-5 py-6 text-center">
                        <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Aucune alerte dans cette catégorie</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Dashboard Content ── */}
        {sidebarTab === 'dashboard' && (
        <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 min-h-screen">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ── Upload Section ── */}
        {showUpload && (
          <Card className="border-0 shadow-lg glass-card animate-fade-in-up">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-500" />
                    Mettre à jour le fichier source
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Uploadez un nouveau fichier Excel pour actualiser automatiquement la vue d'ensemble
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)} className="text-xs h-7 rounded-full">
                  Fermer
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Upload zone */}
                <FileUploader onUploadSuccess={handleUploadSuccess} />

                {/* Current file info */}
                <div className="space-y-4">
                  <div className="bg-slate-50/80 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fichier actuel</h4>
                    {data.fileName ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{data.fileName}</p>
                            <p className="text-xs text-slate-400">
                              {data.fileSize ? fmtFileSize(data.fileSize) : ''} — Checksum: {data.fileChecksum?.substring(0, 8)}...
                            </p>
                          </div>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] text-slate-400">Dernière modification</p>
                            <p className="text-xs font-medium text-slate-600">
                              {data.fileLastModified ? new Date(data.fileLastModified).toLocaleString('fr-FR') : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Marchés détectés</p>
                            <p className="text-xs font-medium text-slate-600">{projects.length} AO</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Dernière lecture</p>
                            <p className="text-xs font-medium text-slate-600">
                              {new Date(data.lastUpdated).toLocaleString('fr-FR')}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Sync auto</p>
                            <p className="text-xs font-medium text-green-600">
                              {autoRefresh ? 'Active (5s)' : 'En pause'}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">Aucun fichier chargé</p>
                    )}
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl p-4 space-y-2 border border-blue-100/50">
                    <h4 className="text-xs font-semibold text-blue-700">Comment ça marche ?</h4>
                    <ul className="space-y-1.5 text-xs text-blue-600">
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">1</span>
                        Uploadez un nouveau fichier Excel (.xlsx ou .xls)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">2</span>
                        La vue d'ensemble se recharge automatiquement avec les nouvelles données
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">3</span>
                        Si vous remplacez le fichier sur le serveur, la détection auto le repère en 5 secondes
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Global Filters Bar ── */}
        <Card className="border-0 shadow-md glass-card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              {/* Filter row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Rechercher par objet, entité, attributaire..."
                    className="pl-9 h-10 text-sm bg-slate-50/80 border-slate-200 focus:bg-white transition-all duration-300"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Nature filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Nature</span>
                  <Select value={filterNature} onValueChange={setFilterNature}>
                    <SelectTrigger className="w-full sm:w-44 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Nature" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes natures</SelectItem>
                      {natures.map(n => (
                        <SelectItem key={n} value={n}>{n} ({projects.filter(p => p.natureBudget === n).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Type filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Type</span>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-full sm:w-40 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous types</SelectItem>
                      {types.map(t => (
                        <SelectItem key={t} value={t}>{t} ({projects.filter(p => p.typeBudget === t).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Entity filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Entité</span>
                  <Select value={filterEntity} onValueChange={setFilterEntity}>
                    <SelectTrigger className="w-full sm:w-36 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Entité" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes entités</SelectItem>
                      {entities.map(e => (
                        <SelectItem key={e} value={e}>{e} ({projects.filter(p => p.entite === e).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Statut</span>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-52 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous statuts</SelectItem>
                      {statuses.map(s => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: statusColor[s] }} />
                            {s} ({projects.filter(p => p.situationAvancement === s).length})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Second filter row: Programme, Projet, Source, Attributaire */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Programme filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Programme</span>
                  <Select value={filterProgramme} onValueChange={setFilterProgramme}>
                    <SelectTrigger className="w-full sm:w-48 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Programme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous programmes</SelectItem>
                      {programmes.map(p => (
                        <SelectItem key={p} value={p}>{p} ({projects.filter(pr => pr.programme === p).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Projet filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Projet</span>
                  <Select value={filterProjet} onValueChange={setFilterProjet}>
                    <SelectTrigger className="w-full sm:w-48 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Projet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous AO</SelectItem>
                      {projets.map(p => (
                        <SelectItem key={p} value={p}>{p} ({projects.filter(pr => pr.projet === p).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Source de financement filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Source</span>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="w-full sm:w-52 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes sources</SelectItem>
                      {sources.map(s => (
                        <SelectItem key={s} value={s}>{s} ({projects.filter(pr => pr.sourceFinancement === s).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Attributaire filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Attributaire</span>
                  <Select value={filterAttributaire} onValueChange={setFilterAttributaire}>
                    <SelectTrigger className="w-full sm:w-52 h-10 text-sm bg-slate-50/80 border-slate-200 transition-all duration-300">
                      <SelectValue placeholder="Attributaire" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous attributaires</SelectItem>
                      {attributaires.map(a => (
                        <SelectItem key={a} value={a}>{a} ({projects.filter(pr => pr.attributaire === a).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Active filters + result count */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {hasActiveFilters && (
                    <>
                      {filterNature !== 'all' && (
                        <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterNature('all')}>
                          Nature: {filterNature} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterType !== 'all' && (
                        <Badge className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterType('all')}>
                          Type: {filterType} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterEntity !== 'all' && (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterEntity('all')}>
                          Entité: {filterEntity} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterStatus !== 'all' && (
                        <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterStatus('all')}>
                          Statut: {filterStatus} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterProgramme !== 'all' && (
                        <Badge className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterProgramme('all')}>
                          Programme: {filterProgramme} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterProjet !== 'all' && (
                        <Badge className="bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterProjet('all')}>
                          Projet: {filterProjet} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterSource !== 'all' && (
                        <Badge className="bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterSource('all')}>
                          Source: {filterSource} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterAttributaire !== 'all' && (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 gap-1 cursor-pointer transition-all duration-200" onClick={() => setFilterAttributaire('all')}>
                          Attributaire: {filterAttributaire} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-[10px] h-6 text-slate-400 hover:text-red-500 transition-all duration-200">
                        Effacer tout
                      </Button>
                    </>
                  )}
                  {!hasActiveFilters && !searchTerm && (
                    <span className="text-[10px] text-slate-400">Aucun filtre actif — affichage de tous les AO</span>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {filtered.length} / {projects.length} AO
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 1. Indicateurs clés nombre AO ── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            1. Indicateurs Clés — Nombre AO
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* AO Ouvert */}
            <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #3b82f6' }}>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shadow-sm"><Scale className="w-4.5 h-4.5 text-white" /></span>
                  AO Ouvert
                  <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200 border ml-auto">{aoOuvertCount} AO ({filtered.length > 0 ? Math.round((aoOuvertCount / filtered.length) * 100) : 0}%)</Badge>
                </CardTitle>
                <p className="text-[10px] text-slate-400">En cours de jugement, Jugé, Engagé, Infructueux, Annulé</p>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: 'En cours jugement', count: filteredStatusCount['En cours de jugement'] || 0, color: '#f59e0b', icon: <Gavel className="w-3.5 h-3.5" /> },
                    { label: 'Jugé', count: filteredStatusCount['Jugé'] || 0, color: '#8b5cf6', icon: <FileCheck className="w-3.5 h-3.5" /> },
                    { label: 'Engagé', count: filteredStatusCount['Engagé'] || 0, color: '#16a34a', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                    { label: 'Infructueux', count: filteredStatusCount['Infructueux'] || 0, color: '#dc2626', icon: <FileX className="w-3.5 h-3.5" /> },
                    { label: 'Annulé', count: filteredStatusCount['Annulé'] || 0, color: '#991b1b', icon: <Ban className="w-3.5 h-3.5" /> },
                  ].map(item => {
                    const taux = filtered.length > 0 ? Math.round((item.count / filtered.length) * 100) : 0;
                    return (
                    <div key={item.label} className="text-center group">
                      <div className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-white shadow-md group-hover:shadow-lg transition-all duration-200 group-hover:scale-110" style={{ backgroundColor: item.color }}>
                        {item.icon}
                      </div>
                      <p className="text-lg font-bold mt-1.5" style={{ color: item.color }}>{item.count}</p>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wider font-medium">{item.label}</p>
                      <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, taux)}%`, backgroundColor: item.color }} />
                      </div>
                      <p className="text-[8px] font-bold mt-0.5" style={{ color: item.color }}>{taux}%</p>
                    </div>
                  );})}
                </div>
                {/* Stacked bar AO Ouvert */}
                <div className="mt-3">
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    {[
                      { count: filteredStatusCount['En cours de jugement'] || 0, color: '#f59e0b' },
                      { count: filteredStatusCount['Jugé'] || 0, color: '#8b5cf6' },
                      { count: filteredStatusCount['Engagé'] || 0, color: '#16a34a' },
                      { count: filteredStatusCount['Infructueux'] || 0, color: '#dc2626' },
                      { count: filteredStatusCount['Annulé'] || 0, color: '#991b1b' },
                    ].map((s, i) => (
                      <div key={i} className="h-full transition-all duration-700" style={{ width: `${filtered.length > 0 ? (s.count / filtered.length) * 100 : 0}%`, backgroundColor: s.color }} />
                    ))}
                  </div>
                </div>
                {/* Financial KPIs */}
                <div className="mt-3 pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-[10px]">
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500">CP</p>
                    <p className="font-bold text-blue-700">{fmtMDH(aoOuvertCP)}</p>
                  </div>
                  <div className="bg-cyan-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500">CE</p>
                    <p className="font-bold text-cyan-700">{fmtMDH(aoOuvertCE)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500">Estim.</p>
                    <p className="font-bold text-amber-700">{fmtMDH(aoOuvertEstimation)}</p>
                  </div>
                </div>
                {/* Taux Eng. CP / CE */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="bg-violet-50 rounded-lg p-2 text-center space-y-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Taux Eng. CP</p>
                    <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, aoOuvertCP > 0 ? Math.round((aoOuvertEngCP / aoOuvertCP) * 100) : 0)}%`, backgroundColor: '#7c3aed' }} />
                    </div>
                    <p className="text-sm font-bold text-violet-700">{aoOuvertCP > 0 ? Math.round((aoOuvertEngCP / aoOuvertCP) * 100) : 0}%</p>
                    <p className="text-[8px] text-slate-400">{fmtMDH(aoOuvertEngCP)} / {fmtMDH(aoOuvertCP)}</p>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-2 text-center space-y-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Taux Eng. CE</p>
                    <div className="h-2 bg-teal-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, aoOuvertCE > 0 ? Math.round((aoOuvertEngCE / aoOuvertCE) * 100) : 0)}%`, backgroundColor: '#0d9488' }} />
                    </div>
                    <p className="text-sm font-bold text-teal-700">{aoOuvertCE > 0 ? Math.round((aoOuvertEngCE / aoOuvertCE) * 100) : 0}%</p>
                    <p className="text-[8px] text-slate-400">{fmtMDH(aoOuvertEngCE)} / {fmtMDH(aoOuvertCE)}</p>
                  </div>
                </div>
                {/* Taux Engagement / Estimation */}
                <div className="mt-2 bg-green-50 rounded-lg p-2 text-center space-y-1">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Taux Engagement / Estimation</p>
                  <div className="h-2 bg-green-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, aoOuvertEstimation > 0 ? Math.round((aoOuvertEngagement / aoOuvertEstimation) * 100) : 0)}%`, backgroundColor: '#16a34a' }} />
                  </div>
                  <p className="text-sm font-bold text-green-700">{aoOuvertEstimation > 0 ? Math.round((aoOuvertEngagement / aoOuvertEstimation) * 100) : 0}%</p>
                  <p className="text-[8px] text-slate-400">{fmtMDH(aoOuvertEngagement)} / {fmtMDH(aoOuvertEstimation)}</p>
                </div>
              </CardContent>
            </Card>
            {/* AO Restants */}
            <Card className="border-0 shadow-md overflow-hidden" style={{ borderTop: '4px solid #f59e0b' }}>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm"><Clock className="w-4.5 h-4.5 text-white" /></span>
                  AO Restants
                  <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200 border ml-auto">{aoRestantsCount} AO ({filtered.length > 0 ? Math.round((aoRestantsCount / filtered.length) * 100) : 0}%)</Badge>
                </CardTitle>
                <p className="text-[10px] text-slate-400">Publié Portail, Envoyé au CE, À programmer</p>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Publié PPM', count: filteredStatusCount['Publié sur PMP'] || 0, color: '#7c3aed', icon: <Megaphone className="w-4 h-4" /> },
                    { label: 'DAO au CE', count: filteredStatusCount['DAO Envoyé au CE'] || 0, color: '#0891b2', icon: <FileSignature className="w-4 h-4" /> },
                    { label: 'À programmer', count: filteredStatusCount['A programmer'] || 0, color: '#6b7280', icon: <ListTodo className="w-4 h-4" /> },
                  ].map(item => {
                    const taux = filtered.length > 0 ? Math.round((item.count / filtered.length) * 100) : 0;
                    return (
                    <div key={item.label} className="text-center group">
                      <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-white shadow-md group-hover:shadow-lg transition-all duration-200 group-hover:scale-110" style={{ backgroundColor: item.color }}>
                        {item.icon}
                      </div>
                      <p className="text-xl font-bold mt-1.5" style={{ color: item.color }}>{item.count}</p>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wider font-medium">{item.label}</p>
                      <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, taux)}%`, backgroundColor: item.color }} />
                      </div>
                      <p className="text-[8px] font-bold mt-0.5" style={{ color: item.color }}>{taux}%</p>
                    </div>
                  );})}
                </div>
                {/* Stacked bar AO Restants */}
                <div className="mt-3">
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    {[
                      { count: filteredStatusCount['Publié sur PMP'] || 0, color: '#7c3aed' },
                      { count: filteredStatusCount['DAO Envoyé au CE'] || 0, color: '#0891b2' },
                      { count: filteredStatusCount['A programmer'] || 0, color: '#6b7280' },
                    ].map((s, i) => (
                      <div key={i} className="h-full transition-all duration-700" style={{ width: `${filtered.length > 0 ? (s.count / filtered.length) * 100 : 0}%`, backgroundColor: s.color }} />
                    ))}
                  </div>
                </div>
                {/* Financial KPIs */}
                <div className="mt-3 pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-[10px]">
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500">CP</p>
                    <p className="font-bold text-blue-700">{fmtMDH(aoRestantsCP)}</p>
                  </div>
                  <div className="bg-cyan-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500">CE</p>
                    <p className="font-bold text-cyan-700">{fmtMDH(aoRestantsCE)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500">Estim.</p>
                    <p className="font-bold text-amber-700">{fmtMDH(aoRestantsEstimation)}</p>
                  </div>
                </div>
                {/* Taux Eng. CP / CE */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="bg-violet-50 rounded-lg p-2 text-center space-y-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Taux Eng. CP</p>
                    <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, aoRestantsCP > 0 ? Math.round((aoRestantsEngCP / aoRestantsCP) * 100) : 0)}%`, backgroundColor: '#7c3aed' }} />
                    </div>
                    <p className="text-sm font-bold text-violet-700">{aoRestantsCP > 0 ? Math.round((aoRestantsEngCP / aoRestantsCP) * 100) : 0}%</p>
                    <p className="text-[8px] text-slate-400">{fmtMDH(aoRestantsEngCP)} / {fmtMDH(aoRestantsCP)}</p>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-2 text-center space-y-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Taux Eng. CE</p>
                    <div className="h-2 bg-teal-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, aoRestantsCE > 0 ? Math.round((aoRestantsEngCE / aoRestantsCE) * 100) : 0)}%`, backgroundColor: '#0d9488' }} />
                    </div>
                    <p className="text-sm font-bold text-teal-700">{aoRestantsCE > 0 ? Math.round((aoRestantsEngCE / aoRestantsCE) * 100) : 0}%</p>
                    <p className="text-[8px] text-slate-400">{fmtMDH(aoRestantsEngCE)} / {fmtMDH(aoRestantsCE)}</p>
                  </div>
                </div>
                {/* Taux Engagement / Estimation */}
                <div className="mt-2 bg-green-50 rounded-lg p-2 text-center space-y-1">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Taux Engagement / Estimation</p>
                  <div className="h-2 bg-green-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, aoRestantsEstimation > 0 ? 0 : 0)}%`, backgroundColor: '#16a34a' }} />
                  </div>
                  <p className="text-sm font-bold text-green-700">0%</p>
                  <p className="text-[8px] text-slate-400">0 MDH / {fmtMDH(aoRestantsEstimation)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── 2. Indicateurs clés montant (MDH) ── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.13s' }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            2. Indicateurs Clés — Montants (MDH)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {[
              { label: 'CP', value: filteredKpis.totalCP / 1_000_000, color: '#3b82f6', icon: '💰', rate: null },
              { label: 'CE', value: filteredKpis.totalCE / 1_000_000, color: '#06b6d4', icon: '🏦', rate: null },
              { label: 'Total Crédits (CP+CE)', value: (filteredKpis.totalCP + filteredKpis.totalCE) / 1_000_000, color: '#0f766e', icon: '💵', rate: filteredKpis.totalCE > 0 ? Math.round((filteredKpis.totalCP / (filteredKpis.totalCP + filteredKpis.totalCE)) * 100) : 0, rateLabel: 'CP/Crédits' },
              { label: 'Estimation', value: filteredKpis.totalEstimation / 1_000_000, color: '#d97706', icon: '📊', rate: null },
              { label: 'Engagement CP', value: filteredKpis.totalEngagementCP / 1_000_000, color: '#7c3aed', icon: '📝', rate: filteredKpis.totalCP > 0 ? Math.round((filteredKpis.totalEngagementCP / filteredKpis.totalCP) * 100) : 0, rateLabel: 'Eng/CP' },
              { label: 'Engagement CE', value: filteredKpis.totalEngagementCE / 1_000_000, color: '#0891b2', icon: '📋', rate: filteredKpis.totalCE > 0 ? Math.round((filteredKpis.totalEngagementCE / filteredKpis.totalCE) * 100) : 0, rateLabel: 'Eng/CE' },
              { label: 'Engagement Total', value: filteredKpis.totalEngagement / 1_000_000, color: '#16a34a', icon: '✅', rate: filteredKpis.totalEstimation > 0 ? Math.round((filteredKpis.totalEngagement / filteredKpis.totalEstimation) * 100) : 0, rateLabel: 'Eng/Estim' },
            ].map(item => (
              <Card key={item.label} className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden" style={{ borderTop: `3px solid ${item.color}` }}>
                <CardContent className="p-4 text-center space-y-1">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">{item.label}</p>
                  <p className="text-lg font-bold text-slate-800">{item.value.toFixed(2)} <span className="text-xs text-slate-500">MDH</span></p>
                  {item.rate !== null && (
                    <div className="mt-1 space-y-1">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, item.rate)}%`, backgroundColor: item.rate >= 50 ? '#16a34a' : item.rate >= 25 ? '#d97706' : '#dc2626' }} />
                      </div>
                      <p className="text-[10px] font-bold" style={{ color: item.rate >= 50 ? '#16a34a' : item.rate >= 25 ? '#d97706' : '#dc2626' }}>{item.rateLabel}: {item.rate}%</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── 3. État d'avancement par entité ── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.19s' }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-green-500" />
            3. État d&apos;Avancement par Entité
          </h2>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left">Entité</th>
                      <th className="px-3 py-2.5 text-center">Nb AO</th>
                      <th className="px-3 py-2.5 text-center text-blue-500">Ouvert</th>
                      <th className="px-3 py-2.5 text-center text-amber-500">Jugé</th>
                      <th className="px-3 py-2.5 text-center text-green-500">Engagé</th>
                      <th className="px-3 py-2.5 text-center text-red-500">Infruct.</th>
                      <th className="px-3 py-2.5 text-center text-slate-400">Annulé</th>
                      <th className="px-3 py-2.5 text-center text-violet-500">Publié</th>
                      <th className="px-3 py-2.5 text-center text-cyan-500">DAO CE</th>
                      <th className="px-3 py-2.5 text-center text-gray-400">Progr.</th>
                      <th className="px-3 py-2.5 text-right">CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Estimation (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. Total (MDH)</th>
                      <th className="px-3 py-2.5 text-center">Taux</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CP (%)</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CE (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(filteredEntityBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
                      const entityProjects = filtered.filter(p => p.entite === name);
                      const engCP = entityProjects.reduce((s, p) => s + (p.engagementCP || 0), 0);
                      const engCE = entityProjects.reduce((s, p) => s + (p.engagementCE || 0), 0);
                      const engTotal = d.engagement;
                      const rate = d.estimation > 0 ? Math.round((engTotal / d.estimation) * 100) : 0;
                      const accentColor = entityColorMap[name] || '#3b82f6';
                      // AO Ouvert = En cours de jugement + Jugé + Engagé + Infructueux + Annulé
                      const nbOuvert = entityProjects.filter(p => ['En cours de jugement','Jugé','Engagé','Infructueux','Annulé'].includes(p.situationAvancement)).length;
                      const nbJuge = entityProjects.filter(p => p.situationAvancement === 'Jugé' || p.situationAvancement === 'En cours de jugement').length;
                      const nbEngage = entityProjects.filter(p => p.situationAvancement === 'Engagé').length;
                      const nbInfructueux = entityProjects.filter(p => p.situationAvancement === 'Infructueux').length;
                      const nbAnnule = entityProjects.filter(p => p.situationAvancement === 'Annulé').length;
                      // AO Restants
                      const nbPublie = entityProjects.filter(p => p.situationAvancement === 'Publié sur PMP').length;
                      const nbDaoCE = entityProjects.filter(p => p.situationAvancement === 'DAO Envoyé au CE').length;
                      const nbProgrammer = entityProjects.filter(p => p.situationAvancement === 'A programmer').length;
                      return (
                        <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                              <span className="font-semibold text-slate-700">{name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                          <td className="px-3 py-2.5 text-center">{nbOuvert > 0 ? <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">{nbOuvert}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{nbJuge > 0 ? <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{nbJuge}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{nbEngage > 0 ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">{nbEngage}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{nbInfructueux > 0 ? <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">{nbInfructueux}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{nbAnnule > 0 ? <Badge className="bg-slate-200 text-slate-600 border-0 text-[10px]">{nbAnnule}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{nbPublie > 0 ? <Badge className="bg-violet-100 text-violet-700 border-0 text-[10px]">{nbPublie}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{nbDaoCE > 0 ? <Badge className="bg-cyan-100 text-cyan-700 border-0 text-[10px]">{nbDaoCE}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center">{nbProgrammer > 0 ? <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">{nbProgrammer}</Badge> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-right text-blue-600">{fmtNum(d.cp)}</td>
                          <td className="px-3 py-2.5 text-right text-cyan-600">{fmtNum(d.ce)}</td>
                          <td className="px-3 py-2.5 text-right text-amber-600">{fmtNum(d.estimation)}</td>
                          <td className="px-3 py-2.5 text-right text-violet-600">{fmtNum(engCP)}</td>
                          <td className="px-3 py-2.5 text-right text-teal-600">{fmtNum(engCE)}</td>
                          <td className="px-3 py-2.5 text-right text-green-600 font-semibold">{fmtNum(engTotal)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
                              </div>
                              <span className={`font-bold w-8 text-right text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                            </div>
                          </td>
                          {tauxEngagementCell(engCP, d.cp)}
                          {tauxEngagementCell(engCE, d.ce)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2.5 text-slate-800">Total</td>
                      <td className="px-3 py-2.5 text-center text-slate-800">{filteredKpis.totalProjects}</td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">{filtered.filter(p => ['En cours de jugement','Jugé','Engagé','Infructueux','Annulé'].includes(p.situationAvancement)).length}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{filtered.filter(p => p.situationAvancement === 'Jugé' || p.situationAvancement === 'En cours de jugement').length}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-green-100 text-green-700 border-0 text-[10px]">{filtered.filter(p => p.situationAvancement === 'Engagé').length}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-red-100 text-red-700 border-0 text-[10px]">{filtered.filter(p => p.situationAvancement === 'Infructueux').length}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-slate-200 text-slate-600 border-0 text-[10px]">{filtered.filter(p => p.situationAvancement === 'Annulé').length}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-violet-100 text-violet-700 border-0 text-[10px]">{filtered.filter(p => p.situationAvancement === 'Publié sur PMP').length}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-cyan-100 text-cyan-700 border-0 text-[10px]">{filtered.filter(p => p.situationAvancement === 'DAO Envoyé au CE').length}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">{filtered.filter(p => p.situationAvancement === 'A programmer').length}</Badge></td>
                      <td className="px-3 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalCP)}</td>
                      <td className="px-3 py-2.5 text-right text-cyan-700">{fmtNum(filteredKpis.totalCE)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700">{fmtNum(filteredKpis.totalEngagementCP)}</td>
                      <td className="px-3 py-2.5 text-right text-teal-700">{fmtNum(filteredKpis.totalEngagementCE)}</td>
                      <td className="px-3 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0)}%`, backgroundColor: '#16a34a' }} />
                          </div>
                          <span className="font-bold w-8 text-right text-[10px]">{filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0}%</span>
                        </div>
                      </td>
                      {tauxEngagementCell(filteredKpis.totalEngagementCP, filteredKpis.totalCP)}
                      {tauxEngagementCell(filteredKpis.totalEngagementCE, filteredKpis.totalCE)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── Analyse par Entité — Vue Progression Améliorée ── */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(filteredEntityBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
              const accentColor = entityColorMap[name] || '#3b82f6';
              const engCP = filtered.filter(p => p.entite === name).reduce((s, p) => s + (p.engagementCP || 0), 0);
              const engCE = filtered.filter(p => p.entite === name).reduce((s, p) => s + (p.engagementCE || 0), 0);
              const engTotal = d.engagement;
              const tauxEngagement = d.estimation > 0 ? Math.round((engTotal / d.estimation) * 100) : 0;
              const tauxCP = d.cp > 0 ? Math.round((engCP / d.cp) * 100) : 0;
              const tauxCE = d.ce > 0 ? Math.round((engCE / d.ce) * 100) : 0;
              const entityProjects = filtered.filter(p => p.entite === name);
              const nbOuvert = entityProjects.filter(p => ['En cours de jugement','Jugé','Engagé','Infructueux','Annulé'].includes(p.situationAvancement)).length;
              const nbJuge = entityProjects.filter(p => p.situationAvancement === 'Jugé' || p.situationAvancement === 'En cours de jugement').length;
              const nbEngage = entityProjects.filter(p => p.situationAvancement === 'Engagé').length;
              const nbInfructueux = entityProjects.filter(p => p.situationAvancement === 'Infructueux').length;
              const nbAnnule = entityProjects.filter(p => p.situationAvancement === 'Annulé').length;
              const nbPublie = entityProjects.filter(p => p.situationAvancement === 'Publié sur PMP').length;
              const nbDaoCE = entityProjects.filter(p => p.situationAvancement === 'DAO Envoyé au CE').length;
              const nbProgrammer = entityProjects.filter(p => p.situationAvancement === 'A programmer').length;
              const total = d.count || 1;
              const aoStatusItems = [
                { label: 'Ouvert', count: nbOuvert, color: '#3b82f6', icon: <CalendarDays className="w-3 h-3" /> },
                { label: 'Jugé', count: nbJuge, color: '#d97706', icon: <Scale className="w-3 h-3" /> },
                { label: 'Engagé', count: nbEngage, color: '#16a34a', icon: <CheckCircle2 className="w-3 h-3" /> },
                { label: 'Infruct.', count: nbInfructueux, color: '#dc2626', icon: <XCircle className="w-3 h-3" /> },
                { label: 'Annulé', count: nbAnnule, color: '#64748b', icon: <Ban className="w-3 h-3" /> },
                { label: 'Publié PPM', count: nbPublie, color: '#7c3aed', icon: <Megaphone className="w-3 h-3" /> },
                { label: 'DAO CE', count: nbDaoCE, color: '#0891b2', icon: <Send className="w-3 h-3" /> },
                { label: 'Progr.', count: nbProgrammer, color: '#6b7280', icon: <ListTodo className="w-3 h-3" /> },
              ];
              return (
                <Card key={name} className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group" style={{ borderTop: `3px solid ${accentColor}` }}>
                  <CardContent className="p-4">
                    {/* ── Header ── */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: accentColor }}>
                          {name.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 text-sm block leading-tight">{name}</span>
                          <span className="text-[10px] text-slate-400">{d.count} AO · {fmtMDH(d.estimation)}</span>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-md text-[10px] font-bold ${tauxEngagement >= 50 ? 'bg-green-50 text-green-700' : tauxEngagement >= 25 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {tauxEngagement}%
                      </div>
                    </div>

                    {/* ── Stacked AO Status Bar ── */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[9px] text-slate-400 mb-1">
                        <span>Répartition des AO</span>
                        <span>{d.count} au total</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                        {aoStatusItems.filter(s => s.count > 0).map((s, i) => (
                          <div
                            key={s.label}
                            className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                            style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color, minWidth: s.count > 0 ? '4px' : '0' }}
                            title={`${s.label}: ${s.count} (${Math.round(s.count / total * 100)}%)`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        {aoStatusItems.filter(s => s.count > 0).map(s => (
                          <span key={s.label} className="flex items-center gap-1 text-[9px]">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="text-slate-500">{s.label}</span>
                            <span className="font-semibold text-slate-700">{s.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* ── Financial KPIs Grid ── */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-blue-50/70 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-[8px] text-blue-400 uppercase tracking-wider font-medium">CP</p>
                        <p className="text-xs font-bold text-blue-700 leading-tight">{fmtNum(d.cp)}</p>
                        <p className="text-[9px] text-blue-500 font-semibold">{tauxCP}% eng.</p>
                      </div>
                      <div className="bg-cyan-50/70 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-[8px] text-cyan-400 uppercase tracking-wider font-medium">CE</p>
                        <p className="text-xs font-bold text-cyan-700 leading-tight">{fmtNum(d.ce)}</p>
                        <p className="text-[9px] text-cyan-500 font-semibold">{tauxCE}% eng.</p>
                      </div>
                      <div className="bg-amber-50/70 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-[8px] text-amber-400 uppercase tracking-wider font-medium">Estim.</p>
                        <p className="text-xs font-bold text-amber-700 leading-tight">{fmtNum(d.estimation)}</p>
                        <p className="text-[9px] text-amber-500 font-semibold">{tauxEngagement}% eng.</p>
                      </div>
                    </div>

                    {/* ── Engagement Progress ── */}
                    <div className="space-y-2 mb-3">
                      {/* Engagement CP */}
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-slate-500 font-medium flex items-center gap-1"><Wallet className="w-3 h-3 text-blue-400" /> Eng. CP</span>
                          <span className="font-bold text-blue-700">{fmtNum(engCP)} <span className="text-slate-400 font-normal">/ {fmtNum(d.cp)}</span></span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, tauxCP)}%`, backgroundColor: tauxCP >= 50 ? '#16a34a' : tauxCP >= 25 ? '#d97706' : '#dc2626' }} />
                        </div>
                      </div>
                      {/* Engagement CE */}
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-slate-500 font-medium flex items-center gap-1"><Shield className="w-3 h-3 text-cyan-400" /> Eng. CE</span>
                          <span className="font-bold text-cyan-700">{fmtNum(engCE)} <span className="text-slate-400 font-normal">/ {fmtNum(d.ce)}</span></span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, tauxCE)}%`, backgroundColor: tauxCE >= 50 ? '#16a34a' : tauxCE >= 25 ? '#d97706' : '#dc2626' }} />
                        </div>
                      </div>
                      {/* Engagement Total */}
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-slate-500 font-medium flex items-center gap-1"><DollarSign className="w-3 h-3 text-amber-400" /> Eng. Total</span>
                          <span className="font-bold text-green-700">{fmtNum(engTotal)} <span className="text-slate-400 font-normal">/ {fmtNum(d.estimation)}</span></span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, tauxEngagement)}%`, backgroundColor: tauxEngagement >= 50 ? '#16a34a' : tauxEngagement >= 25 ? '#d97706' : '#dc2626' }} />
                        </div>
                      </div>
                    </div>

                    {/* ── AO Status Badges Grid ── */}
                    <div className="border-t border-slate-100 pt-2">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Détail statuts AO</p>
                      <div className="grid grid-cols-4 gap-1">
                        {aoStatusItems.map(item => (
                          <div key={item.label} className={`rounded-md px-1.5 py-1 text-center ${item.count > 0 ? 'bg-slate-50' : 'bg-transparent'}`}>
                            <div className="flex items-center justify-center gap-0.5 mb-0.5">
                              <span style={{ color: item.count > 0 ? item.color : '#cbd5e1' }}>{item.icon}</span>
                            </div>
                            <p className={`text-xs font-bold leading-none ${item.count > 0 ? 'text-slate-800' : 'text-slate-300'}`}>{item.count}</p>
                            <p className="text-[8px] text-slate-400 leading-tight mt-0.5">{item.label}</p>
                            {item.count > 0 && <p className="text-[8px] font-semibold leading-tight" style={{ color: item.color }}>{Math.round(item.count / total * 100)}%</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── 4. État d'avancement par type ── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.22s' }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            4. État d&apos;Avancement par Type
          </h2>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left">Type</th>
                      <th className="px-3 py-2.5 text-center">Nb AO</th>
                      {aoIndicatorHeaders()}
                      <th className="px-3 py-2.5 text-right">CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Estimation (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. Total (MDH)</th>
                      <th className="px-3 py-2.5 text-center">Taux</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CP (%)</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CE (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(filteredTypeBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
                      const rowProjects = filtered.filter(p => p.typeBudget === name);
                      const ind = computeAOIndicators(rowProjects);
                      const engTotal = d.engagement;
                      const rate = d.estimation > 0 ? Math.round((engTotal / d.estimation) * 100) : 0;
                      return (
                        <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2.5 font-semibold text-slate-700">{name}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                          {aoIndicatorCells(ind)}
                          <td className="px-3 py-2.5 text-right text-blue-600">{fmtNum(d.cp)}</td>
                          <td className="px-3 py-2.5 text-right text-cyan-600">{fmtNum(d.ce)}</td>
                          <td className="px-3 py-2.5 text-right text-amber-600">{fmtNum(d.estimation)}</td>
                          <td className="px-3 py-2.5 text-right text-violet-600">{fmtNum(ind.engCP)}</td>
                          <td className="px-3 py-2.5 text-right text-teal-600">{fmtNum(ind.engCE)}</td>
                          <td className="px-3 py-2.5 text-right text-green-600 font-semibold">{fmtNum(engTotal)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
                              </div>
                              <span className={`font-bold w-8 text-right text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                            </div>
                          </td>
                          {tauxEngagementCell(ind.engCP, d.cp)}
                          {tauxEngagementCell(ind.engCE, d.ce)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2.5 text-slate-800">Total</td>
                      <td className="px-3 py-2.5 text-center text-slate-800">{filteredKpis.totalProjects}</td>
                      {aoIndicatorCells(computeAOIndicators(filtered))}
                      <td className="px-3 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalCP)}</td>
                      <td className="px-3 py-2.5 text-right text-cyan-700">{fmtNum(filteredKpis.totalCE)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700">{fmtNum(filteredKpis.totalEngagementCP)}</td>
                      <td className="px-3 py-2.5 text-right text-teal-700">{fmtNum(filteredKpis.totalEngagementCE)}</td>
                      <td className="px-3 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0)}%`, backgroundColor: '#16a34a' }} />
                          </div>
                          <span className="font-bold w-8 text-right text-[10px]">{filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0}%</span>
                        </div>
                      </td>
                      {tauxEngagementCell(filteredKpis.totalEngagementCP, filteredKpis.totalCP)}
                      {tauxEngagementCell(filteredKpis.totalEngagementCE, filteredKpis.totalCE)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── 5. État d'avancement par programme ── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-violet-500" />
            5. État d&apos;Avancement par Programme
          </h2>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left">Programme</th>
                      <th className="px-3 py-2.5 text-center">Nb AO</th>
                      {aoIndicatorHeaders()}
                      <th className="px-3 py-2.5 text-right">CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Estimation (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. Total (MDH)</th>
                      <th className="px-3 py-2.5 text-center">Taux</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CP (%)</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CE (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(filteredProgrammeBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
                      const rowProjects = filtered.filter(p => p.programme === name);
                      const ind = computeAOIndicators(rowProjects);
                      const engTotal = d.engagement;
                      const rate = d.estimation > 0 ? Math.round((engTotal / d.estimation) * 100) : 0;
                      return (
                        <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2.5 font-semibold text-slate-700">{name}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                          {aoIndicatorCells(ind)}
                          <td className="px-3 py-2.5 text-right text-blue-600">{fmtNum(d.cp)}</td>
                          <td className="px-3 py-2.5 text-right text-cyan-600">{fmtNum(d.ce)}</td>
                          <td className="px-3 py-2.5 text-right text-amber-600">{fmtNum(d.estimation)}</td>
                          <td className="px-3 py-2.5 text-right text-violet-600">{fmtNum(ind.engCP)}</td>
                          <td className="px-3 py-2.5 text-right text-teal-600">{fmtNum(ind.engCE)}</td>
                          <td className="px-3 py-2.5 text-right text-green-600 font-semibold">{fmtNum(engTotal)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
                              </div>
                              <span className={`font-bold w-8 text-right text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                            </div>
                          </td>
                          {tauxEngagementCell(ind.engCP, d.cp)}
                          {tauxEngagementCell(ind.engCE, d.ce)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2.5 text-slate-800">Total</td>
                      <td className="px-3 py-2.5 text-center text-slate-800">{filteredKpis.totalProjects}</td>
                      {aoIndicatorCells(computeAOIndicators(filtered))}
                      <td className="px-3 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalCP)}</td>
                      <td className="px-3 py-2.5 text-right text-cyan-700">{fmtNum(filteredKpis.totalCE)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700">{fmtNum(filteredKpis.totalEngagementCP)}</td>
                      <td className="px-3 py-2.5 text-right text-teal-700">{fmtNum(filteredKpis.totalEngagementCE)}</td>
                      <td className="px-3 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0)}%`, backgroundColor: '#16a34a' }} />
                          </div>
                          <span className="font-bold w-8 text-right text-[10px]">{filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0}%</span>
                        </div>
                      </td>
                      {tauxEngagementCell(filteredKpis.totalEngagementCP, filteredKpis.totalCP)}
                      {tauxEngagementCell(filteredKpis.totalEngagementCE, filteredKpis.totalCE)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── 6. Analyse par Source de Financement ── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.28s' }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-500" />
            6. Analyse par Source de Financement
          </h2>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left">Source de Financement</th>
                      <th className="px-3 py-2.5 text-center">Nb AO</th>
                      {aoIndicatorHeaders()}
                      <th className="px-3 py-2.5 text-right">CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Estimation (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. Total (MDH)</th>
                      <th className="px-3 py-2.5 text-center">Taux</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CP (%)</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CE (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(filteredSourceBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
                      const rowProjects = filtered.filter(p => p.sourceFinancement === name);
                      const ind = computeAOIndicators(rowProjects);
                      const engTotal = d.engagement;
                      const rate = d.estimation > 0 ? Math.round((engTotal / d.estimation) * 100) : 0;
                      return (
                        <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="font-semibold text-slate-700">{name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                          {aoIndicatorCells(ind)}
                          <td className="px-3 py-2.5 text-right text-blue-600">{fmtNum(d.cp)}</td>
                          <td className="px-3 py-2.5 text-right text-cyan-600">{fmtNum(d.ce)}</td>
                          <td className="px-3 py-2.5 text-right text-amber-600">{fmtNum(d.estimation)}</td>
                          <td className="px-3 py-2.5 text-right text-violet-600">{fmtNum(ind.engCP)}</td>
                          <td className="px-3 py-2.5 text-right text-teal-600">{fmtNum(ind.engCE)}</td>
                          <td className="px-3 py-2.5 text-right text-green-600 font-semibold">{fmtNum(engTotal)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
                              </div>
                              <span className={`font-bold w-8 text-right text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                            </div>
                          </td>
                          {tauxEngagementCell(ind.engCP, d.cp)}
                          {tauxEngagementCell(ind.engCE, d.ce)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2.5 text-slate-800">Total</td>
                      <td className="px-3 py-2.5 text-center text-slate-800">{filteredKpis.totalProjects}</td>
                      {aoIndicatorCells(computeAOIndicators(filtered))}
                      <td className="px-3 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalCP)}</td>
                      <td className="px-3 py-2.5 text-right text-cyan-700">{fmtNum(filteredKpis.totalCE)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700">{fmtNum(filteredKpis.totalEngagementCP)}</td>
                      <td className="px-3 py-2.5 text-right text-teal-700">{fmtNum(filteredKpis.totalEngagementCE)}</td>
                      <td className="px-3 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0)}%`, backgroundColor: '#16a34a' }} />
                          </div>
                          <span className="font-bold w-8 text-right text-[10px]">{filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0}%</span>
                        </div>
                      </td>
                      {tauxEngagementCell(filteredKpis.totalEngagementCP, filteredKpis.totalCP)}
                      {tauxEngagementCell(filteredKpis.totalEngagementCE, filteredKpis.totalCE)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── 7. Analyse par Projet ── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.31s' }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            7. Analyse par Projet
          </h2>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left">Projet</th>
                      <th className="px-3 py-2.5 text-center">Nb AO</th>
                      {aoIndicatorHeaders()}
                      <th className="px-3 py-2.5 text-right">CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Estimation (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CP (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. CE (MDH)</th>
                      <th className="px-3 py-2.5 text-right">Eng. Total (MDH)</th>
                      <th className="px-3 py-2.5 text-center">Taux</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CP (%)</th>
                      <th className="px-3 py-2.5 text-center">Taux Eng. CE (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(filteredProjetBudget).sort(([,a],[,b]) => b.estimation - a.estimation).map(([name, d]) => {
                      const rowProjects = filtered.filter(p => p.projet === name);
                      const ind = computeAOIndicators(rowProjects);
                      const engTotal = d.engagement;
                      const rate = d.estimation > 0 ? Math.round((engTotal / d.estimation) * 100) : 0;
                      return (
                        <tr key={name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-blue-400" />
                              <span className="font-semibold text-slate-700">{name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-800">{d.count}</td>
                          {aoIndicatorCells(ind)}
                          <td className="px-3 py-2.5 text-right text-blue-600">{fmtNum(d.cp)}</td>
                          <td className="px-3 py-2.5 text-right text-cyan-600">{fmtNum(d.ce)}</td>
                          <td className="px-3 py-2.5 text-right text-amber-600">{fmtNum(d.estimation)}</td>
                          <td className="px-3 py-2.5 text-right text-violet-600">{fmtNum(ind.engCP)}</td>
                          <td className="px-3 py-2.5 text-right text-teal-600">{fmtNum(ind.engCE)}</td>
                          <td className="px-3 py-2.5 text-right text-green-600 font-semibold">{fmtNum(engTotal)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 50 ? '#16a34a' : rate >= 25 ? '#d97706' : '#dc2626' }} />
                              </div>
                              <span className={`font-bold w-8 text-right text-[10px] ${rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                            </div>
                          </td>
                          {tauxEngagementCell(ind.engCP, d.cp)}
                          {tauxEngagementCell(ind.engCE, d.ce)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2.5 text-slate-800">Total</td>
                      <td className="px-3 py-2.5 text-center text-slate-800">{filteredKpis.totalProjects}</td>
                      {aoIndicatorCells(computeAOIndicators(filtered))}
                      <td className="px-3 py-2.5 text-right text-blue-700">{fmtNum(filteredKpis.totalCP)}</td>
                      <td className="px-3 py-2.5 text-right text-cyan-700">{fmtNum(filteredKpis.totalCE)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700">{fmtNum(filteredKpis.totalEstimation)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700">{fmtNum(filteredKpis.totalEngagementCP)}</td>
                      <td className="px-3 py-2.5 text-right text-teal-700">{fmtNum(filteredKpis.totalEngagementCE)}</td>
                      <td className="px-3 py-2.5 text-right text-green-700">{fmtNum(filteredKpis.totalEngagement)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0)}%`, backgroundColor: '#16a34a' }} />
                          </div>
                          <span className="font-bold w-8 text-right text-[10px]">{filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0}%</span>
                        </div>
                      </td>
                      {tauxEngagementCell(filteredKpis.totalEngagementCP, filteredKpis.totalCP)}
                      {tauxEngagementCell(filteredKpis.totalEngagementCE, filteredKpis.totalCE)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Footer ── */}
        <footer className="text-center text-xs text-slate-400 pb-6 pt-2 space-y-1">
          <p>Vue d'ensemble PPM 2026 — ORMVA du Gharb · Dernière lecture : {new Date(data.lastUpdated).toLocaleString('fr-FR')}</p>
          {data.fileChecksum && (
            <p className="text-[10px] text-slate-300">
              Checksum : {data.fileChecksum.substring(0, 12)}... · Sync auto : {autoRefresh ? 'ON (5s)' : 'OFF'} · Base de données : {data.dataSaved ? 'SQLite ✓' : 'Non synchronisée'}
            </p>
          )}
        </footer>
        </div>
        </div>
        )}
        </main>

      {/* ── Soumissionnaire Detail Full-Screen View ── */}
      {showSoumModal && selectedSoumProjet && (
        <div className="fixed inset-0 z-50 bg-slate-50 animate-fade-in-up" style={{ animationDuration: '0.2s' }}>
          {/* Full-Page Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  {(() => {
                    const ppmP = findPPMForSoum(data?.projects, selectedSoumProjet.numAO, selectedSoumProjet.entite);
                    const displayNumAO = ppmP?.numAO ? `${ppmP.numAO}/${selectedSoumProjet.numAOComplet.split('/').slice(1).join('/')}` : selectedSoumProjet.numAOComplet;
                    return (
                      <h3 className="text-xl font-bold flex items-center gap-2" title={exAOTitle(ppmP?.numAO || selectedSoumProjet.numAOComplet)}>
                        Soumissionnaires — {displayNumAO}
                        {(ppmP?.numAO && String(ppmP.numAO).includes('ex') || selectedSoumProjet.numAOComplet.includes('ex')) && <span className="text-sm opacity-70 cursor-help">↻</span>}
                      </h3>
                    );
                  })()}
                  <p className="text-sm text-indigo-200 mt-1">{selectedSoumProjet.objetAO}</p>
                </div>
              </div>
              <button onClick={() => setShowSoumModal(false)} className="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center gap-2 transition-colors text-sm font-medium">
                <X className="w-4 h-4" /> Fermer
              </button>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <Badge className="bg-white/20 text-white border-0 text-xs">
                <Users className="w-3 h-3 mr-1" /> {selectedSoumProjet.nbSoumissionnairesUniques} soumissionnaire(s)
              </Badge>
              <Badge className="bg-white/20 text-white border-0 text-xs">
                <Building2 className="w-3 h-3 mr-1" /> {selectedSoumProjet.entite}
              </Badge>
              <Badge className="bg-white/20 text-white border-0 text-xs">
                <FileText className="w-3 h-3 mr-1" /> {(() => { const ppmP = findPPMForSoum(data?.projects, selectedSoumProjet.numAO, selectedSoumProjet.entite); return ppmP?.numAO ? `${ppmP.numAO}/${selectedSoumProjet.numAOComplet.split('/').slice(1).join('/')}` : selectedSoumProjet.numAOComplet; })()}
              </Badge>
              {(() => {
                const ppmP = findPPMForSoum(data?.projects, selectedSoumProjet.numAO, selectedSoumProjet.entite);
                return ppmP ? (
                  <>
                    {ppmP.dateJugement && (
                      <Badge className="bg-white/20 text-white border-0 text-xs">
                        <CalendarDays className="w-3 h-3 mr-1" /> Jugé le {new Date(ppmP.dateJugement).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Badge>
                    )}
                    {ppmP.attributaire && (
                      <Badge className="bg-green-400/30 text-white border-0 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> {ppmP.attributaire}
                      </Badge>
                    )}
                    {ppmP.numMarche && (
                      <Badge className="bg-white/20 text-white border-0 text-xs font-mono">
                        <FileText className="w-3 h-3 mr-1" /> {ppmP.numMarche}
                      </Badge>
                    )}
                    {ppmP.situationAvancement && (
                      <Badge className="bg-white/20 text-white border-0 text-xs">
                        {statusIcon[ppmP.situationAvancement]}
                        <span className="ml-1">{ppmP.situationAvancement}</span>
                      </Badge>
                    )}
                  </>
                ) : null;
              })()}
            </div>
          </div>

          {/* Full-Page Body */}
          <div className="overflow-y-auto p-6 space-y-6" style={{ height: 'calc(100vh - 120px)' }}>
            {/* KPI summary for this project */}
            {(() => {
              const { admis, ecarts, enAttente, reportee: nbReportee, annule: nbAnnule } = countUniqueByDecision(selectedSoumProjet.soumissionnaires);
              const tauxAdm = selectedSoumProjet.nbSoumissionnairesUniques > 0 ? Math.round(admis / selectedSoumProjet.nbSoumissionnairesUniques * 100) : 0;
              // Séances uniques
              const seancesUniques = [...new Set(selectedSoumProjet.soumissionnaires.map(s => s.seance))].filter(Boolean);
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #6366f1' }}>
                    <CardContent className="p-4 text-center">
                      <Users className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-indigo-700">{selectedSoumProjet.nbSoumissionnairesUniques}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Soumissionnaires</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #16a34a' }}>
                    <CardContent className="p-4 text-center">
                      <UserCheck className="w-5 h-5 text-green-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-green-700">{admis}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Admis ({tauxAdm}%)</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #dc2626' }}>
                    <CardContent className="p-4 text-center">
                      <UserX className="w-5 h-5 text-red-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-red-700">{ecarts}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Ecartés</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #d97706' }}>
                    <CardContent className="p-4 text-center">
                      <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-amber-700">{enAttente > 0 ? enAttente : '—'}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">En attente</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #7c3aed' }}>
                    <CardContent className="p-4 text-center">
                      <ClipboardList className="w-5 h-5 text-violet-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-violet-700">{seancesUniques.length}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Séances</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Unique soumissionnaires summary */}
            {(() => {
              const uniqueNoms = [...new Set(selectedSoumProjet.soumissionnaires.filter(s => s.nom).map(s => s.nom!))];
              return uniqueNoms.length > 0 ? (
                <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #6366f1' }}>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-500" />
                      Soumissionnaires identifiés
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {uniqueNoms.map(nom => {
                        const entries = selectedSoumProjet.soumissionnaires.filter(s => s.nom === nom);
                        const isAdmis = entries.some(e => isAdmisDecision(e.decisionCommission));
                        const isEcarte = entries.some(e => isEcarteDecision(e.decisionCommission));
                        const nbSeances = entries.length;
                        return (
                          <div key={nom} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200
                            ${isAdmis ? 'bg-green-50 border-green-200 text-green-700' : isEcarte ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                            {isAdmis ? <UserCheck className="w-4 h-4" /> : isEcarte ? <UserX className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            <span>{nom}</span>
                            <span className="text-[10px] opacity-70">({nbSeances} séance{nbSeances > 1 ? 's' : ''})</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : null;
            })()}

            {/* Detailed sessions table - grouped by Séance */}
            <Card className="border-0 shadow-md" style={{ borderTop: '4px solid #6366f1' }}>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-indigo-500" />
                  Déroulement des séances
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 text-xs text-indigo-700 uppercase tracking-wider">
                        <th className="px-5 py-3.5 text-left">Séance</th>
                        <th className="px-5 py-3.5 text-left">Objet de la séance</th>
                        <th className="px-5 py-3.5 text-left">Président</th>
                        <th className="px-5 py-3.5 text-left">Soumissionnaire</th>
                        <th className="px-5 py-3.5 text-left">Décision Commission</th>
                        <th className="px-5 py-3.5 text-right">Offre financière</th>
                        <th className="px-5 py-3.5 text-left">Décision Offre Financière</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSoumProjet.soumissionnaires.map((s, idx) => (
                        <tr key={idx} className={`border-b border-slate-100 hover:bg-indigo-50/30 transition-colors ${!s.nom ? 'opacity-50' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-indigo-400" />
                              <span className="font-semibold text-slate-700">{s.seance}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant="outline" className="text-xs h-6 bg-white border-indigo-200 text-indigo-700 font-medium">{s.objetSeance}</Badge>
                          </td>
                          <td className="px-5 py-3 text-slate-700 font-medium">{s.president}</td>
                          <td className="px-5 py-3 font-bold text-slate-900">{s.nom || '—'}</td>
                          <td className="px-5 py-3">
                            {isAdmisDecision(s.decisionCommission) ? (
                              <Badge className="bg-green-100 text-green-700 border-0 text-xs gap-1"><UserCheck className="w-3 h-3" /> {s.decisionCommission}</Badge>
                            ) : isEcarteDecision(s.decisionCommission) ? (
                              <Badge className="bg-red-100 text-red-700 border-0 text-xs gap-1"><UserX className="w-3 h-3" /> {s.decisionCommission}</Badge>
                            ) : isReporteeDecision(s.decisionCommission) ? (
                              <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1"><Clock className="w-3 h-3" /> Reportée</Badge>
                            ) : isAnnuleDecision(s.decisionCommission) ? (
                              <Badge className="bg-slate-200 text-slate-700 border-0 text-xs gap-1"><XCircle className="w-3 h-3" /> {s.decisionCommission}</Badge>
                            ) : (
                              <span className="text-slate-500 text-xs">{s.decisionCommission || '—'}</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800">{s.offreFinanciere || '—'}</td>
                          <td className="px-5 py-3 text-slate-700">{s.decisionCommissionOF || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Source info */}
            <div className="text-center text-xs text-slate-400 py-3">
              Source : {soumissionnaireData?.fileName || 'soumissionnaires.xlsx'} — Mis à jour : {soumissionnaireData?.lastUpdated ? new Date(soumissionnaireData.lastUpdated).toLocaleString('fr-FR') : '—'}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

/* ── Premium KPI Card Component ── */
function KPICard({
  title, value, subtitle, icon, trend, color, sparkData, format, unit
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
  trend: { value: number; label: string; up: boolean };
  color: 'blue' | 'green' | 'amber' | 'violet' | 'red';
  sparkData: number[];
  format?: 'number' | 'mdh' | 'amount';
  unit?: string;
}) {
  const colorMap = {
    blue: { gradient: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/20', glow: 'glow-blue', border: '#3b82f6', spark: '#3b82f6', bg: 'from-blue-50/80 to-white' },
    green: { gradient: 'from-green-500 to-green-600', shadow: 'shadow-green-500/20', glow: 'glow-green', border: '#16a34a', spark: '#16a34a', bg: 'from-green-50/80 to-white' },
    amber: { gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/20', glow: 'glow-amber', border: '#d97706', spark: '#d97706', bg: 'from-amber-50/80 to-white' },
    violet: { gradient: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/20', glow: 'glow-violet', border: '#7c3aed', spark: '#7c3aed', bg: 'from-violet-50/80 to-white' },
    red: { gradient: 'from-red-500 to-red-600', shadow: 'shadow-red-500/20', glow: 'glow-red', border: '#dc2626', spark: '#dc2626', bg: 'from-red-50/80 to-white' },
  };

  const c = colorMap[color];

  return (
    <Card className={`border-0 shadow-md bg-gradient-to-br ${c.bg} hover:shadow-lg transition-all duration-300 overflow-hidden ${c.glow}`}
      style={{ borderTop: `4px solid ${c.border}` }}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent animate-ring-pulse" />
            <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center shadow-lg ${c.shadow} text-white`}>
              {icon}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 text-[10px]">
              {trend.up ? (
                <ArrowUpRight className="w-3 h-3 text-green-500" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-red-500" />
              )}
              <span className={`font-bold ${trend.up ? 'text-green-600' : 'text-red-600'}`}>{trend.value}%</span>
              <span className="text-slate-400">{trend.label}</span>
            </div>
            {sparkData.length >= 2 && <Sparkline data={sparkData} color={c.spark} />}
          </div>
        </div>
        <div>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            <AnimatedNumber value={value} format={format} />
            {unit || ''}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{title}</p>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
