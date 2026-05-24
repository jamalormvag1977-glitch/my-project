'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { BarChart3, Eye, EyeOff, Shield, Lock, AlertTriangle } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDebugInfo('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Mot de passe incorrect');
        setDebugInfo(`Erreur: ${result.error} | Status: ${result.status || 'N/A'}`);
      } else if (result?.ok) {
        // Small delay to let session propagate
        await new Promise(resolve => setTimeout(resolve, 500));
        router.push('/');
        router.refresh();
      } else {
        setError('Erreur inconnue');
        setDebugInfo(`Result: ${JSON.stringify(result)}`);
      }
    } catch (err: any) {
      setError('Erreur de connexion');
      setDebugInfo(err?.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'radial-gradient(circle at 25px 25px, white 2px, transparent 0)',
        backgroundSize: '50px 50px'
      }} />

      <div className="relative w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">PPM 2026</h1>
          <p className="text-sm text-gray-400 mt-1">ORMVA du Gharb — Plan de Passation des Marchés</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Accès sécurisé</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Password only */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Entrez votre mot de passe"
                  className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200 text-sm"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Debug info - temporary */}
            {debugInfo && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400 text-[10px] font-mono flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{debugInfo}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connexion...
                </span>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          {/* Roles info */}
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span className="font-medium text-gray-400">Mot de passe Admin</span> — Gestion + upload des fichiers
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="font-medium text-gray-400">Mot de passe Observateur</span> — Consultation uniquement
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-600 mt-6">
          PPM 2026 — ORMVA du Gharb · Accès réservé
        </p>
      </div>
    </div>
  );
}
