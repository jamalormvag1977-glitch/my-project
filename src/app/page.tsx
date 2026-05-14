'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  CloudUpload, AlertTriangle, CheckCircle
} from 'lucide-react';

/* ── Types ────────────────────────────────────────────── */
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
const fmtM = (n: number) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' Md';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' K';
  return n.toFixed(0);
};

const fmtFull = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtFileSize = (bytes: number) => {
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' Mo';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' Ko';
  return bytes + ' octets';
};

const statusColor: Record<string, string> = {
  'Engagé': '#16a34a',
  'Jugé': '#2563eb',
  'En cours de jugement': '#d97706',
  'Publié sur PMP': '#7c3aed',
  'A programmer': '#6b7280',
  'Infructueux': '#dc2626',
  'Annulé': '#991b1b',
};

const statusIcon: Record<string, React.ReactNode> = {
  'Engagé': <CheckCircle2 className="w-3.5 h-3.5" />,
  'Jugé': <CheckCircle2 className="w-3.5 h-3.5" />,
  'En cours de jugement': <Clock className="w-3.5 h-3.5" />,
  'Publié sur PMP': <Activity className="w-3.5 h-3.5" />,
  'A programmer': <AlertCircle className="w-3.5 h-3.5" />,
  'Infructueux': <XCircle className="w-3.5 h-3.5" />,
  'Annulé': <XCircle className="w-3.5 h-3.5" />,
};

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be185d'];

const monthLabel = (m: string) => {
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const [y, mm] = m.split('-');
  return months[parseInt(mm) - 1] + ' ' + y.slice(2);
};

/* ── Custom Tooltip ───────────────────────────────────── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-sm font-semibold text-gray-800 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs flex items-center gap-2 text-gray-600">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: p.color }} />
          {p.name} : <strong className="text-gray-900">{fmtM(p.value)} DH</strong>
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
        <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm
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

/* ── Main Page ────────────────────────────────────────── */
export default function Dashboard() {
  const [data, setData] = useState<PPMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [filterNature, setFilterNature] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [fileChanged, setFileChanged] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const lastChecksumRef = useRef<string | null>(null);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch('/api/ppm');
      const json = await res.json();
      if (res.ok) {
        setData(json);
        lastChecksumRef.current = json.fileChecksum || null;
        setFileChanged(false);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

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

  /* ── Loading skeleton ── */
  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700">Chargement du dashboard</p>
            <p className="text-sm text-slate-400 mt-1">Lecture du fichier PPM 2026...</p>
          </div>
        </div>
      </div>
    );
  }

  const { projects, kpis, statusCount, entityBudget, natureBudget, typeBudget, monthlyTimeline, entityEngagementRate } = data;

  /* ── Derived data ── */
  const statusData = Object.entries(filteredStatusCount).map(([name, value]) => ({ name, value }));
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
    count: d.count,
  }));
  const typeData = Object.entries(filteredTypeBudget).map(([name, d]) => ({
    name,
    cp: Math.round(d.cp),
    ce: Math.round(d.ce),
    count: d.count,
  }));
  const engagementRateData = Object.entries(filteredEntityEngagementRate).map(([name, rate]) => ({ name, rate }));

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
    return matchSearch && matchStatus && matchEntity && matchNature && matchType;
  });

  const entities = [...new Set(projects.map(p => p.entite))].sort();
  const natures = [...new Set(projects.map(p => p.natureBudget))].sort();
  const types = [...new Set(projects.map(p => p.typeBudget))].sort();
  const statuses = [...new Set(projects.map(p => p.situationAvancement))].sort();

  // Compute KPIs from filtered data
  const filteredKpis = {
    totalProjects: filtered.length,
    totalCP: filtered.reduce((s, p) => s + (p.cp || 0), 0),
    totalCE: filtered.reduce((s, p) => s + (p.ce || 0), 0),
    totalBudget: filtered.reduce((s, p) => s + (p.cp || 0) + (p.ce || 0), 0),
    totalEstimation: filtered.reduce((s, p) => s + (p.estimationAdmin || 0), 0),
    totalEngagement: filtered.reduce((s, p) => s + (p.montantEngagement || 0), 0),
    totalMontantExtrait: filtered.reduce((s, p) => s + (p.montantExtrait || 0), 0),
  };
  const filteredStatusCount: Record<string, number> = {};
  filtered.forEach(p => { filteredStatusCount[p.situationAvancement] = (filteredStatusCount[p.situationAvancement] || 0) + 1; });
  const filteredEntityBudget: Record<string, { cp: number; ce: number; estimation: number; engagement: number; count: number }> = {};
  filtered.forEach(p => {
    if (!filteredEntityBudget[p.entite]) filteredEntityBudget[p.entite] = { cp: 0, ce: 0, estimation: 0, engagement: 0, count: 0 };
    filteredEntityBudget[p.entite].cp += p.cp || 0;
    filteredEntityBudget[p.entite].ce += p.ce || 0;
    filteredEntityBudget[p.entite].estimation += p.estimationAdmin || 0;
    filteredEntityBudget[p.entite].engagement += p.montantEngagement || 0;
    filteredEntityBudget[p.entite].count += 1;
  });
  const filteredNatureBudget: Record<string, { cp: number; ce: number; count: number }> = {};
  filtered.forEach(p => {
    if (!filteredNatureBudget[p.natureBudget]) filteredNatureBudget[p.natureBudget] = { cp: 0, ce: 0, count: 0 };
    filteredNatureBudget[p.natureBudget].cp += p.cp || 0;
    filteredNatureBudget[p.natureBudget].ce += p.ce || 0;
    filteredNatureBudget[p.natureBudget].count += 1;
  });
  const filteredTypeBudget: Record<string, { cp: number; ce: number; count: number }> = {};
  filtered.forEach(p => {
    if (!filteredTypeBudget[p.typeBudget]) filteredTypeBudget[p.typeBudget] = { cp: 0, ce: 0, count: 0 };
    filteredTypeBudget[p.typeBudget].cp += p.cp || 0;
    filteredTypeBudget[p.typeBudget].ce += p.ce || 0;
    filteredTypeBudget[p.typeBudget].count += 1;
  });
  const filteredMonthlyTimeline: Record<string, { count: number; estimation: number; engagement: number }> = {};
  filtered.forEach(p => {
    if (p.dateOuverture) {
      const month = p.dateOuverture.substring(0, 7);
      if (!filteredMonthlyTimeline[month]) filteredMonthlyTimeline[month] = { count: 0, estimation: 0, engagement: 0 };
      filteredMonthlyTimeline[month].count += 1;
      filteredMonthlyTimeline[month].estimation += p.estimationAdmin || 0;
      filteredMonthlyTimeline[month].engagement += p.montantEngagement || 0;
    }
  });
  const filteredEntityEngagementRate: Record<string, number> = {};
  Object.entries(filteredEntityBudget).forEach(([entity, d]) => {
    filteredEntityEngagementRate[entity] = d.estimation > 0 ? Math.round((d.engagement / d.estimation) * 100) : 0;
  });

  const hasActiveFilters = filterStatus !== 'all' || filterEntity !== 'all' || filterNature !== 'all' || filterType !== 'all';
  const clearAllFilters = () => { setFilterStatus('all'); setFilterEntity('all'); setFilterNature('all'); setFilterType('all'); setSearchTerm(''); };

  const engagedCount = filteredStatusCount['Engagé'] || 0;
  const judgedCount = filteredStatusCount['Jugé'] || 0;
  const inProgressCount = filteredStatusCount['En cours de jugement'] || 0;
  const pmpCount = filteredStatusCount['Publié sur PMP'] || 0;
  const toProgramCount = filteredStatusCount['A programmer'] || 0;
  const failedCount = (filteredStatusCount['Infructueux'] || 0) + (filteredStatusCount['Annulé'] || 0);
  const completedCount = engagedCount + judgedCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Dashboard PPM 2026
                </h1>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <CalendarDays className="w-3 h-3" />
                  <span>ORMVAG — {data.fileName ? data.fileName.replace(/\.xlsx?$/i, '') : 'PPM 2026'}</span>
                  {data.fileLastModified && (
                    <span className="text-slate-300">|</span>
                  )}
                  {data.fileLastModified && (
                    <span>Modifié : {new Date(data.fileLastModified).toLocaleString('fr-FR')}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* File changed notification */}
              {fileChanged && (
                <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Fichier mis à jour détecté...
                </div>
              )}
              {/* Data saved indicator */}
              {data.dataSaved && (
                <div className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 px-2.5 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Données sauvegardées</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="hidden sm:inline">{autoRefresh ? 'Auto-sync (5s)' : 'Sync off'}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="text-xs h-8"
              >
                {autoRefresh ? 'Pause' : 'Activer'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => fetchData(false)}
                disabled={refreshing}
                className="text-xs h-8 gap-1.5 bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpload(!showUpload)}
                className="text-xs h-8 gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Charger fichier</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ── Upload Section ── */}
        {showUpload && (
          <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm border-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-500" />
                    Mettre à jour le fichier source
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Uploadez un nouveau fichier Excel pour actualiser automatiquement tout le dashboard
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)} className="text-xs h-7">
                  Fermer
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Upload zone */}
                <FileUploader onUploadSuccess={handleUploadSuccess} />

                {/* Current file info */}
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
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
                            <p className="text-xs font-medium text-slate-600">{projects.length} projets</p>
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

                  <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-blue-700">Comment ça marche ?</h4>
                    <ul className="space-y-1.5 text-xs text-blue-600">
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">1</span>
                        Uploadez un nouveau fichier Excel (.xlsx ou .xls)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">2</span>
                        Le dashboard se recharge automatiquement avec les nouvelles données
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
        <Card className="border-0 shadow-md bg-white/90 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              {/* Filter row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Rechercher par objet, entité, attributaire..."
                    className="pl-9 h-10 text-sm bg-slate-50/80 border-slate-200 focus:bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Nature filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Nature</span>
                  <Select value={filterNature} onValueChange={setFilterNature}>
                    <SelectTrigger className="w-full sm:w-44 h-10 text-sm bg-slate-50/80 border-slate-200">
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
                    <SelectTrigger className="w-full sm:w-40 h-10 text-sm bg-slate-50/80 border-slate-200">
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
                    <SelectTrigger className="w-full sm:w-36 h-10 text-sm bg-slate-50/80 border-slate-200">
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
                    <SelectTrigger className="w-full sm:w-52 h-10 text-sm bg-slate-50/80 border-slate-200">
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

              {/* Active filters + result count */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {hasActiveFilters && (
                    <>
                      {filterNature !== 'all' && (
                        <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100 gap-1 cursor-pointer" onClick={() => setFilterNature('all')}>
                          Nature: {filterNature} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterType !== 'all' && (
                        <Badge className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 gap-1 cursor-pointer" onClick={() => setFilterType('all')}>
                          Type: {filterType} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterEntity !== 'all' && (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 gap-1 cursor-pointer" onClick={() => setFilterEntity('all')}>
                          Entité: {filterEntity} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      {filterStatus !== 'all' && (
                        <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 gap-1 cursor-pointer" onClick={() => setFilterStatus('all')}>
                          Statut: {filterStatus} <XCircle className="w-3 h-3" />
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-[10px] h-6 text-slate-400 hover:text-red-500">
                        Effacer tout
                      </Button>
                    </>
                  )}
                  {!hasActiveFilters && !searchTerm && (
                    <span className="text-[10px] text-slate-400">Aucun filtre actif — affichage de tous les marchés</span>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {filtered.length} / {projects.length} marchés
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── KPI Cards ── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KPICard
            title="Total Projets"
            value={filteredKpis.totalProjects.toString()}
            subtitle={`${completedCount} traités · ${toProgramCount} à programmer`}
            icon={<FileText className="w-5 h-5" />}
            trend={{ value: filteredKpis.totalProjects > 0 ? Math.round(completedCount / filteredKpis.totalProjects * 100) : 0, label: '% traités', up: true }}
            color="blue"
          />
          <KPICard
            title="Budget Total"
            value={fmtM(filteredKpis.totalBudget) + ' DH'}
            subtitle={`CP: ${fmtM(filteredKpis.totalCP)} · CE: ${fmtM(filteredKpis.totalCE)}`}
            icon={<DollarSign className="w-5 h-5" />}
            trend={{ value: filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0, label: '% engagé', up: filteredKpis.totalEngagement > filteredKpis.totalEstimation * 0.5 }}
            color="green"
          />
          <KPICard
            title="Estimation"
            value={fmtM(filteredKpis.totalEstimation) + ' DH'}
            subtitle={`Montant extrait: ${fmtM(filteredKpis.totalMontantExtrait)}`}
            icon={<TrendingUp className="w-5 h-5" />}
            trend={{ value: filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalMontantExtrait / filteredKpis.totalEstimation * 100) : 0, label: '% extraction', up: filteredKpis.totalMontantExtrait > filteredKpis.totalEstimation * 0.5 }}
            color="amber"
          />
          <KPICard
            title="Engagements"
            value={fmtM(filteredKpis.totalEngagement) + ' DH'}
            subtitle={`${completedCount + inProgressCount + pmpCount} marchés en cours`}
            icon={<CheckCircle2 className="w-5 h-5" />}
            trend={{ value: filteredKpis.totalEstimation > 0 ? Math.round(filteredKpis.totalEngagement / filteredKpis.totalEstimation * 100) : 0, label: '%/estim.', up: true }}
            color="violet"
          />
          <KPICard
            title="Échoués / Annulés"
            value={failedCount.toString()}
            subtitle={`${filteredStatusCount['Infructueux'] || 0} infructueux · ${filteredStatusCount['Annulé'] || 0} annulés`}
            icon={<XCircle className="w-5 h-5" />}
            trend={{ value: filteredKpis.totalProjects > 0 ? Math.round(failedCount / filteredKpis.totalProjects * 100) : 0, label: '% du total', up: false }}
            color="red"
          />
        </section>

        {/* ── Status Progress Bar ── */}
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Avancement Global des Marchés</h3>
              <span className="text-xs text-slate-400">{completedCount} / {filteredKpis.totalProjects} traités</span>
            </div>
            <div className="flex h-5 rounded-full overflow-hidden bg-slate-100">
              {Object.entries(filteredStatusCount).map(([status, count]) => (
                <div
                  key={status}
                  style={{ width: `${(count / filteredKpis.totalProjects) * 100}%`, backgroundColor: statusColor[status] || '#6b7280' }}
                  className="flex items-center justify-center transition-all duration-700"
                  title={`${status}: ${count} (${Math.round(count / filteredKpis.totalProjects * 100)}%)`}
                >
                  {(count / filteredKpis.totalProjects * 100) > 6 && (
                    <span className="text-[10px] font-bold text-white drop-shadow-sm">{count}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {Object.entries(filteredStatusCount).map(([status, count]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor[status] }} />
                  <span className="text-[11px] text-slate-500">{status} ({count})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Charts Row 1 ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status Distribution */}
          <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-blue-500" />
                Répartition par Statut
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={index} fill={statusColor[entry.name] || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} marchés`, name]}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Budget by Entity */}
          <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-green-500" />
                Budget par Entité (CP vs CE)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entityData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tickFormatter={fmtM} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={40} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="cp" name="CP" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={12} />
                    <Bar dataKey="ce" name="CE" fill="#16a34a" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Charts Row 2 ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Timeline */}
          <Card className="lg:col-span-2 border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-violet-500" />
                Chronologie des Estimations & Engagements
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <defs>
                      <linearGradient id="gradEstim" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradEngage" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tickFormatter={fmtM} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="estimation" name="Estimation" stroke="#2563eb" strokeWidth={2.5} fill="url(#gradEstim)" />
                    <Area type="monotone" dataKey="engagement" name="Engagement" stroke="#16a34a" strokeWidth={2.5} fill="url(#gradEngage)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Engagement Rate by Entity */}
          <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                Taux d&apos;Engagement par Entité
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {engagementRateData.sort((a, b) => b.rate - a.rate).map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">{item.name}</span>
                    <span className={`text-xs font-bold ${item.rate >= 50 ? 'text-green-600' : 'text-amber-600'}`}>
                      {item.rate}%
                    </span>
                  </div>
                  <Progress value={item.rate} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* ── Charts Row 3 ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Nature Budget */}
          <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-cyan-500" />
                Budget par Nature
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={natureData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis tickFormatter={fmtM} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="cp" name="CP" fill="#0891b2" radius={[4, 4, 0, 0]} barSize={40} />
                    <Bar dataKey="ce" name="CE" fill="#be185d" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Type Budget */}
          <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-rose-500" />
                Budget par Type (Initial vs Mi-parcours)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis tickFormatter={fmtM} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="cp" name="CP" fill="#7c3aed" radius={[4, 4, 0, 0]} barSize={40} />
                    <Bar dataKey="ce" name="CE" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Entity Detail Cards ── */}
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            Détail par Entité
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {Object.entries(filteredEntityBudget).sort(([,a], [,b]) => b.estimation - a.estimation).map(([name, d]) => (
              <Card key={name} className="border-0 shadow-sm bg-white/80 hover:shadow-md transition-shadow">
                <CardContent className="p-4 text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                    <span className="text-sm font-bold text-white">{name}</span>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-800">{d.count}</p>
                    <p className="text-[10px] text-slate-400">marchés</p>
                  </div>
                  <Separator />
                  <div className="space-y-1 text-left">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Estim.</span>
                      <span className="font-medium text-slate-700">{fmtM(d.estimation)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Engagé</span>
                      <span className="font-medium text-green-600">{fmtM(d.engagement)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Taux</span>
                      <span className={`font-bold ${filteredEntityEngagementRate[name] >= 50 ? 'text-green-600' : 'text-amber-600'}`}>
                        {filteredEntityEngagementRate[name]}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Projects Table ── */}
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Liste des Marchés
                  <Badge variant="secondary" className="text-[10px] ml-1">{filtered.length} / {projects.length}</Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Cliquez sur les filtres pour affiner la recherche
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {/* Filters hint */}
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">
                Utilisez les filtres en haut de page pour affiner les résultats
              </span>
              <span className="text-xs font-medium text-slate-500 ml-auto">
                {filtered.length} résultats
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 w-10">#</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Entité</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 min-w-[200px]">Objet</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Type</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500">CP</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500">CE</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Estim.</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-500">Statut</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Engagement</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Attributaire</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map((p, idx) => (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                    >
                      <td className="px-3 py-2 text-slate-400 font-mono">{p.id}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">
                          {p.entite}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[300px]">
                        <span className="line-clamp-2" title={p.objet}>{p.objet}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[9px] h-5 font-medium">
                          {p.natureBudget}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{p.cp ? fmtFull(p.cp) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{p.ce ? fmtFull(p.ce) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 font-medium">
                        {p.estimationAdmin ? fmtFull(p.estimationAdmin) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge
                          className="text-[9px] h-5 gap-1 font-medium border-0 text-white"
                          style={{ backgroundColor: statusColor[p.situationAvancement] || '#6b7280' }}
                        >
                          {statusIcon[p.situationAvancement]}
                          {p.situationAvancement}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-green-700">
                        {p.montantEngagement ? fmtFull(p.montantEngagement) : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[120px]">
                        <span className="line-clamp-1" title={p.attributaire || ''}>{p.attributaire || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 50 && (
                <div className="text-center py-3 text-xs text-slate-400 bg-slate-50/50">
                  Affichage de 50 sur {filtered.length} résultats. Utilisez les filtres pour affiner.
                </div>
              )}
              {filtered.length === 0 && (
                <div className="text-center py-10 text-sm text-slate-400">
                  Aucun résultat trouvé. Modifiez vos critères de recherche.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Footer ── */}
        <footer className="text-center text-xs text-slate-400 pb-6 pt-2 space-y-1">
          <p>Dashboard PPM 2026 — ORMVA du Gharb · Dernière lecture : {new Date(data.lastUpdated).toLocaleString('fr-FR')}</p>
          {data.fileChecksum && (
            <p className="text-[10px] text-slate-300">
              Checksum : {data.fileChecksum.substring(0, 12)}... · Sync auto : {autoRefresh ? 'ON (5s)' : 'OFF'} · Base de données : {data.dataSaved ? 'SQLite ✓' : 'Non synchronisée'}
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}

/* ── KPI Card Component ── */
function KPICard({
  title, value, subtitle, icon, trend, color
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  trend: { value: number; label: string; up: boolean };
  color: 'blue' | 'green' | 'amber' | 'violet' | 'red';
}) {
  const colorMap = {
    blue: 'from-blue-500 to-blue-600 shadow-blue-500/20',
    green: 'from-green-500 to-green-600 shadow-green-500/20',
    amber: 'from-amber-500 to-amber-600 shadow-amber-500/20',
    violet: 'from-violet-500 to-violet-600 shadow-violet-500/20',
    red: 'from-red-500 to-red-600 shadow-red-500/20',
  };

  return (
    <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm hover:shadow-lg transition-shadow">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center shadow-lg text-white`}>
            {icon}
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            {trend.up ? (
              <ArrowUpRight className="w-3 h-3 text-green-500" />
            ) : (
              <ArrowDownRight className="w-3 h-3 text-red-500" />
            )}
            <span className={`font-bold ${trend.up ? 'text-green-600' : 'text-red-600'}`}>{trend.value}%</span>
            <span className="text-slate-400">{trend.label}</span>
          </div>
        </div>
        <div>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{title}</p>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
