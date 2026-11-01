import { useMemo, useState } from 'react';
import { ArrowUpRight, Home, MapPin, ShoppingBag, Truck } from 'lucide-react';
import BrandLocationFilter from '@/components/BrandLocationFilter';
import FavoriteButton from '@/components/FavoriteButton';
import type { Brand } from '@/data/products';
import { trackOutboundClick } from '@/lib/analytics';
import {
  EMPTY_BRAND_LOCATION_FILTERS,
  filterBrandsByLocation,
  getCityOptions,
  getProvinceOptions,
  type BrandLocationFilters,
} from '@/lib/brandLocation';

interface Props {
  brands: Brand[];
  loading: boolean;
  error: string | null;
  onViewProducts: (brand: string) => void;
  isFavorite?: (brand: Brand) => boolean;
  onToggleFavorite?: (brand: Brand) => void;
}

export default function BrandsGrid({
  brands,
  loading,
  error,
  onViewProducts,
  isFavorite,
  onToggleFavorite,
}: Props) {
  const [locationFilters, setLocationFilters] = useState<BrandLocationFilters>(
    EMPTY_BRAND_LOCATION_FILTERS
  );
  const provinceOptions = useMemo(() => getProvinceOptions(brands), [brands]);
  const cityOptions = useMemo(
    () => getCityOptions(brands, locationFilters.province),
    [brands, locationFilters.province]
  );
  const visibleBrands = useMemo(
    () => filterBrandsByLocation(brands, locationFilters),
    [brands, locationFilters]
  );

  return (
    <section>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
          Comunidad independiente
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Marcas que inspiran
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
          Conocé las marcas, sus historias y las prendas que forman parte de IndieHub.
          Tocá una tarjeta para ver sus productos.
        </p>
      </div>

      {loading && (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-500">
          Cargando marcas...
        </p>
      )}
      {error && (
        <p className="rounded-2xl bg-red-50 p-8 text-center text-sm text-red-700">
          No pudimos cargar las marcas.
        </p>
      )}
      {!loading && !error && brands.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-500">
          Todavía no hay marcas para mostrar.
        </p>
      )}

      {!loading && !error && brands.length > 0 && (
        <div className="mb-6">
          <BrandLocationFilter
            filters={locationFilters}
            provinceOptions={provinceOptions}
            cityOptions={cityOptions}
            resultCount={visibleBrands.length}
            onChange={setLocationFilters}
          />
        </div>
      )}

      {!loading && !error && brands.length > 0 && visibleBrands.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-500">
          No hay marcas que coincidan con esa ubicación. Probá con otra provincia o ciudad.
        </p>
      )}

      {!loading && !error && visibleBrands.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleBrands.map((brand) => (
            <article
              key={brand.id}
              className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/80 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-neutral-900/10 hover:ring-neutral-300"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100">
                <img
                  src={brand.logo}
                  alt={`Logo de ${brand.name}`}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = FALLBACK_LOGO;
                  }}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-neutral-950/55 via-transparent to-transparent" />
                <span className="absolute bottom-3 left-4 text-lg font-bold text-white drop-shadow-sm">
                  {brand.name}
                </span>
                {onToggleFavorite && (
                  <FavoriteButton
                    active={Boolean(isFavorite?.(brand))}
                    onClick={() => onToggleFavorite(brand)}
                    size="md"
                    className="absolute right-3 top-3"
                  />
                )}
              </div>

              <div className="flex flex-1 flex-col p-4">
                {(brand.city || brand.province) && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <MapPin className="h-3.5 w-3.5" />
                    {[brand.city, brand.province].filter(Boolean).join(', ')}
                  </p>
                )}
                {(brand.hasStore || brand.hasShipping) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {brand.hasStore && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        <Home className="h-3 w-3" />
                        Showroom
                      </span>
                    )}
                    {brand.hasShipping && (
                      <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        <Truck className="h-3 w-3" />
                        Con envío
                      </span>
                    )}
                  </div>
                )}
                {brand.hasStore && brand.address && (
                  <p className="mt-2 text-xs text-neutral-500">{brand.address}</p>
                )}
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-600">
                  {brand.description || 'Una marca independiente para descubrir.'}
                </p>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => onViewProducts(brand.name)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98]"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Ver productos
                  </button>
                  {brand.instagram && (
                    <a
                      href={brand.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackOutboundClick(brand.name, brand.instagram, 'instagram')}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-200 hover:text-neutral-900"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Ver tienda
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const FALLBACK_LOGO =
  'https://images.pexels.com/photos/994523/pexels-photo-994523.jpeg?auto=compress&cs=tinysrgb&w=900';
