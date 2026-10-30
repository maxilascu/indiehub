import { FALLBACK_PRODUCT_IMAGE, formatARS, type Product } from '@/data/products';
import FreeShippingBadge from '@/components/FreeShippingBadge';

interface Props {
  product: Product;
  onOpen: (product: Product) => void;
}

export default function ProductCard({ product, onOpen }: Props) {
  const hasPreviousPrice = Boolean(
    product.promotion && product.previousPrice && product.previousPrice > product.price
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-md bg-white ring-1 ring-neutral-200/80 transition duration-300 hover:shadow-md hover:shadow-neutral-900/10 hover:ring-neutral-300">
      <button
        type="button"
        onClick={() => onOpen(product)}
        aria-label={`Ver detalles de ${product.name}`}
        className="flex flex-1 flex-col text-left"
      >
        <span className="relative block h-32 overflow-hidden bg-neutral-100 sm:h-40">
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
            <FreeShippingBadge className="absolute left-1.5 top-1.5" />
          )}
          {product.promotion && (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-red-500 px-1.5 py-px text-[8px] font-bold text-white shadow-md">
              {product.promotion}
            </span>
          )}
        </span>

        <span className="flex flex-1 flex-col p-1.5 pb-0">
          <span className="block truncate text-[8px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            {product.brand}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[10px] font-semibold leading-tight text-neutral-900">
            {product.name}
          </span>
          <span className="mt-1 flex flex-wrap items-baseline gap-1">
            <span className="text-[11px] font-bold tracking-tight text-neutral-900">
              {formatARS(product.price)}
            </span>
            {hasPreviousPrice && product.previousPrice && (
              <span className="text-[8px] font-medium text-neutral-400 line-through">
                {formatARS(product.previousPrice)}
              </span>
            )}
          </span>
        </span>
      </button>
    </article>
  );
}
