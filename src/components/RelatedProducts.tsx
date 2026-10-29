import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FALLBACK_PRODUCT_IMAGE, formatARS, type Product } from '@/data/products';

interface Props {
  products: Product[];
  onSelect: (product: Product) => void;
}

export default function RelatedProducts({ products, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector('[data-related-card]')?.getBoundingClientRect().width ?? 160;
    el.scrollBy({
      left: dir === 'left' ? -(cardWidth + 12) : cardWidth + 12,
      behavior: 'smooth',
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-neutral-900">También te puede interesar</h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-90"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-90"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            data-related-card
            onClick={() => onSelect(product)}
            className="group w-36 shrink-0 snap-start overflow-hidden rounded-xl bg-white text-left ring-1 ring-neutral-200/80 transition duration-300 hover:shadow-md hover:ring-neutral-300 sm:w-44"
          >
            <span className="block aspect-square overflow-hidden bg-neutral-100">
              <img
                src={product.image}
                alt={product.name}
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src !== FALLBACK_PRODUCT_IMAGE) {
                    img.src = FALLBACK_PRODUCT_IMAGE;
                  }
                }}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            </span>
            <span className="block p-2.5">
              <span className="block truncate text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400">
                {product.brand}
              </span>
              <span className="mt-0.5 block line-clamp-1 text-xs font-semibold text-neutral-900">
                {product.name}
              </span>
              <span className="mt-1 block text-sm font-bold text-neutral-900">
                {formatARS(product.price)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
