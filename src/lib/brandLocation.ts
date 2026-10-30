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

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}
