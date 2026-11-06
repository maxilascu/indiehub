export interface Brand {
  id: number;
  brandId: string;
  name: string;
  logo: string;
  instagram: string;
  province: string;
  city: string;
  hasStore: boolean;
  address: string;
  hasShipping: boolean;
  description: string;
  lat: number | null;
  lng: number | null;
  sendsNational: boolean;
  shippingZones: string[];
}

export interface Product {
  id: number;
  brandId: string;
  brand: string;
  name: string;
  price: number;
  priceLabel: string;
  priceDozen: number | null;
  pricePack: number | null;
  unitsPack: number | null;
  priceSingle: number | null;
  unitPriceSingle: string;
  codigoDocena: string;
  codigoPack: string;
  imageCodes: string[];
  image: string;
  link: string;
  gender: string;
  category: string;
  style: string;
  location: string;
  promotion: string;
  freeShipping: boolean;
  previousPrice: number | null;
  images: string[];
  description: string;
  sizes: string[];
  catalogSeq: number;
}

export const FALLBACK_PRODUCT_IMAGE =
  'https://images.pexels.com/photos/8146450/pexels-photo-8146450.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

export function formatARS(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

const PRODUCT_IMAGES_BUCKET = 'indiehub-product-images';

export function normalizeArticleCode(value: string): string | null {
  const match = value.match(/(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return `ART_${parseInt(match[1], 10)}${match[2] ? `.${match[2]}` : ''}`;
}

export function buildProductImageUrl(storagePath: string): string {
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encodedPath}`;
}

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string;
  instagram_url: string;
  province: string;
  city: string;
  address: string;
  description: string;
  has_store: boolean;
  has_shipping: boolean;
  sends_national: boolean;
  shipping_zones: string[];
  lat: number | null;
  lng: number | null;
  status: string;
}

interface ProductRow {
  id: string;
  brand_id: string;
  external_id: string;
  catalog_seq: number;
  name: string;
  price: string;
  price_label: string;
  price_dozen: string | null;
  price_pack: string | null;
  units_pack: number | null;
  price_single: string | null;
  unit_price_single: string;
  codigo_docena: string;
  codigo_pack: string;
  image_codes: string[];
  link: string;
  gender: string;
  category: string;
  style: string;
  location: string;
  promotion: string;
  free_shipping: boolean;
  previous_price: string | null;
  description: string;
  sizes: string[];
  status: string;
}

interface ImageRow {
  article_code: string | null;
  storage_path: string;
  brand_id: string | null;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function authHeaders(): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchBrands(): Promise<Brand[]> {
  const url =
    `${supabaseUrl}/rest/v1/brands` +
    '?select=id,slug,name,logo_url,instagram_url,province,city,address,description,has_store,has_shipping,sends_national,shipping_zones,lat,lng,status' +
    '&status=eq.published' +
    '&order=name.asc';

  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Error al cargar marcas (${response.status})`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Formato de marcas inválido');
  }

  return (rows as BrandRow[]).map((row, index) => ({
    id: index + 1,
    brandId: row.id,
    name: row.name,
    logo: row.logo_url || 'https://images.pexels.com/photos/994523/pexels-photo-994523.jpeg?auto=compress&cs=tinysrgb&w=900',
    instagram: row.instagram_url,
    province: row.province,
    city: row.city,
    address: row.address,
    description: row.description,
    hasStore: row.has_store,
    hasShipping: row.has_shipping,
    sendsNational: row.sends_national,
    shippingZones: row.shipping_zones ?? [],
    lat: row.lat ?? null,
    lng: row.lng ?? null,
  }));
}

async function fetchProductImagesByBrand(brandIds: string[]): Promise<Map<string, string[]>> {
  if (brandIds.length === 0) return new Map();

  const filter = `brand_id=in.(${brandIds.join(',')})`;
  const url =
    `${supabaseUrl}/rest/v1/product_images` +
    '?select=article_code,storage_path,brand_id' +
    `&${filter}` +
    '&article_code=not.is.null' +
    '&order=display_order.asc,page_number.asc.nullslast,column_number.asc.nullslast,original_filename.asc';

  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Error al cargar fotografías (${response.status})`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Formato de fotografías inválido');
  }

  const photosByArticle = new Map<string, string[]>();
  for (const row of rows as ImageRow[]) {
    const code = normalizeArticleCode(row.article_code ?? '');
    if (!code) continue;
    const photos = photosByArticle.get(code) ?? [];
    photos.push(buildProductImageUrl(row.storage_path));
    photosByArticle.set(code, photos);
  }
  return photosByArticle;
}

export async function fetchProducts(): Promise<Product[]> {
  const productsUrl =
    `${supabaseUrl}/rest/v1/products` +
    '?select=id,brand_id,external_id,catalog_seq,name,price,price_label,price_dozen,price_pack,units_pack,price_single,unit_price_single,codigo_docena,codigo_pack,image_codes,link,gender,category,style,location,promotion,free_shipping,previous_price,description,sizes,status' +
    '&status=eq.published' +
    '&order=catalog_seq.desc';

  const [productsResponse, brandsResponse] = await Promise.all([
    fetch(productsUrl, { headers: authHeaders() }),
    fetchBrands(),
  ]);

  if (!productsResponse.ok) {
    throw new Error(`Error al cargar productos (${productsResponse.status})`);
  }

  const productRows: unknown = await productsResponse.json();
  if (!Array.isArray(productRows)) {
    throw new Error('Formato de respuesta inválido');
  }

  const rows = productRows as ProductRow[];
  const brandIdToName = new Map<string, string>();
  for (const brand of brandsResponse) {
    brandIdToName.set(brand.brandId, brand.name);
  }

  const brandIds = [...new Set(rows.map((r) => r.brand_id))];
  const photosByArticle = await fetchProductImagesByBrand(brandIds);

  return rows.map((row, index) => {
    const brandName = brandIdToName.get(row.brand_id) ?? '';
    const codes = (row.image_codes ?? [])
      .map(normalizeArticleCode)
      .filter((c): c is string => c !== null);
    const photos = [...new Set(codes.flatMap((code) => photosByArticle.get(code) ?? []))];
    return {
      id: index + 1,
      brandId: row.brand_id,
      brand: brandName,
      name: row.name,
      price: parseFloat(row.price) || 0,
      priceLabel: row.price_label ?? '',
      priceDozen: row.price_dozen !== null ? parseFloat(row.price_dozen) : null,
      pricePack: row.price_pack !== null ? parseFloat(row.price_pack) : null,
      unitsPack: row.units_pack ?? null,
      priceSingle: row.price_single !== null ? parseFloat(row.price_single) : null,
      unitPriceSingle: row.unit_price_single ?? '',
      codigoDocena: row.codigo_docena ?? '',
      codigoPack: row.codigo_pack ?? '',
      imageCodes: row.image_codes ?? [],
      image: photos[0] ?? FALLBACK_PRODUCT_IMAGE,
      images: photos.length ? photos : [FALLBACK_PRODUCT_IMAGE],
      link: row.link ?? '',
      gender: row.gender || 'Unisex',
      category: row.category ?? '',
      style: row.style ?? '',
      location: row.location ?? '',
      promotion: row.promotion ?? '',
      freeShipping: row.free_shipping ?? false,
      previousPrice: row.previous_price !== null ? parseFloat(row.previous_price) : null,
      description: row.description ?? '',
      sizes: row.sizes ?? [],
      catalogSeq: row.catalog_seq,
    };
  });
}

export function getRelatedProducts(product: Product, all: Product[], limit = 10): Product[] {
  const others = all.filter((p) => p.id !== product.id);
  const sameBrand = others.filter((p) => p.brand === product.brand);
  const sameCategory = others.filter(
    (p) => p.brand !== product.brand && p.category === product.category
  );
  return [...sameBrand, ...sameCategory].slice(0, limit);
}

export function extractUniqueValues(
  products: Product[],
  field: keyof Product
): string[] {
  const set = new Set<string>();
  for (const p of products) {
    const val = p[field];
    if (val && typeof val === 'string' && val.trim()) {
      set.add(val.trim());
    }
  }
  return Array.from(set).sort();
}
