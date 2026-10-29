import { Search } from 'lucide-react';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
}

export default function Hero({ query, onQueryChange }: Props) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50/60 via-white to-white" />
      <div
        className="absolute -top-24 right-0 -z-10 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl"
        aria-hidden
      />

      <div className="mx-auto max-w-3xl px-4 pt-16 pb-10 text-center sm:pt-24 sm:pb-14 lg:pt-28">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
          +120 marcas independientes
        </span>

        <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
          Descubrí marcas{' '}
          <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
            independientes
          </span>{' '}
          en un solo lugar
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base text-neutral-600 sm:text-lg">
          Buscá, compará y comprá directamente a las marcas. Sin intermediarios,
          sin sellos de más.
        </p>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-2xl bg-white p-2 shadow-lg shadow-neutral-900/5 ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-emerald-500"
        >
          <Search className="ml-2 h-5 w-5 shrink-0 text-neutral-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscá buzo oversized, jean cargo, remera..."
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none sm:text-base"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98] sm:px-6"
          >
            Buscar
          </button>
        </form>
      </div>
    </section>
  );
}
