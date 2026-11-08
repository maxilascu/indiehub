import { useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import type { BrandOption } from '@/lib/adminProductsApi';
import { getAdminErrorMessage } from '@/lib/adminProductsApi';
import {
  MAX_IMPORT_FILE_BYTES,
  SOURCE_TYPE_OPTIONS,
  confirmImportUpload,
  createImportJob,
  getFileExtension,
  uploadImportSource,
  type CreatedImportJob,
  type ImportSourceType,
} from '@/lib/importsApi';

interface Props {
  brands: BrandOption[];
  onClose: () => void;
  onCreated: (jobId: string) => void;
}

interface PendingUpload {
  job: CreatedImportJob;
  file: File;
  uploaded: boolean;
}

interface FormValues {
  brandId: string;
  sourceType: ImportSourceType;
  sourceName: string;
  sourceUrl: string;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50 disabled:text-neutral-500';

function validateForm(values: FormValues, file: File | null): string | null {
  if (!values.brandId) return 'Elegí una marca.';
  if (!values.sourceName.trim()) return 'Ingresá un nombre para la fuente.';
  const option = SOURCE_TYPE_OPTIONS.find((item) => item.value === values.sourceType);
  if (!option) return 'Elegí un tipo de fuente válido.';
  if (option.value === 'website' && !/^https?:\/\/\S+$/i.test(values.sourceUrl.trim())) {
    return 'Ingresá una URL válida que empiece con http o https.';
  }
  if (option.extensions.length > 0) {
    if (!file) return 'Seleccioná un archivo.';
    if (!option.extensions.includes(getFileExtension(file.name))) {
      return `El archivo debe ser de tipo ${option.extensions.join(', ').toUpperCase()}.`;
    }
    if (file.size === 0) return 'El archivo está vacío.';
    if (file.size > MAX_IMPORT_FILE_BYTES) return 'El archivo supera el límite de 50 MB.';
  }
  return null;
}

export default function AdminImportForm({ brands, onClose, onCreated }: Props) {
  const [values, setValues] = useState<FormValues>({
    brandId: '',
    sourceType: 'pdf',
    sourceName: '',
    sourceUrl: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);

  const selectedOption = SOURCE_TYPE_OPTIONS.find((option) => option.value === values.sourceType);
  const needsFile = (selectedOption?.extensions.length ?? 0) > 0;
  const locked = submitting || pending !== null;

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const uploadAndConfirm = async (upload: PendingUpload) => {
    if (!upload.uploaded) {
      await uploadImportSource(upload.job.storagePath, upload.file);
      upload.uploaded = true;
    }
    await confirmImportUpload(upload.job.jobId);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (pending) {
      setSubmitting(true);
      setError(null);
      try {
        await uploadAndConfirm(pending);
        onCreated(pending.job.jobId);
      } catch (cause) {
        setError(`El archivo todavía no se pudo cargar. ${getAdminErrorMessage(cause)}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const validationError = validateForm(values, needsFile ? file : null);
    if (validationError) {
      setError(validationError);
      return;
    }

    const sourceFile = needsFile ? file : null;
    setSubmitting(true);
    setError(null);
    let job: CreatedImportJob;
    try {
      job = await createImportJob({
        brandId: values.brandId,
        sourceType: values.sourceType,
        sourceName: values.sourceName.trim(),
        sourceUrl: values.sourceType === 'website' ? values.sourceUrl.trim() : '',
        file: sourceFile,
      });
    } catch (cause) {
      setError(getAdminErrorMessage(cause));
      setSubmitting(false);
      return;
    }

    if (!sourceFile || !job.storagePath) {
      setSubmitting(false);
      onCreated(job.jobId);
      return;
    }

    const upload: PendingUpload = { job, file: sourceFile, uploaded: false };
    try {
      await uploadAndConfirm(upload);
      onCreated(job.jobId);
    } catch (cause) {
      setPending(upload);
      setError(
        `La importación se creó, pero el archivo no se cargó. Podés reintentar la carga. ${getAdminErrorMessage(cause)}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4 py-8" role="dialog" aria-modal="true">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Nueva importación</h2>
            <p className="mt-1 text-xs text-neutral-500">Subí la fuente de productos de una marca.</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div>
            <label htmlFor="import-brand" className="mb-1.5 block text-xs font-semibold text-neutral-700">Marca</label>
            <select
              id="import-brand"
              value={values.brandId}
              onChange={(event) => update('brandId', event.target.value)}
              disabled={locked}
              className={INPUT_CLASS}
            >
              <option value="">Elegí una marca</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="import-source-type" className="mb-1.5 block text-xs font-semibold text-neutral-700">Tipo de fuente</label>
            <select
              id="import-source-type"
              value={values.sourceType}
              onChange={(event) => {
                update('sourceType', event.target.value as ImportSourceType);
                setFile(null);
              }}
              disabled={locked}
              className={INPUT_CLASS}
            >
              {SOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="import-source-name" className="mb-1.5 block text-xs font-semibold text-neutral-700">Nombre de la fuente</label>
            <input
              id="import-source-name"
              type="text"
              maxLength={200}
              value={values.sourceName}
              onChange={(event) => update('sourceName', event.target.value)}
              disabled={locked}
              placeholder="Ej.: Catálogo otoño 2026"
              className={INPUT_CLASS}
            />
          </div>

          {values.sourceType === 'website' && (
            <div>
              <label htmlFor="import-source-url" className="mb-1.5 block text-xs font-semibold text-neutral-700">URL</label>
              <input
                id="import-source-url"
                type="url"
                value={values.sourceUrl}
                onChange={(event) => update('sourceUrl', event.target.value)}
                disabled={locked}
                placeholder="https://"
                className={INPUT_CLASS}
              />
            </div>
          )}

          {needsFile && (
            <div>
              <label htmlFor="import-file" className="mb-1.5 block text-xs font-semibold text-neutral-700">Archivo</label>
              <input
                id="import-file"
                type="file"
                accept={selectedOption?.extensions.map((ext) => `.${ext}`).join(',')}
                onChange={handleFileChange}
                disabled={locked}
                className="w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
              />
              <p className="mt-1.5 text-xs text-neutral-500">Máximo 50 MB. Los archivos no se sobrescriben.</p>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pending ? 'Reintentar carga' : 'Crear importación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
