import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Package, Plus, RefreshCw, Search } from 'lucide-react';
import { STATUS_LABELS, type ProductStatus } from '@/lib/adminProductForm';
import {
  PAGE_SIZE,
  SORT_LABELS,
  buildGallery,
  fetchBrandOptions,
  fetchImagesForBrandCodes,
  fetchProductList,
  getAdminErrorMessage,
  groupImagesByBrandCode,
  imageUrl,
  normalizeCodes,
  type AdminProductListItem,
  type BrandOption,
  type ProductListFilters,
  type ProductSort,
} from '@/lib/adminProductsApi';
import AdminProductEditor from '@/components/AdminProductEditor';

const INITIAL_FILTERS: ProductListFilters = {
  search: '',
  brandId: '',
  status: 'all',
  sort: 'recent',
  page: 1,
};

const STATUS_BADGE: Record<ProductStatus, string> = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archived: 'bg-neutral-100 text-neutral-600 ring-neutral-300',
};

function formatPrice(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AdminProducts() {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandsError, setBrandsError] = useState<string | null>(null);

  const loadBrands = async () => {
    try {
      setBrandsError(null);
      setBrands(await fetchBrandOptions());
    } catch (cause) {
      setBrandsError(getAdminErrorMessage(cause));
    }
  };

  useEffect(() => {
    loadBrands();
  }, []);

  if (editing) {
    return (
      <AdminShell title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'} backLabel="Volver al listado" onBack={() => setEditing(null)}>
        {brandsError ? (
          <ErrorPanel message={brandsError} onRetry={loadBrands} />
        ) : (
          <AdminProductEditor
            productId={editing === 'new' ? null : editing}
            brands={brands}
            onCreated={(id) => setEditing(id)}
          />
        )}
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Productos" backLabel="Volver al panel" onBack={() => { window.location.assign('/admin'); }}>
      {brandsError ? (
        <ErrorPanel message={brandsError} onRetry={loadBrands} />
      ) : (
        <ProductList brands={brands} onOpen={(id) => setEditing(id)} onCreate={() => setEditing('new')} />
      )}
    </AdminShell>
  );
}

interface AdminShellProps {
  title: string;
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}

function AdminShell({ title, backLabel, onBack, children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="text-sm font-bold text-neutral-900">
            INDIE<span className="text-emerald-500">HUB</span> Admin
          </span>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-200 hover:text-neutral-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
        {children}
      </main>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
      <p className="text-xs font-medium text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-50"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reintentar
      </button>
    </div>
  );
}

interface ProductListProps {
  brands: BrandOption[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}

function ProductList({ brands, onOpen, onCreate }: ProductListProps) {
  const [filters, setFilters] = useState<ProductListFilters>(INITIAL_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState<AdminProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim(), page: 1 }
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { rows: pageRows, total: count } = await fetchProductList(filters);
        if (cancelled) return;
        setRows(pageRows);
        setTotal(count);

        const brandIds = [...new Set(pageRows.map((row) => row.brand_id))];
        const codes = normalizeCodes(pageRows.flatMap((row) => row.image_codes));
        const images = await fetchImagesForBrandCodes(brandIds, codes);
        if (cancelled) return;
        const groups = groupImagesByBrandCode(images);
        const map = new Map<string, string>();
        for (const row of pageRows) {
          const first = buildGallery(row.brand_id, row.image_codes, groups)[0];
          if (first) map.set(row.id, imageUrl(first));
        }
        setThumbs(map);
      } catch (cause) {
        if (!cancelled) setError(getAdminErrorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = filters.search !== '' || filters.brandId !== '' || filters.status !== 'all';

  const updateFilters = (patch: Partial<ProductListFilters>) => {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-neutral-200 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative sm:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Nombre o código"
              className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <select
            value={filters.brandId}
            onChange={(event) => updateFilters({ brandId: event.target.value })}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todas las marcas</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => updateFilters({ status: event.target.value as ProductStatus | 'all' })}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">Todos los estados</option>
            <option value="draft">{STATUS_LABELS.draft}</option>
            <option value="published">{STATUS_LABELS.published}</option>
            <option value="archived">{STATUS_LABELS.archived}</option>
          </select>
          <select
            value={filters.sort}
            onChange={(event) => updateFilters({ sort: event.target.value as ProductSort })}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {(Object.keys(SORT_LABELS) as ProductSort[]).map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onCreate}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo producto
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
          <p className="text-xs font-medium text-red-700">{error}</p>
          <button
            onClick={() => setReloadKey((key) => key + 1)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 text-xs text-neutral-500">
          <span>
            {loading ? 'Cargando productos…' : `${total} producto${total === 1 ? '' : 's'}${hasActiveFilters ? ' con los filtros aplicados' : ''}`}
          </span>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
        </div>

        {!loading && !error && rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Package className="h-8 w-8 text-neutral-300" />
            <p className="text-sm font-semibold text-neutral-700">No hay productos para mostrar</p>
            <p className="text-xs text-neutral-500">
              {hasActiveFilters ? 'Probá cambiar la búsqueda o los filtros.' : 'Creá el primer producto con el botón de arriba.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-100 text-sm">
              <thead className="bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="hidden px-4 py-3 md:table-cell">Marca</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Modificado</th>
                  <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-200">
                          {thumbs.get(row.id) ? (
                            <img src={thumbs.get(row.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-4 w-4 text-neutral-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-neutral-900">{row.name}</p>
                          <p className="truncate text-xs text-neutral-500">
                            {row.external_id || 'Sin código externo'} · #{row.catalog_seq}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-neutral-600 md:table-cell">{brandName.get(row.brand_id) ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">{formatPrice(row.price, row.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_BADGE[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-neutral-500 lg:table-cell">
                      {new Date(row.updated_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onOpen(row.id)}
                        className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 hover:text-neutral-900"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3">
          <span className="text-xs text-neutral-500">
            Página {filters.page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
              disabled={loading || filters.page <= 1}
              className="flex items-center gap-1 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <button
              onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
              disabled={loading || filters.page >= totalPages}
              className="flex items-center gap-1 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
