import type { ReactNode } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import LocationSelects from '@/components/LocationSelects';
import UserLocationButton from '@/components/UserLocationButton';
import {
  resolveServiceArea,
  type ShippingCoverage,
  type UserLocation,
} from '@/lib/brandLocation';

export type SortOption = 'recent' | 'price-asc' | 'price-desc' | 'promotions';
export type StoreType = 'all' | 'online' | 'physical';

export interface FilterValues {
  category: string;
  gender: string;
  styles: string[];
  province: string;
  city: string;
  storeType: StoreType;
  maxDistance: number;
  shippingCoverage: ShippingCoverage;
  userLocation: UserLocation | null;
  minPrice: number;
  maxPrice: number;
  sort: SortOption;
}

const SHIPPING_COVERAGE_OPTIONS: { value: ShippingCoverage; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
];

export function countActiveFilters(values: FilterValues, priceMin: number, priceMax: number): number {
  return (
    Number(values.category !== 'Todos') +
    Number(values.gender !== 'Todos') +
    Number(values.styles.length > 0) +
    Number(values.province !== '') +
    Number(values.storeType !== 'all') +
    Number(values.storeType === 'physical' && values.maxDistance < 50) +
    Number(values.shippingCoverage !== 'all' && resolveServiceArea(values) !== null) +
    Number(values.minPrice !== priceMin || values.maxPrice !== priceMax)
  );
}

interface Props {
  open: boolean;
  values: FilterValues;
  categoryOptions: string[];
  genderOptions: string[];
  styleOptions: string[];
  provinceOptions: string[];
  cityOptions: string[];
  minPriceLimit: number;
  maxPriceLimit: number;
  onChange: (values: FilterValues) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}

export default function FiltersPanel({
  open,
  values,
  categoryOptions,
  genderOptions,
  styleOptions,
  provinceOptions,
  cityOptions,
  minPriceLimit,
  maxPriceLimit,
  onChange,
  onApply,
  onClear,
  onClose,
}: Props) {
  const toggleStyle = (style: string) => {
    const styles = values.styles.includes(style)
      ? values.styles.filter((item) => item !== style)
      : [...values.styles, style];
    onChange({ ...values, styles });
  };

  const activeCount = countActiveFilters(values, minPriceLimit, maxPriceLimit);
  const serviceArea = resolveServiceArea(values);

  const selectStoreType = (storeType: StoreType) =>
    onChange({
      ...values,
      storeType,
      shippingCoverage: storeType === 'online' ? values.shippingCoverage : 'all',
    });

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-neutral-950/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        aria-label="Panel de filtros"
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:rounded-l-3xl ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-900 text-white">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-neutral-900">Filtros</h2>
              <p className="text-xs text-neutral-400">Personalizá tu búsqueda</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Cerrar filtros"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <FilterSection title="Tipo de prenda">
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((category) => (
                <button
                  key={category}
                  onClick={() => onChange({ ...values, category })}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95 ${
                    values.category === category
                      ? 'bg-neutral-900 text-white'
                      : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:ring-neutral-300'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Género">
            <div className="flex flex-wrap gap-2">
              {genderOptions.map((gender) => (
                <button
                  key={gender}
                  onClick={() => onChange({ ...values, gender })}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95 ${
                    values.gender === gender
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:ring-neutral-300'
                  }`}
                >
                  {gender}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Ordenar por">
            <select
              value={values.sort}
              onChange={(event) =>
                onChange({ ...values, sort: event.target.value as SortOption })
              }
              className="w-full rounded-xl border-0 bg-neutral-100 px-3.5 py-3 text-sm font-medium text-neutral-800 outline-none ring-1 ring-transparent transition focus:ring-2 focus:ring-emerald-500"
            >
              <option value="recent">Más recientes</option>
              <option value="price-asc">Precio: Menor a Mayor</option>
              <option value="price-desc">Precio: Mayor a Menor</option>
              <option value="promotions">Promociones primero</option>
            </select>
          </FilterSection>

          <FilterSection title="Estilo">
            <div className="grid grid-cols-2 gap-2">
              {styleOptions.map((style) => {
                const selected = values.styles.includes(style);
                return (
                  <button
                    key={style}
                    onClick={() => toggleStyle(style)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition ${
                      selected
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-neutral-50 text-neutral-600 ring-1 ring-neutral-100 hover:bg-neutral-100'
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        selected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-neutral-300 bg-white'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{style}</span>
                  </button>
                );
              })}
            </div>
          </FilterSection>

          <FilterSection title="Ubicación">
            <LocationSelects
              province={values.province}
              city={values.city}
              provinceOptions={provinceOptions}
              cityOptions={cityOptions}
              onChange={(location) => onChange({ ...values, ...location })}
            />
            <p className="mt-2 text-[11px] text-neutral-400">
              Muestra solo las marcas con local en la zona elegida.
            </p>
          </FilterSection>

          <FilterSection title="Tipo de tienda">
            <div className="flex flex-wrap gap-2">
              <OptionChip
                active={values.storeType === 'all'}
                onClick={() => selectStoreType('all')}
                label="Todos"
              />
              <OptionChip
                active={values.storeType === 'online'}
                onClick={() => selectStoreType('online')}
                label="Solo online"
              />
              <OptionChip
                active={values.storeType === 'physical'}
                onClick={() => selectStoreType('physical')}
                label="Local físico / Showroom"
              />
            </div>

            <div
              aria-hidden={values.storeType !== 'online'}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                values.storeType === 'online'
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="mt-4 space-y-4 rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-100">
                  <UserLocationButton
                    userLocation={values.userLocation}
                    onLocate={(location) => onChange({ ...values, userLocation: location })}
                    onClear={() => onChange({ ...values, userLocation: null })}
                  />
                  <div>
                    <p className="mb-2 text-xs font-semibold text-neutral-600">
                      ¿Realiza envíos a mi ubicación?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SHIPPING_COVERAGE_OPTIONS.map((option) => (
                        <OptionChip
                          key={option.value}
                          active={values.shippingCoverage === option.value}
                          onClick={() => onChange({ ...values, shippingCoverage: option.value })}
                          label={option.label}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-400">
                      {serviceArea
                        ? 'Sí muestra las marcas que llegan a tu zona. No muestra las que no llegan.'
                        : 'Usá tu ubicación o elegí provincia y ciudad en Ubicación.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {values.storeType === 'physical' && (
              <div className="mt-4 rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-100">
                <UserLocationButton
                  userLocation={values.userLocation}
                  onLocate={(location) => onChange({ ...values, userLocation: location })}
                  onClear={() => onChange({ ...values, userLocation: null })}
                />
                <div className="mt-4 flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600">
                    Distancia máxima
                  </label>
                  <span className="text-xs font-bold text-emerald-600">
                    {values.maxDistance} km
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={values.maxDistance}
                  onChange={(event) =>
                    onChange({ ...values, maxDistance: Number(event.target.value) })
                  }
                  className="mt-2 w-full accent-emerald-600"
                />
                <p className="mt-1 text-[11px] text-neutral-400">
                  {values.userLocation
                    ? 'Se filtran las marcas dentro del radio desde tu ubicación.'
                    : 'Usá tu ubicación para aplicar el radio.'}
                </p>
              </div>
            )}
          </FilterSection>

          <FilterSection title="Rango de precio">
            <div className="grid grid-cols-2 gap-3">
              <PriceInput
                label="Desde $"
                value={values.minPrice}
                min={minPriceLimit}
                max={values.maxPrice}
                onChange={(minPrice) => onChange({ ...values, minPrice })}
              />
              <PriceInput
                label="Hasta $"
                value={values.maxPrice}
                min={values.minPrice}
                max={maxPriceLimit}
                onChange={(maxPrice) => onChange({ ...values, maxPrice })}
              />
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
              Entre {formatPrice(minPriceLimit)} y {formatPrice(maxPriceLimit)}
            </p>
          </FilterSection>
        </div>

        <div className="border-t border-neutral-100 bg-white p-5 sm:p-6">
          <div className="flex gap-3">
            <button
              onClick={onClear}
              className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              Limpiar filtros
            </button>
            <button
              onClick={onApply}
              className="flex-[1.5] rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98]"
            >
              {activeCount > 0 ? `Aplicar filtros (${activeCount})` : 'Aplicar filtros'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-neutral-100 pb-5 pt-1 first:pt-0 last:border-0">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PriceInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-xl bg-neutral-100 px-3 py-2 ring-1 ring-transparent transition focus-within:ring-2 focus-within:ring-emerald-500">
      <span className="block text-[10px] font-medium text-neutral-400">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="mt-0.5 w-full bg-transparent text-sm font-semibold text-neutral-800 outline-none"
      />
    </label>
  );
}

function OptionChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95 ${
        active
          ? 'bg-neutral-900 text-white shadow-sm'
          : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:ring-neutral-300'
      }`}
    >
      {label}
    </button>
  );
}

function formatPrice(value: number): string {
  return `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)}`;
}
