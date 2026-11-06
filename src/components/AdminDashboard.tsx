import { useState } from 'react';
import { ImagePlus, LogOut, Loader2, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  email: string;
}

export default function AdminDashboard({ email }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError('No se pudo cerrar sesión. Intentá nuevamente.');
        setSigningOut(false);
        return;
      }
      window.location.assign('/login');
    } catch {
      setError('Ocurrió un error inesperado al cerrar sesión.');
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-900">
              INDIE<span className="text-emerald-500">HUB</span> Admin
            </span>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-50"
          >
            {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Panel de administración</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Sesión iniciada como <span className="font-semibold text-neutral-700">{email}</span>
          </p>
        </div>

        {error && (
          <p className="mb-6 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <a
            href="/admin/imagenes"
            className="group flex flex-col gap-3 rounded-2xl bg-white p-6 ring-1 ring-neutral-200 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-neutral-900/5 hover:ring-neutral-300"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
              <ImagePlus className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Gestión de imágenes</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Cargar y administrar fotografías de productos.
              </p>
            </div>
          </a>
          <a
            href="/admin/productos"
            className="group flex flex-col gap-3 rounded-2xl bg-white p-6 ring-1 ring-neutral-200 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-neutral-900/5 hover:ring-neutral-300"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
              <Package className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Gestión de productos</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Crear, editar, publicar y archivar productos del catálogo.
              </p>
            </div>
          </a>
        </div>
      </main>
    </div>
  );
}
