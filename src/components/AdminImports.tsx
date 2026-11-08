import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FileUp, Loader2, Plus, RefreshCw } from 'lucide-react';
import { fetchBrandOptions, getAdminErrorMessage, type BrandOption } from '@/lib/adminProductsApi';
import {
  fetchImportJobs,
  formatImportDate,
  getSourceLabel,
  getStatusLabel,
  type ImportJobRow,
} from '@/lib/importsApi';
import AdminImportForm from '@/components/AdminImportForm';
import AdminImportDetail from '@/components/AdminImportDetail';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  queued: 'bg-sky-50 text-sky-700 ring-sky-200',
  claimed: 'bg-sky-50 text-sky-700 ring-sky-200',
  processing: 'bg-sky-50 text-sky-700 ring-sky-200',
  needs_review: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-neutral-100 text-neutral-600 ring-neutral-300',
};

export default function AdminImports() {
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandsError, setBrandsError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJobs(await fetchImportJobs());
    } catch (cause) {
      setError(getAdminErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBrands = useCallback(async () => {
    setBrandsError(null);
    try {
      setBrands(await fetchBrandOptions());
    } catch (cause) {
      setBrandsError(getAdminErrorMessage(cause));
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    void loadBrands();
  }, [loadJobs, loadBrands]);

  if (selectedJobId) {
    return <AdminImportDetail jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />;
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/admin" className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 transition hover:text-neutral-900">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al panel
          </a>
          <span className="text-sm font-bold text-neutral-900">
            INDIE<span className="text-emerald-500">HUB</span> Admin
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Importaciones</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Fuentes de productos recibidas, pendientes de procesamiento local.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadJobs()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200 transition hover:text-neutral-900 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              onClick={() => setFormOpen(true)}
              disabled={brands.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva importación
            </button>
          </div>
        </div>

        {brandsError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
            {brandsError}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200">
          {loading && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
                <FileUp className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-neutral-900">Todavía no hay importaciones</p>
              <p className="text-xs text-neutral-500">Creá una nueva para cargar la primera fuente de productos.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Fuente</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Progreso</th>
                    <th className="px-4 py-3">Etapa</th>
                    <th className="px-4 py-3">Creada</th>
                    <th className="px-4 py-3">Actualizada</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {jobs.map((job) => (
                    <tr key={job.id} className="transition hover:bg-neutral-50">
                      <td className="px-4 py-3 font-semibold text-neutral-900">{job.brands?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-800">{job.source_name}</div>
                        <div className="text-xs text-neutral-500">{getSourceLabel(job.source_type)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_BADGE[job.status] ?? 'bg-neutral-100 text-neutral-600 ring-neutral-300'}`}>
                          {getStatusLabel(job.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200">
                            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${job.progress}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-neutral-600">{job.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{job.stage || '—'}</td>
                      <td className="px-4 py-3 text-xs text-neutral-500">{formatImportDate(job.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-neutral-500">{formatImportDate(job.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedJobId(job.id)}
                          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {formOpen && (
        <AdminImportForm
          brands={brands}
          onClose={() => setFormOpen(false)}
          onCreated={(jobId) => {
            setFormOpen(false);
            void loadJobs();
            setSelectedJobId(jobId);
          }}
        />
      )}
    </div>
  );
}
