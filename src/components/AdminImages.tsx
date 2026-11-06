import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ImagePlus,
  Upload,
  RotateCcw,
  CheckCircle2,
  XCircle,
  SkipForward,
  FileWarning,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface FileItem {
  id: string;
  file: File;
  previewUrl: string;
  articleCode: string | null;
  pageNumber: number | null;
  columnNumber: number | null;
  status: 'pending' | 'uploading' | 'uploaded' | 'skipped' | 'error';
  error?: string;
  publicUrl?: string;
}

interface SingleUploadResult {
  result: {
    filename: string;
    articleCode: string | null;
    storagePath: string;
    pageNumber: number | null;
    columnNumber: number | null;
    status: 'uploaded' | 'skipped' | 'error';
    error?: string;
    publicUrl?: string;
  };
}

interface BrandOption {
  id: string;
  name: string;
}

function parseArticleCode(filename: string): {
  articleCode: string | null;
  pageNumber: number | null;
  columnNumber: number | null;
} {
  const base = (filename.split(/[\\/]/).pop() ?? filename).replace(/\.[^.]+$/, '');
  const code = base.match(/^(ART_\d+(?:\.\d+)?)/i);
  const page = base.match(/_P(\d+)/i);
  const column = base.match(/_C(\d+)/i);
  return {
    articleCode: code ? code[1].toUpperCase() : null,
    pageNumber: page ? parseInt(page[1], 10) : null,
    columnNumber: column ? parseInt(column[1], 10) : null,
  };
}

export default function AdminImages() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBrandsLoading(true);
        const { data, error } = await supabase
          .from('brands')
          .select('id, name')
          .order('name.asc');
        if (error) throw error;
        if (!cancelled) {
          setBrands((data as BrandOption[]) ?? []);
        }
      } catch {
        if (!cancelled) setBrands([]);
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createFileItems = useCallback(async (fileList: FileList): Promise<FileItem[]> => {
    const items: FileItem[] = [];
    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.png')) continue;
      if (file.type && file.type !== 'image/png') continue;
      const previewUrl = URL.createObjectURL(file);
      const { articleCode, pageNumber, columnNumber } = parseArticleCode(file.name);
      items.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        previewUrl,
        articleCode,
        pageNumber,
        columnNumber,
        status: 'pending',
      });
    }
    return items;
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newItems = await createFileItems(e.target.files);
    setFiles((prev) => {
      const existingIds = new Set(prev.map((f) => f.id));
      return [...prev, ...newItems.filter((f) => !existingIds.has(f.id))];
    });
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearAll = () => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setShowSummary(false);
  };

  const uploadSingleFile = useCallback(
    async (item: FileItem, brandId: string): Promise<SingleUploadResult> => {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData.session) {
        throw new Error('Tu sesión expiró. Volvé a iniciar sesión para continuar.');
      }

      const accessToken = sessionData.session.access_token;

      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('brand_id', brandId);

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-product-images`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (response.status === 401) {
        throw new Error('Tu sesión no es válida o expiró. Volvé a iniciar sesión.');
      }

      if (!response.ok) {
        let errText = '';
        try {
          const errJson = await response.json();
          errText = errJson.error || JSON.stringify(errJson);
        } catch {
          errText = await response.text().catch(() => 'No se pudo leer la respuesta del servidor');
        }
        throw new Error(`Servidor ${response.status}: ${errText}`);
      }

      const json: SingleUploadResult = await response.json();
      return json;
    },
    []
  );

  const uploadAll = async () => {
    if (!selectedBrandId) {
      setSessionError('Seleccioná una marca antes de subir imágenes.');
      return;
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      setSessionError('Tu sesión expiró. Volvé a iniciar sesión para continuar.');
      return;
    }
    setSessionError(null);

    const toUpload = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (toUpload.length === 0) return;

    setUploading(true);
    setShowSummary(false);
    setProgress({ done: 0, total: toUpload.length });

    let done = 0;
    for (const item of toUpload) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: 'uploading' as const } : f
        )
      );

      try {
        const response = await uploadSingleFile(item, selectedBrandId);
        const r = response.result;
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: r.status, error: r.error, publicUrl: r.publicUrl }
              : f
          )
        );
      } catch (err) {
        let errorMsg = 'Error desconocido';
        if (err instanceof Error) {
          if (err.message === 'Failed to fetch') {
            errorMsg = 'No se pudo conectar con el servidor. Verificá tu conexión a internet y que la función de servidor esté activa.';
          } else {
            errorMsg = err.message;
          }
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: 'error' as const, error: errorMsg } : f
          )
        );
      }

      done += 1;
      setProgress({ done, total: toUpload.length });
    }

    setUploading(false);
    setShowSummary(true);
  };

  const retryFailed = async () => {
    if (!selectedBrandId) {
      setSessionError('Seleccioná una marca antes de subir imágenes.');
      return;
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      setSessionError('Tu sesión expiró. Volvé a iniciar sesión para continuar.');
      return;
    }
    setSessionError(null);

    const failed = files.filter((f) => f.status === 'error');
    if (failed.length === 0) return;

    setUploading(true);
    setShowSummary(false);
    setProgress({ done: 0, total: failed.length });

    let done = 0;
    for (const item of failed) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: 'uploading' as const } : f
        )
      );

      try {
        const response = await uploadSingleFile(item, selectedBrandId);
        const r = response.result;
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: r.status, error: r.error, publicUrl: r.publicUrl }
              : f
          )
        );
      } catch (err) {
        let errorMsg = 'Error desconocido';
        if (err instanceof Error) {
          if (err.message === 'Failed to fetch') {
            errorMsg = 'No se pudo conectar con el servidor. Verificá tu conexión a internet y que la función de servidor esté activa.';
          } else {
            errorMsg = err.message;
          }
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: 'error' as const, error: errorMsg } : f
          )
        );
      }

      done += 1;
      setProgress({ done, total: failed.length });
    }

    setUploading(false);
    setShowSummary(true);
  };

  const stats = useMemo(() => {
    return {
      pending: files.filter((f) => f.status === 'pending').length,
      uploading: files.filter((f) => f.status === 'uploading').length,
      uploaded: files.filter((f) => f.status === 'uploaded').length,
      skipped: files.filter((f) => f.status === 'skipped').length,
      error: files.filter((f) => f.status === 'error').length,
    };
  }, [files]);

  const overallPercent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-bold">Carga de imágenes</span>
          </div>
          <a
            href="/admin"
            className="text-xs font-medium text-neutral-400 transition hover:text-white"
          >
            Volver al panel
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Selector de marca */}
        <div className="mb-6 rounded-xl bg-neutral-900 p-5 ring-1 ring-neutral-800">
          <h2 className="mb-3 text-sm font-semibold text-neutral-200">Marca destino</h2>
          {brandsLoading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando marcas...
            </div>
          ) : brands.length === 0 ? (
            <p className="text-sm text-neutral-500">No hay marcas disponibles.</p>
          ) : (
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              disabled={uploading}
              className="w-full max-w-sm rounded-lg bg-neutral-800 px-4 py-2.5 text-sm text-white ring-1 ring-neutral-700 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              <option value="">Seleccionar marca...</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {sessionError && (
          <div className="mb-6 flex items-start gap-2 rounded-xl bg-red-500/10 p-4 ring-1 ring-red-500/20">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{sessionError}</p>
          </div>
        )}

        {/* Selector de archivos */}
        <div className="mb-6 rounded-xl bg-neutral-900 p-5 ring-1 ring-neutral-800">
          <h2 className="mb-3 text-sm font-semibold text-neutral-200">Seleccionar imágenes</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              Seleccionar carpeta
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Seleccionar archivos
            </button>
            {files.length > 0 && (
              <button
                onClick={clearAll}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-400 transition hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Limpiar todo
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              accept="image/png"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              // @ts-expect-error webkitdirectory is a non-standard attribute for folder selection
              webkitdirectory=""
              directory=""
            />
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Solo se aceptan archivos PNG (máx. 10 MB). Los nombres deben seguir el patrón ART_###_P##.png
            (ej. ART_17_P35.png, ART_205_P06_C1.png).
          </p>
        </div>

        {/* Barra de progreso general */}
        {uploading && (
          <div className="mb-6 rounded-xl bg-neutral-900 p-5 ring-1 ring-neutral-800">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-neutral-200">
                Subiendo... {progress.done} / {progress.total}
              </span>
              <span className="text-emerald-400">{overallPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Resumen */}
        {showSummary && !uploading && (
          <div className="mb-6 rounded-xl bg-neutral-900 p-5 ring-1 ring-neutral-800">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Resumen de la carga</h2>
              {stats.error > 0 && (
                <button
                  onClick={retryFailed}
                  className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-500"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reintentar fallidos ({stats.error})
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-3 text-center ring-1 ring-emerald-500/20">
                <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-400" />
                <div className="text-xl font-bold text-emerald-400">{stats.uploaded}</div>
                <div className="text-xs text-neutral-400">Subidas</div>
              </div>
              <div className="rounded-lg bg-sky-500/10 p-3 text-center ring-1 ring-sky-500/20">
                <SkipForward className="mx-auto mb-1 h-5 w-5 text-sky-400" />
                <div className="text-xl font-bold text-sky-400">{stats.skipped}</div>
                <div className="text-xs text-neutral-400">Omitidas</div>
              </div>
              <div className="rounded-lg bg-red-500/10 p-3 text-center ring-1 ring-red-500/20">
                <XCircle className="mx-auto mb-1 h-5 w-5 text-red-400" />
                <div className="text-xl font-bold text-red-400">{stats.error}</div>
                <div className="text-xs text-neutral-400">Errores</div>
              </div>
            </div>
          </div>
        )}

        {/* Botón de carga */}
        {files.length > 0 && !uploading && (
          <div className="mb-6 flex gap-3">
            <button
              onClick={uploadAll}
              disabled={stats.pending === 0 && stats.error === 0 || !selectedBrandId}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Subir {stats.pending + stats.error} {stats.pending + stats.error === 1 ? 'archivo' : 'archivos'}
            </button>
            {stats.error > 0 && (
              <button
                onClick={retryFailed}
                disabled={!selectedBrandId}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reintentar {stats.error} fallidos
              </button>
            )}
          </div>
        )}

        {/* Lista de archivos */}
        {files.length > 0 && (
          <div className="rounded-xl bg-neutral-900 ring-1 ring-neutral-800">
            <div className="border-b border-neutral-800 px-5 py-3">
              <h2 className="text-sm font-semibold text-neutral-200">
                {files.length} {files.length === 1 ? 'archivo' : 'archivos'}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {files.map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-neutral-700"
                >
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-full w-full object-cover object-center"
                    />
                    <StatusBadge status={item.status} />
                    {!uploading && item.status !== 'uploading' && (
                      <button
                        onClick={() => removeFile(item.id)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                        title="Quitar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {item.status === 'uploading' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium text-neutral-200" title={item.file.name}>
                      {item.file.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-neutral-500">
                      {item.articleCode ?? 'Pendiente de asociación'}
                      {item.pageNumber !== null && ` · Pág ${item.pageNumber}`}
                      {item.columnNumber !== null && ` · Col ${item.columnNumber}`}
                    </p>
                    {item.error && (
                      <p className="mt-1 flex items-start gap-1 text-[10px] text-red-400">
                        <FileWarning className="mt-0.5 h-3 w-3 flex-shrink-0" />
                        <span className="line-clamp-2">{item.error}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {files.length === 0 && !uploading && (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-800 py-20 text-center">
            <ImagePlus className="mb-3 h-10 w-10 text-neutral-700" />
            <p className="text-sm text-neutral-500">
              No hay archivos seleccionados. Elegí una marca, luego una carpeta o archivos PNG para empezar.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: FileItem['status'] }) {
  if (status === 'pending') return null;
  const config = {
    uploading: { icon: Loader2, className: 'bg-black/50 text-emerald-400 animate-spin' },
    uploaded: { icon: CheckCircle2, className: 'bg-emerald-600 text-white' },
    skipped: { icon: SkipForward, className: 'bg-sky-600 text-white' },
    error: { icon: XCircle, className: 'bg-red-600 text-white' },
  };
  const { icon: Icon, className } = config[status];
  return (
    <div className={`absolute left-1 top-1 rounded-full p-1 ${className}`}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
