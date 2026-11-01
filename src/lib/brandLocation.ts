import type { Brand } from '@/data/products';

export interface BrandLocationFilters {
  province: string;
  city: string;
  storeOnly: boolean;
  shippingOnly: boolean;
}

export const EMPTY_BRAND_LOCATION_FILTERS: BrandLocationFilters = {
  province: '',
  city: '',
  storeOnly: false,
  shippingOnly: false,
};

export interface GeoArea {
  province: string;
  city: string;
  partido: string;
}

export interface UserLocation extends GeoArea {
  lat: number;
  lng: number;
}

export type ShippingCoverage = 'all' | 'yes' | 'no';

const GBA_PARTIDOS = [
  'Almirante Brown',
  'Avellaneda',
  'Berazategui',
  'Esteban Echeverría',
  'Ezeiza',
  'Florencio Varela',
  'General San Martín',
  'Hurlingham',
  'Ituzaingó',
  'José C. Paz',
  'La Matanza',
  'Lanús',
  'Lomas de Zamora',
  'Malvinas Argentinas',
  'Merlo',
  'Moreno',
  'Morón',
  'Quilmes',
  'San Fernando',
  'San Isidro',
  'San Miguel',
  'Tigre',
  'Tres de Febrero',
  'Vicente López',
];

const GBA_PARTIDO_KEYS = new Set(GBA_PARTIDOS.map(normalizeText));

export function getProvinceOptions(brands: Brand[]): string[] {
  return uniqueSorted(brands.map((brand) => brand.province));
}

export function getCityOptions(brands: Brand[], province: string): string[] {
  if (!province) return [];
  return uniqueSorted(
    brands.filter((brand) => brand.province === province).map((brand) => brand.city)
  );
}

export function filterBrandsByLocation(
  brands: Brand[],
  filters: BrandLocationFilters
): Brand[] {
  return brands.filter((brand) => {
    if (filters.storeOnly && !brand.hasStore) return false;
    if (filters.shippingOnly && !brand.hasShipping) return false;
    if (!filters.province) return true;

    const hasLocalInPlace =
      brand.hasStore &&
      brand.province === filters.province &&
      (!filters.city || brand.city === filters.city);
    return hasLocalInPlace || brand.shipsNationwide;
  });
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface StoreTypeFilters {
  storeType: 'all' | 'online' | 'physical';
  maxDistance: number;
  userLocation: UserLocation | null;
}

export function filterBrandsByStoreType(
  brands: Brand[],
  filters: StoreTypeFilters
): Brand[] {
  if (filters.storeType === 'all') return brands;

  if (filters.storeType === 'online') {
    return brands.filter((brand) => !brand.hasStore);
  }

  return brands.filter((brand) => {
    if (!brand.hasStore) return false;
    if (!filters.userLocation) return true;
    if (brand.lat == null || brand.lng == null) return true;
    const dist = haversineKm(
      filters.userLocation.lat,
      filters.userLocation.lng,
      brand.lat,
      brand.lng
    );
    return dist <= filters.maxDistance;
  });
}

export function resolveServiceArea(values: {
  province: string;
  city: string;
  userLocation: UserLocation | null;
}): GeoArea | null {
  if (values.province || values.city) {
    return { province: values.province, city: values.city, partido: '' };
  }
  const location = values.userLocation;
  if (location && (location.province || location.city || location.partido)) {
    return { province: location.province, city: location.city, partido: location.partido };
  }
  return null;
}

export function filterBrandsByShipping(
  brands: Brand[],
  coverage: ShippingCoverage,
  area: GeoArea | null
): Brand[] {
  if (coverage === 'all' || !area) return brands;
  const keys = getAreaKeys(area);
  return brands.filter((brand) => {
    const covers =
      brand.sendsNational ||
      brand.shippingZones.some((zone) => keys.has(normalizeText(zone)));
    return coverage === 'yes' ? covers : !covers;
  });
}

function getAreaKeys(area: GeoArea): Set<string> {
  const names = [area.province, area.city, area.partido].map(normalizeText).filter(Boolean);
  const keys = new Set(names);
  if (
    names.some(
      (name) => name === 'caba' || name === 'capital federal' || name.includes('ciudad autonoma de buenos aires')
    )
  ) {
    keys.add('caba');
  }
  if (names.some((name) => GBA_PARTIDO_KEYS.has(name))) {
    keys.add('gba');
  }
  return keys;
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}
