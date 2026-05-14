'use client';

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
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
  CloudUpload, AlertTriangle, CheckCircle, ChevronUp, ChevronDown,
  X, ClipboardList, History,
  BarChart3 as BarChartIcon2, ChevronLeft, PanelRightOpen, PanelRightClose
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
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const lastChecksumRef = useRef<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'ao' | 'history'>('ao');
  const [expandedAO, setExpandedAO] = useState<number | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

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

  // Reset expanded when filters change
  useEffect(() => {
    setExpandedRow(null);
  }, [filterStatus, filterEntity, filterNature, filterType, searchTerm]);

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

  // Daily openings computation for sidebar history tab
  const dailyOpenings: Record<string, PPMProject[]> = {};
  filtered.forEach(p => {
    if (p.dateOuverture) {
      if (!dailyOpenings[p.dateOuverture]) dailyOpenings[p.dateOuverture] = [];
      dailyOpenings[p.dateOuverture].push(p);
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
    totalMontantExtrait: filtered.reduce((s, p) => s + (p.montantExtrait || 0), 0),
  };
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
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
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
              {fileChanged && (
                <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Fichier mis à jour détecté...
                </div>
              )}
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
              <Button
                variant={showSidebar ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowSidebar(!showSidebar)}
                className={`text-xs h-8 gap-1.5 ${showSidebar ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {showSidebar ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Panneau</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex gap-0 relative">
        {/* ── Left Sidebar — Détail AO + Historique Ouvertures Plis ── */}
        <aside
          className={`${showSidebar ? 'w-[340px]' : 'w-0'} transition-all duration-300 ease-in-out overflow-hidden shrink-0 border-r border-slate-200 bg-white relative z-30`}
        >
          {showSidebar && (
            <div className="w-[340px] h-screen flex flex-col sticky top-0">
              {/* Sidebar Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md shadow-blue-500/20">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xs font-bold text-slate-800">PPM 2026</h1>
                    <p className="text-[9px] text-slate-400">ORMVAG</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSidebar(false)} className="h-7 w-7 p-0 hover:bg-slate-100">
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                </Button>
              </div>

              {/* Tab Switcher */}
              <div className="flex border-b border-slate-100">
                <button
                  onClick={() => setSidebarTab('ao')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-all duration-200 border-b-2
                    ${sidebarTab === 'ao'
                      ? 'text-blue-600 border-blue-600 bg-blue-50/50'
                      : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Détail des AO
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{filtered.length}</Badge>
                </button>
                <button
                  onClick={() => setSidebarTab('history')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-all duration-200 border-b-2
                    ${sidebarTab === 'history'
                      ? 'text-violet-600 border-violet-600 bg-violet-50/50'
                      : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <History className="w-3.5 h-3.5" />
                  Historique Plis
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{sortedDailyOpenings.length}</Badge>
                </button>
              </div>

              {/* ── Tab: Détail des AO ── */}
              {sidebarTab === 'ao' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Search */}
                  <div className="px-3 py-2 border-b border-slate-50">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                      <Input
                        placeholder="Rechercher un AO..."
                        className="pl-8 h-8 text-xs bg-slate-50 border-slate-150"
                        value={sidebarSearch}
                        onChange={(e) => setSidebarSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  {/* Quick Status Filters */}
                  <div className="px-3 py-2 border-b border-slate-50 flex flex-wrap gap-1">
                    {Object.entries(filteredStatusCount).map(([status, count]) => (
                      <button
                        key={status}
                        onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-medium transition-all
                          ${filterStatus === status
                            ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[status] }} />
                        {count}
                      </button>
                    ))}
                  </div>
                  {/* AO List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {filtered
                      .filter(p => !sidebarSearch ||
                        p.objet.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
                        p.entite.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
                        p.attributaire?.toLowerCase().includes(sidebarSearch.toLowerCase())
                      )
                      .map(p => {
                        const isExpanded = expandedAO === p.id;
                        return (
                          <div
                            key={p.id}
                            className={`rounded-xl border transition-all duration-200 cursor-pointer
                              ${isExpanded
                                ? 'border-blue-200 bg-blue-50/30 shadow-md'
                                : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
                              }`}
                          >
                            {/* Card Header */}
                            <div
                              className="px-3 py-2.5"
                              onClick={() => setExpandedAO(isExpanded ? null : p.id)}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center justify-center w-6 h-5 rounded bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold text-[8px] shadow-sm">
                                    {p.entite}
                                  </span>
                                  <Badge
                                    className="text-[8px] h-4 gap-0.5 border-0 text-white shrink-0"
                                    style={{ backgroundColor: statusColor[p.situationAvancement] || '#6b7280' }}
                                  >
                                    {statusIcon[p.situationAvancement]}
                                  </Badge>
                                </div>
                                <span className="text-[9px] text-slate-300 font-mono">#{p.id}</span>
                              </div>
                              <p className="text-[11px] font-medium text-slate-700 line-clamp-2 leading-relaxed mb-1.5">{p.objet}</p>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[9px]">
                                  <span className="text-blue-600 font-medium">Estim: {fmtM(p.estimationAdmin || 0)}</span>
                                  {p.montantEngagement > 0 && (
                                    <span className="text-green-600 font-medium">Engagé: {fmtM(p.montantEngagement)}</span>
                                  )}
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                                )}
                              </div>
                            </div>

                            {/* Expanded Detail */}
                            {isExpanded && (
                              <div className="px-3 pb-3 pt-0 border-t border-slate-100/80">
                                <div className="space-y-2 mt-2">
                                  <div className="bg-slate-50 rounded-lg p-2">
                                    <p className="text-[8px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Budget</p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      <div className="text-center">
                                        <p className="text-[9px] text-slate-500">CP</p>
                                        <p className="text-[10px] font-bold text-blue-600">{p.cp ? fmtM(p.cp) : '—'}</p>
                                      </div>
                                      <div className="text-center">
                                        <p className="text-[9px] text-slate-500">CE</p>
                                        <p className="text-[10px] font-bold text-cyan-600">{p.ce ? fmtM(p.ce) : '—'}</p>
                                      </div>
                                      <div className="text-center">
                                        <p className="text-[9px] text-slate-500">Estim.</p>
                                        <p className="text-[10px] font-bold text-slate-800">{p.estimationAdmin ? fmtM(p.estimationAdmin) : '—'}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-2">
                                    <p className="text-[8px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Engagement</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <div>
                                        <p className="text-[9px] text-slate-500">Montant</p>
                                        <p className="text-[10px] font-bold text-green-700">{p.montantEngagement ? fmtFull(p.montantEngagement) : '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[9px] text-slate-500">Extrait</p>
                                        <p className="text-[10px] font-bold text-amber-600">{p.montantExtrait ? fmtM(p.montantExtrait) : '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[9px] text-slate-500">Eng. CP</p>
                                        <p className="text-[10px] font-medium text-slate-600">{p.engagementCP ? fmtM(p.engagementCP) : '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[9px] text-slate-500">Eng. CE</p>
                                        <p className="text-[10px] font-medium text-slate-600">{p.engagementCE ? fmtM(p.engagementCE) : '—'}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-2">
                                    <p className="text-[8px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Dates</p>
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Ouverture Plis</span>
                                        <span className="font-mono font-medium text-violet-600">{p.dateOuverture || '—'}</span>
                                      </div>
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Jugement</span>
                                        <span className="font-mono font-medium text-amber-600">{p.dateJugement || '—'}</span>
                                      </div>
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Engagement</span>
                                        <span className="font-mono font-medium text-green-600">{p.dateEngagement || '—'}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-2">
                                    <p className="text-[8px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Infos</p>
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">N° AO</span>
                                        <span className="font-mono text-slate-700">{p.numAO || '—'}</span>
                                      </div>
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">N° Marché</span>
                                        <span className="font-mono text-slate-700">{p.numMarche || '—'}</span>
                                      </div>
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Attributaire</span>
                                        <span className="text-slate-700 truncate max-w-[150px] text-right">{p.attributaire || '—'}</span>
                                      </div>
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Nature</span>
                                        <span className="text-slate-700">{p.natureBudget}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Engagement rate bar */}
                                  {p.estimationAdmin && p.estimationAdmin > 0 && p.montantEngagement ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[8px] text-slate-400">Taux:</span>
                                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600"
                                          style={{ width: `${Math.min(100, Math.round((p.montantEngagement / p.estimationAdmin) * 100))}%` }}
                                        />
                                      </div>
                                      <span className="text-[9px] font-bold text-green-600">
                                        {Math.round((p.montantEngagement / p.estimationAdmin) * 100)}%
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {filtered.filter(p => !sidebarSearch ||
                      p.objet.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
                      p.entite.toLowerCase().includes(sidebarSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="text-center py-8">
                        <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Aucun AO trouvé</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab: Historique Ouvertures Plis ── */}
              {sidebarTab === 'history' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-50">
                    <p className="text-[10px] text-slate-400">{sortedDailyOpenings.length} jours · {filtered.filter(p => p.dateOuverture).length} projets avec date d&apos;ouverture</p>
                  </div>
                  {/* Timeline */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {sortedDailyOpenings.length === 0 && (
                      <div className="text-center py-8">
                        <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Aucune date d&apos;ouverture trouvée</p>
                      </div>
                    )}
                    {sortedDailyOpenings.map(([date, projectsList]) => (
                      <div key={date}>
                        {/* Date group header */}
                        <div className="bg-gradient-to-r from-violet-50 to-slate-50 px-3 py-2 rounded-lg flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-xs font-semibold text-slate-700">{date}</span>
                          </div>
                          <Badge variant="secondary" className="text-[9px] h-5">{projectsList.length} AO</Badge>
                        </div>
                        {/* Projects under this date */}
                        <div className="space-y-1.5">
                          {projectsList.map(p => (
                            <div
                              key={p.id}
                              className="p-2.5 rounded-lg border border-slate-100 hover:border-violet-200 hover:bg-violet-50/20 transition-all cursor-pointer"
                              onClick={() => {
                                setSidebarTab('ao');
                                setExpandedAO(p.id);
                              }}
                            >
                              <div className="flex items-start justify-between gap-1.5 mb-1">
                                <Badge variant="outline" className="text-[8px] h-4 bg-slate-50 border-slate-200 text-slate-500 shrink-0">{p.entite}</Badge>
                                <Badge
                                  className="text-[8px] h-4 gap-0.5 shrink-0 border-0 text-white"
                                  style={{ backgroundColor: statusColor[p.situationAvancement] || '#6b7280' }}
                                >
                                  {statusIcon[p.situationAvancement]}
                                </Badge>
                              </div>
                              <p className="text-[11px] font-medium text-slate-700 line-clamp-2 mb-1">{p.objet}</p>
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-blue-600 font-medium">Estim: {fmtM(p.estimationAdmin || 0)} DH</span>
                                {p.attributaire && <span className="text-slate-400 truncate max-w-[100px]">{p.attributaire}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sidebar Footer */}
              <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-2">
                <button
                  onClick={() => { setShowUpload(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Charger
                </button>
                <button
                  onClick={() => { setAutoRefresh(!autoRefresh); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'text-green-500' : ''}`} />
                  Sync {autoRefresh ? 'ON' : 'OFF'}
                  <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* ── Center Content ── */}
        <div className="flex-1 min-w-0 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
              <span className="text-xs text-slate-400">{completedCount} / {filteredKpis.totalProjects} traités — Engagé: {fmtM(filteredKpis.totalEngagement)} DH</span>
            </div>
            <div className="flex h-5 rounded-full overflow-hidden bg-slate-100">
              {Object.entries(filteredStatusCount).map(([status, count]) => (
                <div
                  key={status}
                  style={{ width: `${(count / filteredKpis.totalProjects) * 100}%`, backgroundColor: statusColor[status] || '#6b7280' }}
                  className="flex items-center justify-center transition-all duration-700"
                  title={`${status}: ${count} (${Math.round(count / filteredKpis.totalProjects * 100)}%) — Estim: ${fmtM(filteredStatusBudget[status]?.estimation || 0)} DH — Engagé: ${fmtM(filteredStatusBudget[status]?.engagement || 0)} DH`}
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
                  <span className="text-[9px] text-blue-600 font-medium">{fmtM(filteredStatusBudget[status]?.estimation || 0)} DH</span>
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
              <p className="text-[10px] text-slate-400 mt-0.5">Montants d'estimation et d'engagement par statut</p>
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
                      formatter={(value: number, name: string, props: { payload: { estimation: number; engagement: number; value: number } }) => {
                        if (name === 'value') {
                          const d = props.payload;
                          return [
                            <span key="v">
                              <strong>{d.value} marchés</strong>
                              <br />
                              <span className="text-blue-600">Estim: {fmtM(d.estimation)} DH</span>
                              <br />
                              <span className="text-green-600">Engagé: {fmtM(d.engagement)} DH</span>
                            </span>,
                            name
                          ];
                        }
                        return [value, name];
                      }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value, entry) => {
                        const item = statusData.find(d => d.name === value);
                        const amt = item ? fmtM(item.estimation) : '';
                        return <span className="text-[11px] text-slate-600">{value} <span className="text-[9px] text-slate-400">({amt} DH)</span></span>;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Status amounts summary */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {statusData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor[item.name] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-slate-700 truncate">{item.name}</p>
                      <div className="flex items-center gap-2 text-[9px]">
                        <span className="text-blue-600">Estim: {fmtM(item.estimation)}</span>
                        <span className="text-green-600">Engagé: {fmtM(item.engagement)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Budget by Entity */}
          <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-green-500" />
                Budget par Entité (Montants DH)
              </CardTitle>
              <p className="text-[10px] text-slate-400 mt-0.5">Estimations, engagements, CP et CE par entité</p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entityData} layout="vertical" margin={{ left: 20, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tickFormatter={fmtM} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={40} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="estimation" name="Estimation" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={8}
                      label={{ position: 'right', formatter: (v: number) => fmtM(v), fontSize: 9, fill: '#3b82f6' }} />
                    <Bar dataKey="engagement" name="Engagement" fill="#16a34a" radius={[0, 4, 4, 0]} barSize={8}
                      label={{ position: 'right', formatter: (v: number) => fmtM(v), fontSize: 9, fill: '#16a34a' }} />
                    <Bar dataKey="cp" name="CP" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={8} />
                    <Bar dataKey="ce" name="CE" fill="#0891b2" radius={[0, 4, 4, 0]} barSize={8} />
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
                Chronologie des Estimations & Engagements (DH)
              </CardTitle>
              <p className="text-[10px] text-slate-400 mt-0.5">Évolution des montants par date d'ouverture des plis</p>
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
                    <Area type="monotone" dataKey="estimation" name="Estimation" stroke="#2563eb" strokeWidth={2.5} fill="url(#gradEstim)"
                      label={{ formatter: (v: number) => fmtM(v), position: 'top', fontSize: 9, fill: '#2563eb' }} />
                    <Area type="monotone" dataKey="engagement" name="Engagement" stroke="#16a34a" strokeWidth={2.5} fill="url(#gradEngage)"
                      label={{ formatter: (v: number) => fmtM(v), position: 'top', fontSize: 9, fill: '#16a34a' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {/* Monthly amounts summary */}
              <div className="flex flex-wrap gap-2 mt-3">
                {timelineData.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-lg px-2.5 py-1.5 text-center min-w-[80px]">
                    <p className="text-[9px] font-medium text-slate-500">{item.month}</p>
                    <p className="text-[10px] font-bold text-blue-600">{fmtM(item.estimation)}</p>
                    <p className="text-[10px] font-bold text-green-600">{fmtM(item.engagement)}</p>
                  </div>
                ))}
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
              <p className="text-[10px] text-slate-400 mt-0.5">Montants engagés vs estimés</p>
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
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-blue-600">Estim: {fmtM(item.estimation)} DH</span>
                    <span className="text-green-600">Engagé: {fmtM(item.engagement)} DH</span>
                  </div>
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
                Budget par Nature (Montants DH)
              </CardTitle>
              <p className="text-[10px] text-slate-400 mt-0.5">Estimations, engagements, CP et CE par nature de budget</p>
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
                    <Bar dataKey="estimation" name="Estimation" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}
                      label={{ position: 'top', formatter: (v: number) => fmtM(v), fontSize: 9, fill: '#3b82f6' }} />
                    <Bar dataKey="engagement" name="Engagement" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={20}
                      label={{ position: 'top', formatter: (v: number) => fmtM(v), fontSize: 9, fill: '#16a34a' }} />
                    <Bar dataKey="cp" name="CP" fill="#0891b2" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="ce" name="CE" fill="#be185d" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Nature amounts summary */}
              <div className="flex flex-wrap gap-2 mt-3">
                {natureData.map((item) => (
                  <div key={item.name} className="bg-slate-50 rounded-lg px-2.5 py-1.5 text-center min-w-[100px]">
                    <p className="text-[10px] font-medium text-slate-700">{item.name}</p>
                    <div className="flex items-center gap-2 justify-center text-[9px]">
                      <span className="text-blue-600">Estim: {fmtM(item.estimation)}</span>
                      <span className="text-green-600">Engagé: {fmtM(item.engagement)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Type Budget */}
          <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-rose-500" />
                Budget par Type — Initial vs Mi-parcours (Montants DH)
              </CardTitle>
              <p className="text-[10px] text-slate-400 mt-0.5">Estimations, engagements, CP et CE par type de budget</p>
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
                    <Bar dataKey="estimation" name="Estimation" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}
                      label={{ position: 'top', formatter: (v: number) => fmtM(v), fontSize: 9, fill: '#3b82f6' }} />
                    <Bar dataKey="engagement" name="Engagement" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={20}
                      label={{ position: 'top', formatter: (v: number) => fmtM(v), fontSize: 9, fill: '#16a34a' }} />
                    <Bar dataKey="cp" name="CP" fill="#7c3aed" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="ce" name="CE" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Type amounts summary */}
              <div className="flex flex-wrap gap-2 mt-3">
                {typeData.map((item) => (
                  <div key={item.name} className="bg-slate-50 rounded-lg px-2.5 py-1.5 text-center min-w-[100px]">
                    <p className="text-[10px] font-medium text-slate-700">{item.name}</p>
                    <div className="flex items-center gap-2 justify-center text-[9px]">
                      <span className="text-blue-600">Estim: {fmtM(item.estimation)}</span>
                      <span className="text-green-600">Engagé: {fmtM(item.engagement)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Entity Detail Cards ── */}
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            Détail par Entité — Montants en DH
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
                      <span className="text-slate-400">CP</span>
                      <span className="font-medium text-blue-600">{fmtM(d.cp)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">CE</span>
                      <span className="font-medium text-cyan-600">{fmtM(d.ce)}</span>
                    </div>
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
        <Card id="projects-table" className="border-0 shadow-md bg-white/80 backdrop-blur-sm scroll-mt-20">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Liste des Marchés
                  <Badge variant="secondary" className="text-[10px] ml-1">{filtered.length} / {projects.length}</Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Cliquez sur une ligne pour voir les détails complets du marché
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] h-6 border-slate-200 bg-slate-50 text-slate-600">
                  {filtered.length} marché{filtered.length > 1 ? 's' : ''} sur une seule page
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4 sm:px-5 sm:pb-5">
            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80 shadow-sm">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  {/* Main header groups */}
                  <tr className="bg-gradient-to-r from-slate-200/90 to-slate-100/90 backdrop-blur-sm border-b border-slate-300">
                    <th rowSpan={2} className="px-2.5 py-2.5 text-left font-bold text-slate-700 w-9 bg-slate-200/90 backdrop-blur-sm">#</th>
                    <th rowSpan={2} className="px-2.5 py-2.5 text-left font-bold text-slate-700 bg-slate-200/90 backdrop-blur-sm">Entité</th>
                    <th rowSpan={2} className="px-2.5 py-2.5 text-left font-bold text-slate-700 min-w-[240px] bg-slate-200/90 backdrop-blur-sm">Objet du Marché</th>
                    <th rowSpan={2} className="px-2.5 py-2.5 text-center font-bold text-slate-700 bg-slate-200/90 backdrop-blur-sm">Nature</th>
                    <th colSpan={3} className="px-2.5 py-2 text-center font-bold text-blue-700 bg-blue-100/80 backdrop-blur-sm border-b border-blue-200/60 text-[10px] uppercase tracking-wider">Budget</th>
                    <th rowSpan={2} className="px-2.5 py-2.5 text-center font-bold text-slate-700 bg-slate-200/90 backdrop-blur-sm">Statut</th>
                    <th colSpan={3} className="px-2.5 py-2 text-center font-bold text-green-700 bg-green-100/80 backdrop-blur-sm border-b border-green-200/60 text-[10px] uppercase tracking-wider">Engagement</th>
                    <th colSpan={3} className="px-2.5 py-2 text-center font-bold text-violet-700 bg-violet-100/80 backdrop-blur-sm border-b border-violet-200/60 text-[10px] uppercase tracking-wider">Dates Clés</th>
                    <th rowSpan={2} className="px-2.5 py-2.5 text-left font-bold text-slate-700 min-w-[120px] bg-slate-200/90 backdrop-blur-sm">Attributaire</th>
                  </tr>
                  <tr className="bg-slate-100/90 backdrop-blur-sm border-b-2 border-slate-300">
                    <th className="px-2.5 py-1.5 text-right font-semibold text-slate-600 text-[10px]">CP</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-slate-600 text-[10px]">CE</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-slate-600 text-[10px]">Estimation</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-slate-600 text-[10px]">Montant</th>
                    <th className="px-2.5 py-1.5 text-center font-semibold text-slate-600 text-[10px]">Engag. CP</th>
                    <th className="px-2.5 py-1.5 text-center font-semibold text-slate-600 text-[10px]">Engag. CE</th>
                    <th className="px-2.5 py-1.5 text-center font-semibold text-slate-600 text-[10px]">Ouverture Plis</th>
                    <th className="px-2.5 py-1.5 text-center font-semibold text-slate-600 text-[10px]">Jugement</th>
                    <th className="px-2.5 py-1.5 text-center font-semibold text-slate-600 text-[10px]">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => {
                    const globalIdx = idx;
                    const isExpanded = expandedRow === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr
                          className={`border-b border-slate-100/80 cursor-pointer transition-all duration-200 group
                            ${isExpanded
                              ? 'bg-blue-50/70 border-l-[3px] border-l-blue-500 shadow-inner'
                              : 'hover:bg-blue-50/30 hover:border-l-[3px] hover:border-l-blue-300 border-l-[3px] border-l-transparent'
                            }
                            ${globalIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                          onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                        >
                          <td className="px-2.5 py-3 text-slate-400 font-mono text-[10px]">{p.id}</td>
                          <td className="px-2.5 py-3">
                            <span className="inline-flex items-center justify-center w-9 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold text-[10px] shadow-sm">
                              {p.entite}
                            </span>
                          </td>
                          <td className="px-2.5 py-3 text-slate-700 max-w-[300px]">
                            <div className="flex items-start gap-1.5">
                              <span className="line-clamp-2 leading-relaxed text-[11px]" title={p.objet}>{p.objet}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                              )}
                            </div>
                          </td>
                          <td className="px-2.5 py-3 text-center">
                            <Badge variant="outline" className="text-[9px] h-5 font-medium border-slate-200 bg-white">
                              {p.natureBudget}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-3 text-right font-mono text-slate-600 text-[10px]">{p.cp ? fmtFull(p.cp) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-2.5 py-3 text-right font-mono text-slate-600 text-[10px]">{p.ce ? fmtFull(p.ce) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-2.5 py-3 text-right font-mono font-semibold text-slate-800 text-[10px]">
                            {p.estimationAdmin ? fmtFull(p.estimationAdmin) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2.5 py-3 text-center">
                            <Badge
                              className="text-[8px] h-5 gap-0.5 font-semibold border-0 text-white shadow-sm whitespace-nowrap"
                              style={{ backgroundColor: statusColor[p.situationAvancement] || '#6b7280' }}
                            >
                              {statusIcon[p.situationAvancement]}
                              {p.situationAvancement}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-3 text-right font-mono font-semibold text-green-700 text-[10px]">
                            {p.montantEngagement ? fmtFull(p.montantEngagement) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2.5 py-3 text-center font-mono text-slate-500 text-[10px]">
                            {p.engagementCP ? fmtFull(p.engagementCP) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2.5 py-3 text-center font-mono text-slate-500 text-[10px]">
                            {p.engagementCE ? fmtFull(p.engagementCE) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2.5 py-3 text-center font-mono text-[10px]">
                            {p.dateOuverture ? (
                              <span className="inline-flex items-center gap-1 text-slate-600 bg-violet-50 px-1.5 py-0.5 rounded">
                                <CalendarDays className="w-3 h-3 text-violet-400" />
                                {p.dateOuverture}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2.5 py-3 text-center font-mono text-[10px]">
                            {p.dateJugement ? (
                              <span className="inline-flex items-center gap-1 text-slate-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                <CalendarDays className="w-3 h-3 text-amber-400" />
                                {p.dateJugement}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2.5 py-3 text-center font-mono text-[10px]">
                            {p.dateEngagement ? (
                              <span className="inline-flex items-center gap-1 text-slate-600 bg-green-50 px-1.5 py-0.5 rounded">
                                <CalendarDays className="w-3 h-3 text-green-400" />
                                {p.dateEngagement}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2.5 py-3 text-slate-600 max-w-[130px]">
                            <span className="line-clamp-1 text-[10px]" title={p.attributaire || ''}>{p.attributaire || <span className="text-slate-300">—</span>}</span>
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr className="bg-gradient-to-r from-blue-50/50 to-white border-b border-blue-100/50">
                            <td colSpan={15} className="px-4 py-3">
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                <div className="bg-white rounded-lg p-2.5 shadow-sm border border-slate-100">
                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Objet complet</p>
                                  <p className="text-[10px] text-slate-700 leading-relaxed">{p.objet}</p>
                                </div>
                                <div className="bg-white rounded-lg p-2.5 shadow-sm border border-slate-100">
                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1">N° AO / N° Marché</p>
                                  <p className="text-[10px] text-slate-700">AO: <span className="font-mono font-medium">{p.numAO || '—'}</span></p>
                                  <p className="text-[10px] text-slate-700">Marché: <span className="font-mono font-medium">{p.numMarche || '—'}</span></p>
                                </div>
                                <div className="bg-white rounded-lg p-2.5 shadow-sm border border-slate-100">
                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Budget Détaillé</p>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">CP</span><span className="font-mono font-medium text-blue-600">{p.cp ? fmtFull(p.cp) : '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">CE</span><span className="font-mono font-medium text-cyan-600">{p.ce ? fmtFull(p.ce) : '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Estimation</span><span className="font-mono font-semibold text-slate-800">{p.estimationAdmin ? fmtFull(p.estimationAdmin) : '—'}</span></div>
                                  </div>
                                </div>
                                <div className="bg-white rounded-lg p-2.5 shadow-sm border border-slate-100">
                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Engagement Détaillé</p>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Montant</span><span className="font-mono font-semibold text-green-700">{p.montantEngagement ? fmtFull(p.montantEngagement) : '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Engag. CP</span><span className="font-mono text-slate-600">{p.engagementCP ? fmtFull(p.engagementCP) : '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Engag. CE</span><span className="font-mono text-slate-600">{p.engagementCE ? fmtFull(p.engagementCE) : '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Montant extrait</span><span className="font-mono text-amber-600">{p.montantExtrait ? fmtFull(p.montantExtrait) : '—'}</span></div>
                                  </div>
                                </div>
                                <div className="bg-white rounded-lg p-2.5 shadow-sm border border-slate-100">
                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Dates & Attributaire</p>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Ouverture</span><span className="font-mono text-violet-600">{p.dateOuverture || '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Jugement</span><span className="font-mono text-amber-600">{p.dateJugement || '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Engagement</span><span className="font-mono text-green-600">{p.dateEngagement || '—'}</span></div>
                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Attributaire</span><span className="font-medium text-slate-700 truncate max-w-[100px]">{p.attributaire || '—'}</span></div>
                                  </div>
                                </div>
                              </div>
                              {/* Engagement rate mini bar */}
                              {p.estimationAdmin && p.estimationAdmin > 0 && p.montantEngagement && (
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="text-[9px] text-slate-400">Taux engagement:</span>
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600"
                                      style={{ width: `${Math.min(100, Math.round((p.montantEngagement / p.estimationAdmin) * 100))}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-green-600">
                                    {Math.round((p.montantEngagement / p.estimationAdmin) * 100)}%
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-sm text-slate-400">
                  <FileText className="w-10 h-10 mx-auto text-slate-200 mb-2" />
                  <p className="font-medium">Aucun résultat trouvé</p>
                  <p className="text-xs mt-1">Modifiez vos critères de recherche ou filtres</p>
                </div>
              )}
            </div>

            {/* Total count indicator */}
            <div className="flex items-center justify-center mt-3 px-1">
              <span className="text-[10px] text-slate-400">
                {filtered.length} marché{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''} sur {projects.length}
              </span>
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
        </div>{/* end center content */}
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
