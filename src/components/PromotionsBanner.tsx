import { useRef } from 'react';
import { Flame, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { FALLBACK_PRODUCT_IMAGE, formatARS, type Product } from '@/data/products';
import { trackOutboundClick } from '@/lib/analytics';

interface Props {
  products: Product[];
  loading: boolean;
  onSelectProduct: (product: Product) => void;
}

export default function PromotionsBanner({ products, loading, onSelectProduct }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (loading) return null;
  if (products.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector('[data-promo-card]')?.getBoundingClientRect().width ?? 200;
    el.scrollBy({
      left: dir === 'left' ? -(cardWidth + 12) : cardWidth + 12,
      behavior: 'smooth',
    });
  };

  return (
    <section className="rounded-2xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-500 text-white">
            <Flame className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-white sm:text-lg">
              Promociones & Ofertas Especiales
            </h2>
            <p className="text-xs text-neutral-400">
              {products.length} {products.length === 1 ? 'producto destacado' : 'productos destacados'}
            </p>
          </div>
        </div>
        <div className="hidden gap-1.5 sm:flex">
          <button
            onClick={() => scroll('left')}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-90"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-90"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible lg:grid-cols-4"
      >
        {products.map((p) => (
          <div
            key={p.id}
            data-promo-card
            className="group relative w-40 shrink-0 overflow-hidden rounded-xl bg-white sm:w-48 md:w-auto md:shrink"
          >
            <button
              type="button"
              onClick={() => onSelectProduct(p)}
              aria-label={`Ver detalles de ${p.name}`}
              className="block w-full text-left"
            >
              <span className="relative block aspect-square overflow-hidden bg-neutral-100">
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src !== FALLBACK_PRODUCT_IMAGE) {
                      img.src = FALLBACK_PRODUCT_IMAGE;
                    }
                  }}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute left-2 top-2 max-w-[60%] truncate rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-neutral-900 shadow-sm backdrop-blur">
                  {p.brand}
                </span>
                <span className="absolute bottom-2 left-2 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                  {p.promotion}
                </span>
              </span>
              <span className="block p-2.5">
                <span className="block line-clamp-1 text-xs font-semibold text-neutral-900">
                  {p.name}
                </span>
                <span className="mt-1 block text-sm font-bold text-neutral-900">
                  {formatARS(p.price)}
                </span>
              </span>
            </button>
            <a
              href={p.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver ${p.name} en la tienda`}
              onClick={() => trackOutboundClick(p.brand, p.link, 'ecommerce')}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-neutral-500 shadow-sm backdrop-blur transition hover:bg-neutral-900 hover:text-white"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
