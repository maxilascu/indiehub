import { useEffect, useRef, useState } from 'react';
import { SearchX, Loader2 } from 'lucide-react';
import type { Product } from '@/data/products';
import ProductCard from './ProductCard';

const PAGE_SIZE = 24;

interface Props {
  products: Product[];
  loading: boolean;
  error: string | null;
  onSelectProduct: (product: Product) => void;
  isFavorite?: (product: Product) => boolean;
  onToggleFavorite?: (product: Product) => void;
}

export default function ProductGrid({ products, loading, error, onSelectProduct, isFavorite, onToggleFavorite }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = visibleCount < products.length;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [products]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, products.length));
        }
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, products.length]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        <p className="mt-4 text-sm font-medium text-neutral-500">
          Cargando productos...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50/50 py-20 text-center">
        <p className="text-sm font-semibold text-red-600">
          No pudimos cargar los productos
        </p>
        <p className="mt-1 text-xs text-red-400">{error}</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-20 text-center">
        <SearchX className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm font-medium text-neutral-600">
          No encontramos productos para tu búsqueda
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Probá con otra palabra o categoría
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4">
        {products.slice(0, visibleCount).map((p) => (
          <ProductCard key={p.id} product={p} onOpen={onSelectProduct} isFavorite={isFavorite?.(p)} onToggleFavorite={onToggleFavorite} />
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      )}
    </>
  );
}
