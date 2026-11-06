import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  History,
  Image as ImageIcon,
  Info,
  Loader2,
  Package,
  Save,
  Tag,
  X,
} from 'lucide-react';
import {
  EMPTY_PRODUCT_FORM,
  FIELD_LABELS,
  STATUS_LABELS,
  toFormValues,
  validateProductForm,
  type AdminProductRecord,
  type ProductFormErrors,
  type ProductFormValues,
  type ProductStatus,
} from '@/lib/adminProductForm';
import {
  fetchAdminProduct,
  fetchImagesForBrandCodes,
  fetchPriceHistory,
  getAdminErrorMessage,
  groupImagesByBrandCode,
  imageUrl,
  normalizeCodes,
  saveAdminProduct,
  setAdminImageOrder,
  setAdminProductStatus,
  type BrandOption,
  type PriceHistoryRecord,
  type ProductImageRecord,
} from '@/lib/adminProductsApi';

interface Props {
  productId: string | null;
  brands: BrandOption[];
  onCreated: (id: string) => void;
}

const STATUS_BADGE: Record<ProductStatus, string> = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archived: 'bg-neutral-100 text-neutral-600 ring-neutral-300',
};

const GENDER_OPTIONS = ['Hombre', 'Mujer', 'Unisex'];

const DECIMAL_HINT = 'Hasta 2 decimales, por ejemplo 1250.50';

export default function AdminProductEditor({ productId, brands, onCreated }: Props) {
  const [record, setRecord] = useState<AdminProductRecord | null>(null);
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [loading, setLoading] = useState(productId !== null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [images, setImages] = useState<ProductImageRecord[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [orderSavingCode, setOrderSavingCode] = useState<string | null>(null);

  const [history, setHistory] = useState<PriceHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [confirm, setConfirm] = useState<{ status: ProductStatus; label: string; verb: string } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setRecord(null);
      setValues(EMPTY_PRODUCT_FORM);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminProduct(productId);
        if (cancelled || !data) return;
        setRecord(data);
        setValues(toFormValues(data));
      } catch (cause) {
        if (!cancelled) setError(getAdminErrorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const imageCodes = useMemo(
    () =>
      normalizeCodes(
        values.image_codes
          .split(/[,;\n]/)
          .map((part) => part.trim())
          .filter(Boolean)
      ),
    [values.image_codes]
  );

  useEffect(() => {
    const brandId = values.brand_id;
    if (!brandId || imageCodes.length === 0) {
      setImages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setImagesLoading(true);
      setImagesError(null);
      try {
        const rows = await fetchImagesForBrandCodes([brandId], imageCodes);
        if (!cancelled) setImages(rows);
      } catch (cause) {
        if (!cancelled) setImagesError(getAdminErrorMessage(cause));
      } finally {
        if (!cancelled) setImagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [values.brand_id, imageCodes]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const rows = await fetchPriceHistory(productId);
        if (!cancelled) setHistory(rows);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, record?.updated_at]);

  const groups = useMemo(() => {
    if (!values.brand_id) return [];
    const map = groupImagesByBrandCode(images);
    return imageCodes.map((code) => ({
      code,
      items: map.get(`${values.brand_id}|${code}`) ?? [],
    }));
  }, [images, values.brand_id, imageCodes]);

  const update = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSavedNotice(false);
  };

  const handleSave = async () => {
    const validation = validateProductForm(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveAdminProduct(productId, values);
      setSavedNotice(true);
      if (!productId) {
        onCreated(id);
      } else {
        const fresh = await fetchAdminProduct(id);
        if (fresh) {
          setRecord(fresh);
          setValues(toFormValues(fresh));
        }
      }
    } catch (cause) {
      setSaveError(getAdminErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const moveImage = async (code: string, index: number, dir: -1 | 1) => {
    const group = groups.find((g) => g.code === code);
    if (!group) return;
    const next = [...group.items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    const brandId = values.brand_id;
    setImages((current) => {
      const updated = current.filter((img) => !(img.brand_id === brandId && img.article_code === code));
      return [...updated, ...next.map((img, i) => ({ ...img, display_order: i }))];
    });

    setOrderSavingCode(code);
    try {
      await setAdminImageOrder(brandId, code, next.map((img) => img.id));
    } catch (cause) {
      setImagesError(getAdminErrorMessage(cause));
    } finally {
      setOrderSavingCode(null);
    }
  };

  const requestStatusChange = (status: ProductStatus) => {
    const verb =
      status === 'published' ? 'publicar' : status === 'archived' ? 'archivar' : 'pasar a borrador';
    setConfirm({ status, label: STATUS_LABELS[status], verb });
  };

  const confirmStatusChange = async () => {
    if (!confirm || !record) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      await setAdminProductStatus(record.id, confirm.status);
      const fresh = await fetchAdminProduct(record.id);
      if (fresh) {
        setRecord(fresh);
        setValues(toFormValues(fresh));
      }
      setConfirm(null);
    } catch (cause) {
      setStatusError(getAdminErrorMessage(cause));
    } finally {
      setStatusBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm font-semibold text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {record && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 ring-1 ring-neutral-200">
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_BADGE[record.status]}`}>
              {STATUS_LABELS[record.status]}
            </span>
            <span className="text-xs text-neutral-500">#{record.catalog_seq}</span>
          </div>
          <div className="flex items-center gap-2">
            {record.status !== 'published' && (
              <button
                onClick={() => requestStatusChange('published')}
                disabled={statusBusy}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Publicar
              </button>
            )}
            {record.status === 'published' && (
              <button
                onClick={() => requestStatusChange('draft')}
                disabled={statusBusy}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
              >
                Despublicar
              </button>
            )}
            {record.status !== 'archived' && (
              <button
                onClick={() => requestStatusChange('archived')}
                disabled={statusBusy}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-200 disabled:opacity-50"
              >
                Archivar
              </button>
            )}
          </div>
        </div>
      )}

      {statusError && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
          {statusError}
        </p>
      )}

      <Section icon={<Tag className="h-4 w-4" />} title="Datos básicos">
        <Field label="Marca" error={errors.brand_id} required>
          <select
            value={values.brand_id}
            onChange={(e) => update('brand_id', e.target.value)}
            className={inputClass(errors.brand_id)}
          >
            <option value="">Seleccionar marca…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nombre" error={errors.name} required>
          <input
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            maxLength={200}
            className={inputClass(errors.name)}
          />
        </Field>
        <Field label="Código externo" error={errors.external_id} hint="Identificador de la marca, hasta 80 caracteres">
          <input
            value={values.external_id}
            onChange={(e) => update('external_id', e.target.value)}
            maxLength={80}
            className={inputClass(errors.external_id)}
          />
        </Field>
        <Field label="Enlace" error={errors.link} hint="URL del producto, debe empezar con http:// o https://">
          <input
            value={values.link}
            onChange={(e) => update('link', e.target.value)}
            placeholder="https://…"
            className={inputClass(errors.link)}
          />
        </Field>
        <Field label="Descripción" error={errors.description} full>
          <textarea
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            rows={3}
            maxLength={5000}
            className={inputClass(errors.description)}
          />
        </Field>
        <Field label="Categoría">
          <input
            value={values.category}
            onChange={(e) => update('category', e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="Género">
          <select value={values.gender} onChange={(e) => update('gender', e.target.value)} className={inputClass()}>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estilo">
          <input value={values.style} onChange={(e) => update('style', e.target.value)} className={inputClass()} />
        </Field>
        <Field label="Ubicación">
          <input
            value={values.location}
            onChange={(e) => update('location', e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="Promoción" hint="Texto de oferta o banner">
          <input
            value={values.promotion}
            onChange={(e) => update('promotion', e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="Talles" hint="Separados por coma, hasta 20 caracteres cada uno">
          <input
            value={values.sizes}
            onChange={(e) => update('sizes', e.target.value)}
            placeholder="S, M, L, XL"
            className={inputClass()}
          />
        </Field>
      </Section>

      <Section icon={<Package className="h-4 w-4" />} title="Precios y codificación">
        <Field label="Precio principal" error={errors.price} required hint={DECIMAL_HINT}>
          <input
            value={values.price}
            onChange={(e) => update('price', e.target.value)}
            inputMode="decimal"
            className={inputClass(errors.price)}
          />
        </Field>
        <Field label="Moneda" error={errors.currency} hint="3 letras (ARS, USD…)">
          <input
            value={values.currency}
            onChange={(e) => update('currency', e.target.value)}
            maxLength={3}
            className={inputClass(errors.currency)}
          />
        </Field>
        <Field label="Etiqueta de precio">
          <input
            value={values.price_label}
            onChange={(e) => update('price_label', e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="Precio por docena" error={errors.price_dozen} hint={DECIMAL_HINT}>
          <input
            value={values.price_dozen}
            onChange={(e) => update('price_dozen', e.target.value)}
            inputMode="decimal"
            className={inputClass(errors.price_dozen)}
          />
        </Field>
        <Field label="Precio por pack" error={errors.price_pack} hint={DECIMAL_HINT}>
          <input
            value={values.price_pack}
            onChange={(e) => update('price_pack', e.target.value)}
            inputMode="decimal"
            className={inputClass(errors.price_pack)}
          />
        </Field>
        <Field label="Unidades por pack" error={errors.units_pack} hint="Entero mayor a 0">
          <input
            value={values.units_pack}
            onChange={(e) => update('units_pack', e.target.value)}
            inputMode="numeric"
            className={inputClass(errors.units_pack)}
          />
        </Field>
        <Field label="Precio unitario" error={errors.price_single} hint={DECIMAL_HINT}>
          <input
            value={values.price_single}
            onChange={(e) => update('price_single', e.target.value)}
            inputMode="decimal"
            className={inputClass(errors.price_single)}
          />
        </Field>
        <Field label="Precio unitario (texto)">
          <input
            value={values.unit_price_single}
            onChange={(e) => update('unit_price_single', e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="Precio anterior" error={errors.previous_price} hint={DECIMAL_HINT}>
          <input
            value={values.previous_price}
            onChange={(e) => update('previous_price', e.target.value)}
            inputMode="decimal"
            className={inputClass(errors.previous_price)}
          />
        </Field>
        <Field label="Código de docena">
          <input
            value={values.codigo_docena}
            onChange={(e) => update('codigo_docena', e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="Código de pack">
          <input
            value={values.codigo_pack}
            onChange={(e) => update('codigo_pack', e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="Envío gratis">
          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={values.free_shipping}
              onChange={(e) => update('free_shipping', e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500/20"
            />
            <span className="text-sm text-neutral-700">Marcar como envío sin cargo</span>
          </label>
        </Field>
      </Section>

      <Section icon={<ImageIcon className="h-4 w-4" />} title="Imágenes asociadas">
        <Field
          label="Códigos de imágenes"
          error={errors.image_codes}
          hint="Códigos como ART_17 o 17, separados por coma. Las imágenes se asocian automáticamente según el código."
          full
        >
          <input
            value={values.image_codes}
            onChange={(e) => update('image_codes', e.target.value)}
            placeholder="ART_1, ART_2"
            className={inputClass(errors.image_codes)}
          />
        </Field>

        {imagesError && (
          <p className="col-span-full rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-100">
            {imagesError}
          </p>
        )}

        {imagesLoading ? (
          <div className="col-span-full flex items-center gap-2 py-4 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            Cargando imágenes…
          </div>
        ) : (
          <div className="col-span-full space-y-4">
            {groups.length === 0 && (
              <p className="text-xs text-neutral-500">
                Ingresá códigos de imágenes y guardá para ver las fotos asociadas.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.code} className="rounded-xl border border-neutral-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-700">{group.code}</span>
                  {orderSavingCode === group.code && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  )}
                </div>
                {group.items.length === 0 ? (
                  <p className="text-xs text-neutral-400">No hay imágenes cargadas para este código.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {group.items.map((img, i) => (
                      <div key={img.id} className="relative overflow-hidden rounded-lg ring-1 ring-neutral-200">
                        <img src={imageUrl(img)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        <div className="absolute bottom-1 right-1 flex gap-1">
                          <button
                            onClick={() => moveImage(group.code, i, -1)}
                            disabled={i === 0 || orderSavingCode === group.code}
                            className="rounded bg-white/90 p-1 text-neutral-700 shadow-sm transition hover:bg-white disabled:opacity-30"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => moveImage(group.code, i, 1)}
                            disabled={i === group.items.length - 1 || orderSavingCode === group.code}
                            className="rounded bg-white/90 p-1 text-neutral-700 shadow-sm transition hover:bg-white disabled:opacity-30"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {record && (
        <Section icon={<History className="h-4 w-4" />} title="Historial de precios">
          {historyLoading ? (
            <div className="col-span-full flex items-center gap-2 py-4 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              Cargando historial…
            </div>
          ) : history.length === 0 ? (
            <p className="col-span-full text-xs text-neutral-500">Sin cambios de precios registrados.</p>
          ) : (
            <div className="col-span-full overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-100 text-sm">
                <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Campo</th>
                    <th className="px-3 py-2">Valor anterior</th>
                    <th className="px-3 py-2">Valor nuevo</th>
                    <th className="px-3 py-2">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium text-neutral-700">
                        {FIELD_LABELS[row.price_field] ?? row.price_field}
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{row.old_value ?? '—'}</td>
                      <td className="px-3 py-2 text-neutral-900">{row.new_value ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">
                        {new Date(row.changed_at).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 ring-1 ring-neutral-200">
        <div className="flex items-center gap-3">
          {saveError && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-700">
              <AlertCircle className="h-4 w-4" />
              {saveError}
            </p>
          )}
          {savedNotice && !saveError && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Guardado
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {productId ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-neutral-900">Confirmar acción</h3>
              </div>
              <button onClick={() => setConfirm(null)} className="text-neutral-400 transition hover:text-neutral-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-5 text-sm text-neutral-600">
              ¿Querés {confirm.verb} este producto? El estado pasará a{' '}
              <span className="font-semibold">{confirm.label}</span>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={statusBusy}
                className="rounded-lg bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={statusBusy}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {statusBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function inputClass(error?: string): string {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 ${
    error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
      : 'border-neutral-200 focus:border-emerald-500 focus:ring-emerald-500/20'
  }`;
}

interface SectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          {icon}
        </span>
        <h2 className="text-sm font-bold text-neutral-900">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
  children: ReactNode;
}

function Field({ label, error, hint, required, full, children }: FieldProps) {
  return (
    <label className={full ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <span className="mb-1 block text-xs font-semibold text-neutral-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}
