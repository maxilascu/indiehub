import { useState } from 'react';
import { ChevronDown, Ruler } from 'lucide-react';

const MEASUREMENTS = [
  { size: 'S', chest: '88 - 94', waist: '74 - 80', hip: '90 - 96' },
  { size: 'M', chest: '95 - 101', waist: '81 - 87', hip: '97 - 103' },
  { size: 'L', chest: '102 - 108', waist: '88 - 94', hip: '104 - 110' },
  { size: 'XL', chest: '109 - 115', waist: '95 - 101', hip: '111 - 117' },
];

const COLUMNS = [
  { key: 'size', label: 'Talle' },
  { key: 'chest', label: 'Pecho' },
  { key: 'waist', label: 'Cintura' },
  { key: 'hip', label: 'Cadera' },
] as const;

export default function SizeGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 transition hover:text-neutral-800"
      >
        <Ruler className="h-3 w-3" />
        Guía y tabla de talles
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-100">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
            Tabla estimativa de medidas (cm)
          </p>
          <table className="mt-2 w-full border-collapse text-left text-xs text-neutral-700 tabular-nums">
            <thead>
              <tr className="border-b border-neutral-200">
                {COLUMNS.map((column) => (
                  <th key={column.key} className="py-1.5 pr-2 font-semibold text-neutral-900">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEASUREMENTS.map((row) => (
                <tr key={row.size} className="border-b border-neutral-100 last:border-b-0">
                  <td className="py-1.5 pr-2 font-semibold text-neutral-900">{row.size}</td>
                  <td className="py-1.5 pr-2">{row.chest}</td>
                  <td className="py-1.5 pr-2">{row.waist}</td>
                  <td className="py-1.5 pr-2">{row.hip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-4 text-neutral-500">
            * Medidas corporales orientativas. El calce final puede variar según la moldería de la marca (oversize, regular o al cuerpo).
          </p>
        </div>
      )}
    </div>
  );
}
