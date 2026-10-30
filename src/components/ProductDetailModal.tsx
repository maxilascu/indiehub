import { useEffect, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import FreeShippingBadge from '@/components/FreeShippingBadge';
import { FALLBACK_PRODUCT_IMAGE, formatARS, type Product } from '@/data/products';
import { trackOutboundClick } from '@/lib/analytics';

interface Props {
  product: Product | null;
  onClose: () => void;
}

export default function ProductDetailModal({ product, onClose }: Props) {
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    if (!product) return;
    setImageIndex(0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [product, onClose]);

  if (!product) return null;

  const hasPreviousPrice = Boolean(
    product.promotion && product.previousPrice && product.previousPrice > product.price
  );
  const image = product.images[imageIndex] ?? product.image;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:flex-row sm:rounded-3xl"
      >
        <div className="relative bg-neutral-100 sm:w-1/2">
          <div className="relative aspect-square overflow-hidden">
            <img
              src={image}
              alt={product.name}
              onError={(event) => {
                if (event.currentTarget.src !== FALLBACK_PRODUCT_IMAGE) {
                  event.currentTarget.src = FALLBACK_PRODUCT_IMAGE;
                }
              }}
              className="h-full w-full object-cover"
            />
            {product.freeShipping && (
              <FreeShippingBadge className="absolute left-3 top-3" />
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 p-3">
              {product.images.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={() => setImageIndex(index)}
                  aria-label={`Ver imagen ${index + 1}`}
                  className={`h-12 w-12 overflow-hidden rounded-lg ring-2 transition ${
                    index === imageIndex ? 'ring-emerald-500' : 'ring-transparent hover:ring-neutral-300'
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-400">
              {product.brand}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar detalle"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <h2 id="product-detail-title" className="mt-2 text-xl font-bold leading-tight text-neutral-900 sm:text-2xl">
            {product.name}
          </h2>

          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900">
              {formatARS(product.price)}
            </span>
            {hasPreviousPrice && product.previousPrice && (
              <span className="text-sm font-medium text-neutral-400 line-through">
                {formatARS(product.previousPrice)}
              </span>
            )}
          </div>

          {product.promotion && (
            <span className="mt-3 inline-flex w-fit rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
              {product.promotion}
            </span>
          )}

          {product.description && (
            <p className="mt-5 text-sm leading-6 text-neutral-600">{product.description}</p>
          )}

          <a
            href={product.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackOutboundClick(product.brand, product.link, 'ecommerce')}
            className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            Ver en la tienda
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
