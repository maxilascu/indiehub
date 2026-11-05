export interface Brand {
  id: number;
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

type EdgeProduct = Omit<
  Product,
  'images' | 'description' | 'sizes' | 'priceLabel' | 'priceDozen' | 'pricePack' | 'unitsPack' | 'priceSingle' | 'unitPriceSingle' | 'codigoDocena' | 'codigoPack' | 'imageCodes'
> & {
  images?: string[];
  description?: string;
  sizes?: string[];
  priceLabel?: string;
  priceDozen?: number | null;
  pricePack?: number | null;
  unitsPack?: number | null;
  priceSingle?: number | null;
  unitPriceSingle?: string;
  codigoDocena?: string;
  codigoPack?: string;
  imageCodes?: string[];
};

interface EdgeFunctionResponse {
  products: EdgeProduct[];
  cached?: boolean;
  stale?: boolean;
}

export async function fetchBrands(): Promise<Brand[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brands-csv`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Error al cargar marcas (${response.status})`);
  }

  const json: { brands?: Brand[] } = await response.json();
  if (!json.brands || !Array.isArray(json.brands)) {
    throw new Error('Formato de marcas inválido');
  }
  return json.brands.map((brand) => ({
    ...brand,
    lat: brand.lat ?? null,
    lng: brand.lng ?? null,
    sendsNational: Boolean(brand.sendsNational),
    shippingZones: brand.shippingZones ?? [],
  }));
}

const PRODUCT_IMAGES_BUCKET = 'indiehub-product-images';

export function normalizeArticleCode(value: string): string | null {
  const match = value.match(/(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return `ART_${parseInt(match[1], 10)}${match[2] ? `.${match[2]}` : ''}`;
}

function buildProductImageUrl(storagePath: string): string {
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encodedPath}`;
}

async function fetchProductImagesByArticle(): Promise<Map<string, string[]>> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url =
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/product_images` +
    '?select=article_code,storage_path' +
    '&article_code=not.is.null' +
    '&order=display_order.asc,page_number.asc.nullslast,column_number.asc.nullslast,original_filename.asc';

  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });

  if (!response.ok) {
    throw new Error(`Error al cargar fotografías (${response.status})`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Formato de fotografías inválido');
  }

  const photosByArticle = new Map<string, string[]>();
  for (const row of rows as { article_code: string; storage_path: string }[]) {
    const code = normalizeArticleCode(row.article_code);
    if (!code) continue;
    const photos = photosByArticle.get(code) ?? [];
    photos.push(buildProductImageUrl(row.storage_path));
    photosByArticle.set(code, photos);
  }
  return photosByArticle;
}

export async function fetchProducts(): Promise<Product[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/products-csv`;
  const headers = {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  const [response, photosByArticle] = await Promise.all([
    fetch(url, { headers }),
    fetchProductImagesByArticle(),
  ]);

  if (!response.ok) {
    throw new Error(`Error al cargar productos (${response.status})`);
  }

  const json: EdgeFunctionResponse = await response.json();

  if (!json.products || !Array.isArray(json.products)) {
    throw new Error('Formato de respuesta inválido');
  }

  return json.products.map((product) => {
    const codes = (product.imageCodes ?? [])
      .map(normalizeArticleCode)
      .filter((c): c is string => c !== null);
    const photos = [...new Set(codes.flatMap((code) => photosByArticle.get(code) ?? []))];
    return {
      ...product,
      description: product.description ?? '',
      sizes: product.sizes ?? [],
      priceLabel: product.priceLabel ?? '',
      priceDozen: product.priceDozen ?? null,
      pricePack: product.pricePack ?? null,
      unitsPack: product.unitsPack ?? null,
      priceSingle: product.priceSingle ?? null,
      unitPriceSingle: product.unitPriceSingle ?? '',
      codigoDocena: product.codigoDocena ?? '',
      codigoPack: product.codigoPack ?? '',
      imageCodes: product.imageCodes ?? [],
      image: photos[0] ?? FALLBACK_PRODUCT_IMAGE,
      images: photos.length ? photos : [FALLBACK_PRODUCT_IMAGE],
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
