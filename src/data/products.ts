export interface Brand {
  id: number;
  name: string;
  logo: string;
  instagram: string;
  province: string;
  city: string;
  hasStore: boolean;
  address: string;
  shipsNationwide: boolean;
  description: string;
}

export interface Product {
  id: number;
  brand: string;
  name: string;
  price: number;
  image: string;
  link: string;
  gender: string;
  category: string;
  style: string;
  location: string;
  promotion: string;
  previousPrice: number | null;
  images: string[];
  description: string;
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

type EdgeProduct = Omit<Product, 'images' | 'description'> & {
  images?: string[];
  description?: string;
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
  return json.brands;
}

export async function fetchProducts(): Promise<Product[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/products-csv`;
  const headers = {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Error al cargar productos (${response.status})`);
  }

  const json: EdgeFunctionResponse = await response.json();

  if (!json.products || !Array.isArray(json.products)) {
    throw new Error('Formato de respuesta inválido');
  }

  return json.products.map((product) => ({
    ...product,
    description: product.description ?? '',
    images: product.images?.length ? product.images : [product.image],
  }));
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
