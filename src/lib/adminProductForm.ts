import { normalizeArticleCode } from '@/data/products';

export type ProductStatus = 'draft' | 'published' | 'archived';

export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

export const FIELD_LABELS: Record<string, string> = {
  price: 'Precio principal',
  currency: 'Moneda',
  price_label: 'Etiqueta de precio',
  price_dozen: 'Precio por docena',
  price_pack: 'Precio por pack',
  units_pack: 'Unidades por pack',
  price_single: 'Precio unitario',
  unit_price_single: 'Precio unitario (texto)',
  previous_price: 'Precio anterior',
  codigo_docena: 'Código de docena',
  codigo_pack: 'Código de pack',
};

export interface AdminProductRecord {
  id: string;
  brand_id: string;
  external_id: string;
  catalog_seq: number;
  name: string;
  price: string;
  currency: string;
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
  status: ProductStatus;
  updated_at: string;
}

export interface ProductFormValues {
  brand_id: string;
  name: string;
  external_id: string;
  description: string;
  category: string;
  gender: string;
  style: string;
  location: string;
  link: string;
  promotion: string;
  sizes: string;
  image_codes: string;
  price: string;
  currency: string;
  price_label: string;
  price_dozen: string;
  price_pack: string;
  units_pack: string;
  price_single: string;
  unit_price_single: string;
  previous_price: string;
  codigo_docena: string;
  codigo_pack: string;
  free_shipping: boolean;
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>;

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  brand_id: '',
  name: '',
  external_id: '',
  description: '',
  category: '',
  gender: 'Unisex',
  style: '',
  location: '',
  link: '',
  promotion: '',
  sizes: '',
  image_codes: '',
  price: '',
  currency: 'ARS',
  price_label: '',
  price_dozen: '',
  price_pack: '',
  units_pack: '',
  price_single: '',
  unit_price_single: '',
  previous_price: '',
  codigo_docena: '',
  codigo_pack: '',
  free_shipping: false,
};

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;
const DECIMAL_KEYS = ['price', 'price_dozen', 'price_pack', 'price_single', 'previous_price'] as const;

export function splitList(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export function parseImageCodes(text: string): string[] | null {
  const codes: string[] = [];
  for (const part of splitList(text)) {
    const code = normalizeArticleCode(part);
    if (!code) return null;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

export function toFormValues(record: AdminProductRecord): ProductFormValues {
  return {
    brand_id: record.brand_id,
    name: record.name,
    external_id: record.external_id,
    description: record.description,
    category: record.category,
    gender: record.gender,
    style: record.style,
    location: record.location,
    link: record.link,
    promotion: record.promotion,
    sizes: record.sizes.join(', '),
    image_codes: record.image_codes.join(', '),
    // PostgREST can deserialize PostgreSQL numeric columns as JavaScript numbers.
    // Normalize every numeric field to a string because form inputs and validation use string methods.
    price: String(record.price ?? ''),
    currency: record.currency,
    price_label: record.price_label,
    price_dozen: record.price_dozen == null ? '' : String(record.price_dozen),
    price_pack: record.price_pack == null ? '' : String(record.price_pack),
    units_pack: record.units_pack === null ? '' : String(record.units_pack),
    price_single: record.price_single == null ? '' : String(record.price_single),
    unit_price_single: record.unit_price_single,
    previous_price: record.previous_price == null ? '' : String(record.previous_price),
    codigo_docena: record.codigo_docena,
    codigo_pack: record.codigo_pack,
    free_shipping: record.free_shipping,
  };
}

export function validateProductForm(values: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {};
  const name = values.name.trim();

  if (!values.brand_id) errors.brand_id = 'Seleccioná una marca';
  if (!name) errors.name = 'El nombre es obligatorio';
  else if (name.length > 200) errors.name = 'Máximo 200 caracteres';

  if (values.external_id.trim().length > 80) errors.external_id = 'Máximo 80 caracteres';

  if (!values.price.trim()) errors.price = 'El precio es obligatorio';
  for (const key of DECIMAL_KEYS) {
    const raw = values[key].trim();
    if (raw && !DECIMAL_PATTERN.test(raw)) errors[key] = 'Usá un importe con hasta 2 decimales';
  }

  const units = values.units_pack.trim();
  if (units && (!/^\d+$/.test(units) || Number(units) < 1)) {
    errors.units_pack = 'Debe ser un número entero mayor a 0';
  }

  const currency = values.currency.trim();
  if (currency && !/^[A-Za-z]{3}$/.test(currency)) errors.currency = 'Usá tres letras, por ejemplo ARS';

  const link = values.link.trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) errors.link = 'Debe empezar con http:// o https://';

  if (parseImageCodes(values.image_codes) === null) {
    errors.image_codes = 'Usá códigos como 17 o ART_17, separados por coma';
  }

  return errors;
}

export function toSavePayload(values: ProductFormValues): Record<string, unknown> {
  return {
    brand_id: values.brand_id,
    name: values.name.trim(),
    external_id: values.external_id.trim(),
    description: values.description.trim(),
    category: values.category.trim(),
    gender: values.gender.trim(),
    style: values.style.trim(),
    location: values.location.trim(),
    link: values.link.trim(),
    promotion: values.promotion.trim(),
    sizes: splitList(values.sizes),
    image_codes: parseImageCodes(values.image_codes) ?? [],
    price: values.price.trim(),
    currency: values.currency.trim().toUpperCase(),
    price_label: values.price_label.trim(),
    price_dozen: values.price_dozen.trim(),
    price_pack: values.price_pack.trim(),
    units_pack: values.units_pack.trim(),
    price_single: values.price_single.trim(),
    unit_price_single: values.unit_price_single.trim(),
    previous_price: values.previous_price.trim(),
    codigo_docena: values.codigo_docena.trim(),
    codigo_pack: values.codigo_pack.trim(),
    free_shipping: values.free_shipping,
  };
}
