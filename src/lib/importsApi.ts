import { supabase } from '@/lib/supabase';

export const IMPORT_BUCKET = 'indiehub-imports';
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

export type ImportSourceType = 'pdf' | 'xlsx' | 'xls' | 'csv' | 'image' | 'zip' | 'website' | 'api';

export interface SourceTypeOption {
  value: ImportSourceType;
  label: string;
  extensions: string[];
}

export const SOURCE_TYPE_OPTIONS: SourceTypeOption[] = [
  { value: 'pdf', label: 'PDF', extensions: ['pdf'] },
  { value: 'xlsx', label: 'Excel (XLSX)', extensions: ['xlsx'] },
  { value: 'xls', label: 'Excel (XLS)', extensions: ['xls'] },
  { value: 'csv', label: 'CSV', extensions: ['csv'] },
  { value: 'image', label: 'Imagen (JPG, PNG, WEBP)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
  { value: 'zip', label: 'ZIP', extensions: ['zip'] },
  { value: 'website', label: 'Sitio web', extensions: [] },
  { value: 'api', label: 'API', extensions: [] },
];

const SOURCE_LABELS: Record<string, string> = {
  ...Object.fromEntries(SOURCE_TYPE_OPTIONS.map((option) => [option.value, option.label])),
  excel: 'Excel',
  sheets: 'Google Sheets',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Esperando archivo',
  queued: 'En cola',
  claimed: 'Reclamada',
  processing: 'Procesando',
  needs_review: 'Revisión pendiente',
  approved: 'Aprobada',
  applying: 'Aplicando',
  completed: 'Completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
  parsing: 'Procesando',
  extracted: 'Extraída',
  reviewing: 'En revisión',
  published: 'Publicada',
};

export function getSourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? sourceType;
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export function formatImportDate(value: string | null): string {
  return value ? DATE_FORMAT.format(new Date(value)) : '—';
}

export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function getMimeType(extension: string): string {
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export interface ImportJobRow {
  id: string;
  brand_id: string;
  source_type: string;
  source_name: string;
  source_url: string;
  storage_path: string;
  status: string;
  progress: number;
  stage: string;
  processor_version: string | null;
  attempt_count: number;
  error_message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  brands: { name: string } | null;
}

const JOB_COLUMNS =
  'id,brand_id,source_type,source_name,source_url,storage_path,status,progress,stage,processor_version,attempt_count,error_message,metadata,created_at,updated_at,started_at,completed_at,brands(name)';

export async function fetchImportJobs(): Promise<ImportJobRow[]> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select(JOB_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Respuesta inesperada del servidor');
  return data as unknown as ImportJobRow[];
}

export async function fetchImportJob(jobId: string): Promise<ImportJobRow | null> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ImportJobRow | null) ?? null;
}

export async function fetchImportCounts(jobId: string): Promise<{ items: number; assets: number }> {
  const [items, assets] = await Promise.all([
    supabase.from('import_items').select('id', { count: 'exact', head: true }).eq('import_job_id', jobId),
    supabase.from('import_assets').select('id', { count: 'exact', head: true }).eq('import_job_id', jobId),
  ]);
  if (items.error) throw items.error;
  if (assets.error) throw assets.error;
  return { items: items.count ?? 0, assets: assets.count ?? 0 };
}

export interface CreatedImportJob {
  jobId: string;
  storagePath: string;
  status: string;
}

interface CreateImportInput {
  brandId: string;
  sourceType: ImportSourceType;
  sourceName: string;
  sourceUrl: string;
  file: File | null;
}

function isCreatedJobPayload(value: unknown): value is { job_id: string; storage_path: string; status: string } {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.job_id === 'string' && typeof payload.storage_path === 'string' && typeof payload.status === 'string';
}

export async function createImportJob(input: CreateImportInput): Promise<CreatedImportJob> {
  const { data, error } = await supabase.rpc('admin_create_import_job', {
    p_brand_id: input.brandId,
    p_source_type: input.sourceType,
    p_source_name: input.sourceName,
    p_source_url: input.sourceUrl,
    p_metadata: {},
    p_file_name: input.file ? input.file.name : null,
    p_file_size: input.file ? input.file.size : null,
    p_mime_type: input.file ? getMimeType(getFileExtension(input.file.name)) : '',
  });
  if (error) throw error;
  if (!isCreatedJobPayload(data)) throw new Error('Respuesta inesperada del servidor');
  return { jobId: data.job_id, storagePath: data.storage_path, status: data.status };
}

export async function uploadImportSource(storagePath: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(IMPORT_BUCKET).upload(storagePath, file, {
    upsert: false,
    contentType: getMimeType(getFileExtension(file.name)),
  });
  if (error) throw error;
}

export async function confirmImportUpload(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_confirm_import_upload', { p_job_id: jobId });
  if (error) throw error;
}

export interface ProcessImportResult {
  ok: boolean;
  jobId: string;
  outcome: 'completed' | 'needs_review' | 'failed';
  items: number;
  assets: number;
  needsOcr: boolean;
  warnings: string[];
  error?: string;
}

function isProcessResult(value: unknown): value is ProcessImportResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.ok === 'boolean' && typeof v.job_id === 'string' && typeof v.outcome === 'string';
}

export async function triggerImportProcessing(jobId: string): Promise<ProcessImportResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('No hay sesión activa');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-import`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ job_id: jobId }),
  });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const body = await response.json();
  if (!isProcessResult(body)) throw new Error('Respuesta inesperada del procesador');
  return {
    ok: body.ok,
    jobId: body.jobId,
    outcome: body.outcome as ProcessImportResult['outcome'],
    items: body.items,
    assets: body.assets,
    needsOcr: body.needsOcr,
    warnings: body.warnings,
    error: body.error,
  };
}
