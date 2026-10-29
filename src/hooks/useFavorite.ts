import { useCallback, useState } from 'react';
import type { Product } from '@/data/products';

const STORAGE_KEY = 'indiehub:favorites';

function favoriteKey(product: Product): string {
  return `${product.brand}::${product.name}`;
}

function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function useFavorite(product: Product) {
  const key = favoriteKey(product);
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const isFavorite = favorites.includes(key);

  const toggleFavorite = useCallback(() => {
    const next = isFavorite
      ? favorites.filter((item) => item !== key)
      : [...favorites, key];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this session.
    }
    setFavorites(next);
  }, [favorites, isFavorite, key]);

  return { isFavorite, toggleFavorite };
}
