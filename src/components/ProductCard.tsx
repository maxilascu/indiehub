import { ArrowUpRight } from 'lucide-react';
import { FALLBACK_PRODUCT_IMAGE, formatARS, type Product } from '@/data/products';
import FreeShippingBadge from '@/components/FreeShippingBadge';
import { trackOutboundClick } from '@/lib/analytics';

interface Props {
  product: Product;
  onOpen: (product: Product) => void;
}

export default function ProductCard({ product, onOpen }: Props) {
  const hasPreviousPrice = Boolean(
    product.promotion && product.previousPrice && product.previousPrice > product.price
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200/80 transition duration-300 hover:shadow-lg hover:shadow-neutral-900/10 hover:ring-neutral-300">
      <button
        type="button"
        onClick={() => onOpen(product)}
        aria-label={`Ver detalles de ${product.name}`}
        className="flex flex-1 flex-col text-left"
      >
        <span className="relative block aspect-square overflow-hidden bg-neutral-100">
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
          {product.freeShipping && (
            <FreeShippingBadge className="absolute left-2 top-2" />
          )}
          {product.promotion && (
            <span className="absolute bottom-2 right-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
              {product.promotion}
            </span>
          )}
        </span>

        <span className="flex flex-1 flex-col p-2.5 pb-0">
          <span className="block truncate text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400">
            {product.brand}
          </span>
          <span className="mt-1 line-clamp-2 text-xs font-semibold leading-tight text-neutral-900">
            {product.name}
          </span>
          <span className="mt-1 flex flex-wrap items-baseline gap-1.5">
            <span className="text-sm font-bold tracking-tight text-neutral-900">
              {formatARS(product.price)}
            </span>
            {hasPreviousPrice && product.previousPrice && (
              <span className="text-[10px] font-medium text-neutral-400 line-through">
                {formatARS(product.previousPrice)}
              </span>
            )}
          </span>
        </span>
      </button>

      <div className="p-2.5 pt-2.5">
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOutboundClick(product.brand, product.link, 'ecommerce')}
          className="flex items-center justify-center gap-1 rounded-lg bg-neutral-900 py-2 text-[11px] font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98]"
        >
          Ver en la tienda
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}
