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
  userLocation: { lat: number; lng: number } | null;
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

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}
