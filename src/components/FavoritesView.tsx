import { useState } from 'react';
import { Heart, ShoppingBag } from 'lucide-react';
import type { Product, Brand } from '@/data/products';
import ProductGrid from '@/components/ProductGrid';
import { useFavoriteProducts, useFavoriteBrands } from '@/hooks/useFavorites';

interface Props {
  products: Product[];
  brands: Brand[];
  onSelectProduct: (product: Product) => void;
  onViewProducts: (brand: string) => void;
}

type Tab = 'products' | 'brands';

export default function FavoritesView({ products, brands, onSelectProduct, onViewProducts }: Props) {
  const [tab, setTab] = useState<Tab>('products');
  const { favorites: productKeys, toggle: toggleProduct, isFavorite: isProductFavorite } = useFavoriteProducts();
  const { favorites: brandKeys, toggle: toggleBrand } = useFavoriteBrands();

  const favoriteProducts = products.filter((p) => productKeys.includes(`${p.brand}::${p.name}`));
  const favoriteBrands = brands.filter((b) => brandKeys.includes(b.name));

  const tabButton = (label: string, count: number, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-neutral-900 text-white shadow-sm'
          : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-900'
      }`}
    >
      {label}
      <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold ${
        active ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'
      }`}>
        {count}
      </span>
    </button>
  );

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
          Tu colección personal
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Mis Favoritos
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
          Los productos y marcas que guardaste, siempre a mano. Se guardan en este navegador.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabButton('Productos favoritos', favoriteProducts.length, tab === 'products', () => setTab('products'))}
        {tabButton('Marcas favoritas', favoriteBrands.length, tab === 'brands', () => setTab('brands'))}
      </div>

      {tab === 'products' && (
        favoriteProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-20 text-center">
            <Heart className="h-12 w-12 text-neutral-200" />
            <p className="mt-4 text-sm font-medium text-neutral-600">
              Aún no guardaste ningún producto favorito
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Explorá el catálogo y tocá el corazón en una tarjeta para guardarlo.
            </p>
          </div>
        ) : (
          <ProductGrid
            products={favoriteProducts}
            loading={false}
            error={null}
            onSelectProduct={onSelectProduct}
            isFavorite={isProductFavorite}
            onToggleFavorite={toggleProduct}
          />
        )
      )}

      {tab === 'brands' && (
        favoriteBrands.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-20 text-center">
            <Heart className="h-12 w-12 text-neutral-200" />
            <p className="mt-4 text-sm font-medium text-neutral-600">
              Aún no guardaste ninguna marca favorita
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Explorá las marcas y tocá el corazón en el perfil de una marca para guardarla.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteBrands.map((brand) => (
              <article key={brand.id} className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/80 transition duration-300 hover:shadow-lg hover:shadow-neutral-900/10">
                <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100">
                  <img
                    src={brand.logo}
                    alt={`Logo de ${brand.name}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-neutral-950/55 via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-4 text-lg font-bold text-white drop-shadow-sm">
                    {brand.name}
                  </span>
                  <button
                    onClick={() => toggleBrand(brand)}
                    className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white text-red-500 shadow-sm ring-1 ring-red-100 transition active:scale-90"
                    aria-label="Quitar de favoritos"
                  >
                    <Heart className="h-4 w-4" fill="currentColor" />
                  </button>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-sm leading-6 text-neutral-600 line-clamp-2">
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
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-neutral-100 px-4 py-2.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-200 hover:text-neutral-900"
                      >
                        Ver tienda
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      )}
    </main>
  );
}
