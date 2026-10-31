import { useCallback, useSyncExternalStore } from 'react';
import type { Brand, Product } from '@/data/products';

const STORAGE_KEY = 'indiehub_favorites';

interface FavoritesData {
  products: string[];
  brands: string[];
}

function read(): FavoritesData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Partial<FavoritesData>;
      return {
        products: Array.isArray(obj.products)
          ? obj.products.filter((item): item is string => typeof item === 'string')
          : [],
        brands: Array.isArray(obj.brands)
          ? obj.brands.filter((item): item is string => typeof item === 'string')
          : [],
      };
    }
  } catch {
    // corrupt or unavailable storage — start fresh
  }
  return { products: [], brands: [] };
}

export function productKey(product: Product): string {
  return `${product.brand}::${product.name}`;
}

export function brandKey(brand: Brand): string {
  return brand.name;
}

let state: FavoritesData = read();
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

function persist(next: FavoritesData) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode or storage full — in-session state still works
  }
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      state = read();
      notify();
    }
  });
}

export function useFavoriteProducts() {
  const favorites = useSyncExternalStore(
    subscribe,
    () => state.products,
    () => state.products
  );
  const toggle = useCallback(
    (product: Product) => {
      const key = productKey(product);
      const next = favorites.includes(key)
        ? favorites.filter((item) => item !== key)
        : [...favorites, key];
      persist({ ...state, products: next });
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
    () => state.brands,
    () => state.brands
  );
  const toggle = useCallback(
    (brand: Brand) => {
      const key = brandKey(brand);
      const next = favorites.includes(key)
        ? favorites.filter((item) => item !== key)
        : [...favorites, key];
      persist({ ...state, brands: next });
    },
    [favorites]
  );
  const isFavorite = useCallback(
    (brand: Brand) => favorites.includes(brandKey(brand)),
    [favorites]
  );
  return { favorites, toggle, isFavorite, count: favorites.length };
}
