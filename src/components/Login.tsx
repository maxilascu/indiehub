import { useState } from 'react';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Ingresá tu email y contraseña.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError('Credenciales incorrectas. Verificá tu email y contraseña.');
        return;
      }
      window.location.assign('/admin');
    } catch {
      setError('Ocurrió un error inesperado. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
            <Lock className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-lg font-bold text-neutral-900">IndieHub Admin</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Iniciá sesión para acceder al panel de administración.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            autoFocus
            disabled={loading}
            className="w-full rounded-lg bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 ring-1 ring-neutral-200 transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
            disabled={loading}
            className="w-full rounded-lg bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 ring-1 ring-neutral-200 transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <a
          href="/"
          className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-400 transition hover:text-neutral-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al catálogo
        </a>
      </div>
    </div>
  );
}
