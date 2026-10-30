interface LocationSelection {
  province: string;
  city: string;
}

interface Props {
  province: string;
  city: string;
  provinceOptions: string[];
  cityOptions: string[];
  onChange: (location: LocationSelection) => void;
}

const selectClass =
  'w-full rounded-xl border-0 bg-neutral-100 px-3.5 py-3 text-sm font-medium text-neutral-800 outline-none ring-1 ring-transparent transition focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:text-neutral-400';

export default function LocationSelects({
  province,
  city,
  provinceOptions,
  cityOptions,
  onChange,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
          Provincia
        </span>
        <select
          value={province}
          onChange={(event) => onChange({ province: event.target.value, city: '' })}
          className={selectClass}
        >
          <option value="">Todas las provincias</option>
          {provinceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
          Ciudad
        </span>
        <select
          value={city}
          disabled={!province}
          onChange={(event) => onChange({ province, city: event.target.value })}
          className={selectClass}
        >
          <option value="">
            {province ? 'Todas las ciudades' : 'Elegí una provincia primero'}
          </option>
          {cityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
