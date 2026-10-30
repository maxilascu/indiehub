import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import Header, { type View } from '@/components/Header';
import Hero from '@/components/Hero';
import PromotionsBanner from '@/components/PromotionsBanner';
import BrandsGrid from '@/components/BrandsGrid';
import FiltersPanel, {
  countActiveFilters,
  type FilterValues,
  type SortOption,
} from '@/components/FiltersPanel';
import ProductGrid from '@/components/ProductGrid';
import ProductDetailModal from '@/components/ProductDetailModal';
import AboutView from '@/components/AboutView';
import AboutFooter from '@/components/AboutFooter';
import {
  fetchBrands,
  fetchProducts,
  extractUniqueValues,
  type Product,
  type Brand,
} from '@/data/products';
import {
  filterBrandsByLocation,
  getCityOptions,
  getProvinceOptions,
} from '@/lib/brandLocation';

const DEFAULT_SORT: SortOption = 'recent';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandsError, setBrandsError] = useState<string | null>(null);
  const [view, setView] = useState<View>('explore');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceLimits, setPriceLimits] = useState({ min: 0, max: 0 });

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterValues>({
    category: 'Todos',
    gender: 'Todos',
    styles: [],
    province: '',
    city: '',
    storeOnly: false,
    shippingOnly: false,
    minPrice: 0,
    maxPrice: 0,
    sort: DEFAULT_SORT,
  });
  const [draftFilters, setDraftFilters] = useState<FilterValues>(filters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchProducts();
        if (!cancelled) {
          const prices = data.map((product) => product.price).filter((price) => price > 0);
          const limits = {
            min: prices.length ? Math.min(...prices) : 0,
            max: prices.length ? Math.max(...prices) : 0,
          };
          setProducts(data);
          setPriceLimits(limits);
          setFilters((current) => ({
            ...current,
            minPrice: limits.min,
            maxPrice: limits.max,
          }));
          setDraftFilters((current) => ({
            ...current,
            minPrice: limits.min,
            maxPrice: limits.max,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error desconocido');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBrandsLoading(true);
        setBrandsError(null);
        const data = await fetchBrands();
        if (!cancelled) setBrands(data);
      } catch (err) {
        if (!cancelled) {
          setBrandsError(err instanceof Error ? err.message : 'Error desconocido');
        }
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const promoProducts = useMemo(
    () => products.filter((product) => product.promotion !== ''),
    [products]
  );
  const categories = useMemo(
    () => extractUniqueValues(products, 'category'),
    [products]
  );
  const genders = useMemo(
    () => extractUniqueValues(products, 'gender'),
    [products]
  );
  const styles = useMemo(
    () => extractUniqueValues(products, 'style'),
    [products]
  );
  const provinceOptions = useMemo(() => getProvinceOptions(brands), [brands]);
  const cityOptions = useMemo(
    () => getCityOptions(brands, draftFilters.province),
    [brands, draftFilters.province]
  );

  const categoryOptions = Array.from(
    new Set(['Todos', 'Buzos', 'Camperas', 'Pantalones', 'Remeras', 'Accesorios', ...categories])
  );
  const genderOptions = Array.from(new Set(['Todos', 'Hombre', 'Mujer', 'Unisex', ...genders]));

  const filterProducts = (values: FilterValues): Product[] => {
    const search = query.trim().toLowerCase();
    const locationBrands = values.province || values.storeOnly || values.shippingOnly
      ? new Set(
          filterBrandsByLocation(brands, {
            province: values.province,
            city: values.city,
            storeOnly: values.storeOnly,
            shippingOnly: values.shippingOnly,
          }).map((brand) => brand.name)
        )
      : null;
    const result = products.filter((product) => {
      const matchesBrand = !selectedBrand || product.brand === selectedBrand;
      const matchesCategory =
        values.category === 'Todos' || product.category === values.category;
      const matchesGender =
        values.gender === 'Todos' || product.gender === values.gender;
      const matchesStyle =
        values.styles.length === 0 || values.styles.includes(product.style);
      const matchesLocation = !locationBrands || locationBrands.has(product.brand);
      const matchesPrice =
        product.price >= values.minPrice && product.price <= values.maxPrice;
      const matchesSearch =
        search === '' ||
        product.name.toLowerCase().includes(search) ||
        product.brand.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search) ||
        product.style.toLowerCase().includes(search) ||
        product.gender.toLowerCase().includes(search) ||
        (product.location || '').toLowerCase().includes(search);

      return (
        matchesBrand &&
        matchesCategory &&
        matchesGender &&
        matchesStyle &&
        matchesLocation &&
        matchesPrice &&
        matchesSearch
      );
    });

    return [...result].sort((a, b) => {
      if (values.sort === 'price-asc') return a.price - b.price;
      if (values.sort === 'price-desc') return b.price - a.price;
      if (values.sort === 'promotions') {
        return Number(Boolean(b.promotion)) - Number(Boolean(a.promotion));
      }
      return b.id - a.id;
    });
  };

  const filtered = useMemo(
    () => filterProducts(filters),
    [products, brands, query, filters, selectedBrand]
  );

  const activeFilterCount =
    countActiveFilters(filters, priceLimits.min, priceLimits.max) +
    Number(Boolean(selectedBrand));

  const goToBrands = () => setView('brands');
  const goToExplore = () => setView('explore');
  const goToAbout = () => setView('about');

  const handleViewProducts = (brand: string) => {
    setSelectedBrand(brand);
    setView('explore');
  };

  const clearBrandFilter = () => setSelectedBrand('');

  const handleHeaderPromotions = () => {
    setView('explore');
    requestAnimationFrame(() => {
      document
        .getElementById('promotions-banner')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    const cleared: FilterValues = {
      category: 'Todos',
      gender: 'Todos',
      styles: [],
      province: '',
      city: '',
      storeOnly: false,
      shippingOnly: false,
      minPrice: priceLimits.min,
      maxPrice: priceLimits.max,
      sort: DEFAULT_SORT,
    };
    setFilters(cleared);
    setDraftFilters(cleared);
    setSelectedBrand('');
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <Header
        view={view}
        onPromotionsClick={handleHeaderPromotions}
        onBrandsClick={goToBrands}
        onExploreClick={goToExplore}
        onAboutClick={goToAbout}
      />

      {view === 'explore' && (
        <>
          <Hero query={query} onQueryChange={setQuery} />

          <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
            <div id="promotions-banner" className="mt-2 scroll-mt-20">
              <PromotionsBanner
                products={promoProducts}
                loading={loading}
                onSelectProduct={setSelectedProduct}
              />
            </div>

            {selectedBrand && (
              <div className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                <p className="flex-1 text-sm font-semibold text-emerald-800">
                  Mostrando productos de <span className="font-bold">{selectedBrand}</span>
                </p>
                <button
                  onClick={clearBrandFilter}
                  className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Ver todo
                </button>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-500">
                {loading
                  ? 'Cargando...'
                  : `${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'}`}
              </h2>
              <button
                onClick={openFilters}
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm ring-1 ring-neutral-200 transition hover:ring-neutral-300 active:scale-[0.98]"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            <div className="mt-4">
              <ProductGrid
                products={filtered}
                loading={loading}
                error={error}
                onSelectProduct={setSelectedProduct}
              />
            </div>
          </main>
        </>
      )}

      {view === 'brands' && (
        <main className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
          <BrandsGrid
            brands={brands}
            loading={brandsLoading}
            error={brandsError}
            onViewProducts={handleViewProducts}
          />
        </main>
      )}

      {view === 'about' && <AboutView />}

      <ProductDetailModal
        product={selectedProduct}
        brands={brands}
        onClose={() => setSelectedProduct(null)}
        onViewBrand={handleViewProducts}
      />

      <FiltersPanel
        open={filtersOpen}
        values={draftFilters}
        categoryOptions={categoryOptions}
        genderOptions={genderOptions}
        styleOptions={styles}
        provinceOptions={provinceOptions}
        cityOptions={cityOptions}
        minPriceLimit={priceLimits.min}
        maxPriceLimit={priceLimits.max}
        onChange={setDraftFilters}
        onApply={applyFilters}
        onClear={clearFilters}
        onClose={() => setFiltersOpen(false)}
      />

      {view === 'about' ? (
        <AboutFooter />
      ) : (
        <footer className="border-t border-neutral-200 py-10 text-center text-sm text-neutral-400">
          <p>
            INDIE<span className="text-emerald-500">HUB</span> · Hecho para las
            marcas independientes de Argentina
          </p>
        </footer>
      )}
    </div>
  );
}
