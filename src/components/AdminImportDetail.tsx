import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, Loader2, RefreshCw } from 'lucide-react';
import { getAdminErrorMessage } from '@/lib/adminProductsApi';
import {
  IMPORT_BUCKET,
  fetchImportCounts,
  fetchImportJob,
  formatImportDate,
  getSourceLabel,
  getStatusLabel,
  type ImportJobRow,
} from '@/lib/importsApi';
import { supabase } from '@/lib/supabase';

interface Props {
  jobId: string;
  onBack: () => void;
}

interface Counts {
  items: number;
  assets: number;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

export default function AdminImportDetail({ jobId, onBack }: Props) {
  const [job, setJob] = useState<ImportJobRow | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobRow, jobCounts] = await Promise.all([fetchImportJob(jobId), fetchImportCounts(jobId)]);
      if (!jobRow) {
        setError('No encontramos esta importación. Puede haber sido eliminada.');
        setJob(null);
        return;
      }
      setJob(jobRow);
      setCounts(jobCounts);
    } catch (cause) {
      setError(getAdminErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async () => {
    if (!job?.storage_path) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const { data, error: signError } = await supabase.storage
        .from(IMPORT_BUCKET)
        .createSignedUrl(job.storage_path, 60);
      if (signError) throw signError;
      if (!data?.signedUrl) throw new Error('Respuesta inesperada del servidor');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setDownloadError(getAdminErrorMessage(cause));
    } finally {
      setDownloading(false);
    }
  };

  const fileName = job?.storage_path ? job.storage_path.split('/').pop() ?? '' : '';

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 transition hover:text-neutral-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a importaciones
          </button>
          <span className="text-sm font-bold text-neutral-900">
            INDIE<span className="text-emerald-500">HUB</span> Admin
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading && !job ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-white p-6 ring-1 ring-red-100">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-4 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200"
            >
              Reintentar
            </button>
          </div>
        ) : job && counts ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{job.source_name}</h1>
                <p className="mt-1 text-sm text-neutral-500">
                  {job.brands?.name ?? 'Sin marca'} · {getSourceLabel(job.source_type)}
                </p>
              </div>
              <button
                onClick={() => void load()}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200 transition hover:text-neutral-900 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>

            <section className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="mb-4 text-sm font-bold text-neutral-900">Estado</h2>
              <div className="mb-5 flex items-center gap-3">
                <span className="inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
                  {getStatusLabel(job.status)}
                </span>
                <span className="text-xs text-neutral-500">{job.stage || 'Sin etapa'}</span>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs text-neutral-600">
                <span>Progreso</span>
                <span className="tabular-nums font-semibold">{job.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${job.progress}%` }} />
              </div>
              {job.error_message && (
                <p className="mt-5 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
                  {job.error_message}
                </p>
              )}
            </section>

            <section className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="mb-4 text-sm font-bold text-neutral-900">Datos</h2>
              <dl className="grid gap-5 sm:grid-cols-2">
                <DetailField label="Marca">{job.brands?.name ?? '—'}</DetailField>
                <DetailField label="Tipo de fuente">{getSourceLabel(job.source_type)}</DetailField>
                <DetailField label="Versión del procesador">{job.processor_version ?? 'Sin procesar'}</DetailField>
                <DetailField label="Intentos">{job.attempt_count}</DetailField>
                <DetailField label="Creada">{formatImportDate(job.created_at)}</DetailField>
                <DetailField label="Iniciada">{formatImportDate(job.started_at)}</DetailField>
                <DetailField label="Completada">{formatImportDate(job.completed_at)}</DetailField>
                <DetailField label="Actualizada">{formatImportDate(job.updated_at)}</DetailField>
                <DetailField label="Items detectados">{counts.items}</DetailField>
                <DetailField label="Archivos asociados">{counts.assets}</DetailField>
              </dl>
              {job.source_url && (
                <div className="mt-5">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">URL de origen</dt>
                  <dd className="mt-1 break-all text-sm text-neutral-900">{job.source_url}</dd>
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="mb-4 text-sm font-bold text-neutral-900">Archivo original</h2>
              {fileName ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="break-all text-sm text-neutral-800">{fileName}</p>
                  <button
                    onClick={() => void handleDownload()}
                    disabled={downloading}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
                  >
                    {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Abrir archivo
                  </button>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Esta importación no tiene archivo adjunto.</p>
              )}
              {downloadError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
                  {downloadError}
                </p>
              )}
            </section>

            <section className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="mb-4 text-sm font-bold text-neutral-900">Metadatos</h2>
              <pre className="overflow-x-auto rounded-lg bg-neutral-50 p-4 text-xs text-neutral-700 ring-1 ring-neutral-200">
                {JSON.stringify(job.metadata ?? {}, null, 2)}
              </pre>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
