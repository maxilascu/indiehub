import { supabase } from '@/lib/supabase';
import { buildProductImageUrl, normalizeArticleCode } from '@/data/products';
import {
  toSavePayload,
  type AdminProductRecord,
  type ProductFormValues,
  type ProductStatus,
} from '@/lib/adminProductForm';

export const PAGE_SIZE = 20;

export interface BrandOption {
  id: string;
  name: string;
  status: string;
}

export type AdminProductListItem = Pick<
  AdminProductRecord,
  | 'id'
  | 'brand_id'
  | 'external_id'
  | 'catalog_seq'
  | 'name'
  | 'price'
  | 'currency'
  | 'price_dozen'
  | 'price_pack'
  | 'status'
  | 'image_codes'
  | 'updated_at'
  | 'free_shipping'
>;

export interface ProductImageRecord {
  id: string;
  brand_id: string;
  article_code: string;
  storage_path: string;
  display_order: number;
  page_number: number | null;
  column_number: number | null;
  original_filename: string;
}

export interface PriceHistoryRecord {
  id: string;
  changed_at: string;
  changed_by: string | null;
  price_field: string;
  old_value: string | null;
  new_value: string | null;
}

export type ProductSort = 'recent' | 'updated' | 'name' | 'price_asc' | 'price_desc';

export const SORT_LABELS: Record<ProductSort, string> = {
  recent: 'Más recientes',
  updated: 'Última modificación',
  name: 'Nombre (A-Z)',
  price_asc: 'Precio: menor a mayor',
  price_desc: 'Precio: mayor a menor',
};

export interface ProductListFilters {
  search: string;
  brandId: string;
  status: ProductStatus | 'all';
  sort: ProductSort;
  page: number;
}

const LIST_COLUMNS =
  'id,brand_id,external_id,catalog_seq,name,price,currency,price_dozen,price_pack,status,image_codes,updated_at,free_shipping';

const PRODUCT_COLUMNS =
  'id,brand_id,external_id,catalog_seq,name,price,currency,price_label,price_dozen,price_pack,units_pack,price_single,unit_price_single,codigo_docena,codigo_pack,image_codes,link,gender,category,style,location,promotion,free_shipping,previous_price,description,sizes,status,updated_at';

const IMAGE_COLUMNS =
  'id,brand_id,article_code,storage_path,display_order,page_number,column_number,original_filename';

function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*%"\\]/g, ' ').trim().slice(0, 80);
}

export function getAdminErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';

  if (code === 'P0001' && message) return message;
  if (code === '42501') return 'Tu sesión no tiene permisos para esta acción. Volvé a iniciar sesión.';
  console.error('admin products error', error);
  return 'No se pudo completar la operación. Intentá nuevamente.';
}

export async function fetchBrandOptions(): Promise<BrandOption[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, status')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BrandOption[];
}

export async function fetchProductList(
  filters: ProductListFilters
): Promise<{ rows: AdminProductListItem[]; total: number }> {
  let query = supabase.from('products').select(LIST_COLUMNS, { count: 'exact' });

  if (filters.brandId) query = query.eq('brand_id', filters.brandId);
  if (filters.status !== 'all') query = query.eq('status', filters.status);

  const term = sanitizeSearch(filters.search);
  if (term) {
    query = query.or(
      `name.ilike.*${term}*,external_id.ilike.*${term}*,codigo_docena.ilike.*${term}*,codigo_pack.ilike.*${term}*`
    );
  }

  const sortColumns: Record<ProductSort, { column: string; ascending: boolean }> = {
    recent: { column: 'catalog_seq', ascending: false },
    updated: { column: 'updated_at', ascending: false },
    name: { column: 'name', ascending: true },
    price_asc: { column: 'price', ascending: true },
    price_desc: { column: 'price', ascending: false },
  };
  const sort = sortColumns[filters.sort];
  query = query.order(sort.column, { ascending: sort.ascending });

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as AdminProductListItem[], total: count ?? 0 };
}

export async function fetchAdminProduct(productId: string): Promise<AdminProductRecord | null> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', productId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as AdminProductRecord | null;
}

export async function saveAdminProduct(productId: string | null, values: ProductFormValues): Promise<string> {
  const { data, error } = await supabase.rpc('admin_save_product', {
    p_product_id: productId,
    p_data: toSavePayload(values),
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Respuesta inesperada al guardar');
  return data;
}

export async function setAdminProductStatus(productId: string, status: ProductStatus): Promise<void> {
  const { error } = await supabase.rpc('admin_set_product_status', {
    p_product_id: productId,
    p_status: status,
  });
  if (error) throw error;
}

export async function setAdminImageOrder(brandId: string, articleCode: string, imageIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('admin_set_image_order', {
    p_brand_id: brandId,
    p_article_code: articleCode,
    p_image_ids: imageIds,
  });
  if (error) throw error;
}

export async function fetchPriceHistory(productId: string): Promise<PriceHistoryRecord[]> {
  const { data, error } = await supabase
    .from('product_price_history')
    .select('id, changed_at, changed_by, price_field, old_value, new_value')
    .eq('product_id', productId)
    .order('changed_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as PriceHistoryRecord[];
}

export async function fetchImagesForBrandCodes(
  brandIds: string[],
  codes: string[]
): Promise<ProductImageRecord[]> {
  if (brandIds.length === 0 || codes.length === 0) return [];
  const { data, error } = await supabase
    .from('product_images')
    .select(IMAGE_COLUMNS)
    .in('brand_id', brandIds)
    .in('article_code', codes)
    .order('display_order', { ascending: true })
    .order('page_number', { ascending: true, nullsFirst: false })
    .order('column_number', { ascending: true, nullsFirst: false })
    .order('original_filename', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductImageRecord[];
}

export async function fetchBrandImages(brandId: string): Promise<ProductImageRecord[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select(IMAGE_COLUMNS)
    .eq('brand_id', brandId)
    .not('article_code', 'is', null)
    .order('display_order', { ascending: true })
    .order('page_number', { ascending: true, nullsFirst: false })
    .order('column_number', { ascending: true, nullsFirst: false })
    .order('original_filename', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductImageRecord[];
}

export function normalizeCodes(codes: string[]): string[] {
  const result: string[] = [];
  for (const raw of codes) {
    const code = normalizeArticleCode(raw);
    if (code && !result.includes(code)) result.push(code);
  }
  return result;
}

export function groupImagesByBrandCode(rows: ProductImageRecord[]): Map<string, ProductImageRecord[]> {
  const groups = new Map<string, ProductImageRecord[]>();
  for (const row of rows) {
    const key = `${row.brand_id}|${row.article_code}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

export function buildGallery(
  brandId: string,
  imageCodes: string[],
  groups: Map<string, ProductImageRecord[]>
): ProductImageRecord[] {
  const seen = new Set<string>();
  const gallery: ProductImageRecord[] = [];
  for (const code of normalizeCodes(imageCodes)) {
    for (const image of groups.get(`${brandId}|${code}`) ?? []) {
      if (seen.has(image.id)) continue;
      seen.add(image.id);
      gallery.push(image);
    }
  }
  return gallery;
}

export function imageUrl(image: ProductImageRecord): string {
  return buildProductImageUrl(image.storage_path);
}
