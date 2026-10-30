import type { ReactNode } from 'react';
import { Home, Truck, X } from 'lucide-react';
import LocationSelects from '@/components/LocationSelects';
import type { BrandLocationFilters } from '@/lib/brandLocation';

interface Props {
  filters: BrandLocationFilters;
  provinceOptions: string[];
  cityOptions: string[];
  resultCount: number;
  onChange: (filters: BrandLocationFilters) => void;
}

export default function BrandLocationFilter({
  filters,
  provinceOptions,
  cityOptions,
  resultCount,
  onChange,
}: Props) {
  const hasActiveFilters =
    Boolean(filters.province) || filters.storeOnly || filters.nationwideOnly;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200/80 sm:p-5">
      <LocationSelects
        province={filters.province}
        city={filters.city}
        provinceOptions={provinceOptions}
        cityOptions={cityOptions}
        onChange={(location) => onChange({ ...filters, ...location })}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterChip
          active={filters.storeOnly}
          onClick={() => onChange({ ...filters, storeOnly: !filters.storeOnly })}
          icon={<Home className="h-3.5 w-3.5" />}
          label="Tienda Física / Showroom"
        />
        <FilterChip
          active={filters.nationwideOnly}
          onClick={() => onChange({ ...filters, nationwideOnly: !filters.nationwideOnly })}
          icon={<Truck className="h-3.5 w-3.5" />}
          label="Envío a todo el país"
        />
        {hasActiveFilters && (
          <button
            onClick={() =>
              onChange({ province: '', city: '', storeOnly: false, nationwideOnly: false })
            }
            className="ml-auto flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      <p className="mt-3 text-xs font-medium text-neutral-400">
        {resultCount} {resultCount === 1 ? 'marca' : 'marcas'} disponibles
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95 ${
        active
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
