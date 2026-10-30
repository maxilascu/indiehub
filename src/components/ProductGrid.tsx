import { SearchX, Loader2 } from 'lucide-react';
import type { Product } from '@/data/products';
import ProductCard from './ProductCard';

interface Props {
  products: Product[];
  loading: boolean;
  error: string | null;
  onSelectProduct: (product: Product) => void;
}

export default function ProductGrid({ products, loading, error, onSelectProduct }: Props) {
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
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5 xl:grid-cols-6">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} onOpen={onSelectProduct} />
      ))}
    </div>
  );
}
