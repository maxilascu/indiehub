import { useCallback, useSyncExternalStore } from 'react';
import type { Brand, Product } from '@/data/products';

const PRODUCTS_KEY = 'indiehub:favorites:products';
const BRANDS_KEY = 'indiehub:favorites:brands';

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function productKey(product: Product): string {
  return `${product.brand}::${product.name}`;
}

export function brandKey(brand: Brand): string {
  return brand.name;
}

let productFavorites = read(PRODUCTS_KEY);
let brandFavorites = read(BRANDS_KEY);
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setProductFavorites(next: string[]) {
  productFavorites = next;
  try {
    window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); in-session state still works.
  }
  notify();
}

function setBrandFavorites(next: string[]) {
  brandFavorites = next;
  try {
    window.localStorage.setItem(BRANDS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PRODUCTS_KEY) {
      productFavorites = read(PRODUCTS_KEY);
      notify();
    } else if (event.key === BRANDS_KEY) {
      brandFavorites = read(BRANDS_KEY);
      notify();
    }
  });
}

export function useFavoriteProducts() {
  const favorites = useSyncExternalStore(
    subscribe,
    () => productFavorites,
    () => productFavorites
  );
  const toggle = useCallback(
    (product: Product) => {
      const key = productKey(product);
      setProductFavorites(
        favorites.includes(key)
          ? favorites.filter((item) => item !== key)
          : [...favorites, key]
      );
    },
    [favorites]
  );
  const isFavorite = useCallback(
    (product: Product) => favorites.includes(productKey(product)),
    [favorites]
  );
  return { favorites, toggle, isFavorite, count: favorites.length };
}

export function useFavoriteBrands() {
  const favorites = useSyncExternalStore(
    subscribe,
    () => brandFavorites,
    () => brandFavorites
  );
  const toggle = useCallback(
    (brand: Brand) => {
      const key = brandKey(brand);
      setBrandFavorites(
        favorites.includes(key)
          ? favorites.filter((item) => item !== key)
          : [...favorites, key]
      );
    },
    [favorites]
  );
  const isFavorite = useCallback(
    (brand: Brand) => favorites.includes(brandKey(brand)),
    [favorites]
  );
  return { favorites, toggle, isFavorite, count: favorites.length };
}
