import { Store, Compass, Layers, ArrowRight, Sparkles } from 'lucide-react';
import FaqAccordion from '@/components/FaqAccordion';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { trackOutboundClick } from '@/lib/analytics';
import { WHATSAPP_URL } from '@/lib/contact';

const valueProps = [
  {
    icon: Compass,
    title: 'Descubrí marcas nuevas',
    description:
      'Explorá propuestas de diseñadores y showrooms que no encontrás en las grandes cadenas.',
  },
  {
    icon: Store,
    title: 'Tiendas directas',
    description:
      'Cada producto te lleva a la tienda oficial de la marca, sin intermediarios.',
  },
  {
    icon: Layers,
    title: 'Navegación simple',
    description:
      'Filtrá por categoría, estilo, género, ubicación y precio para encontrar lo que buscás en segundos.',
  },
];

export default function AboutView() {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-white px-6 py-14 ring-1 ring-neutral-200/80 sm:px-12 sm:py-20">
        <div
          className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
            Quiénes somos
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-[1.15] tracking-tight text-neutral-900 sm:text-5xl">
            Agrupamos a las marcas independientes en un solo lugar
          </h1>
          <p className="mt-5 text-base leading-7 text-neutral-600 sm:text-lg">
            IndieHub nace para dar visibilidad a diseñadores, showrooms y marcas
            de autor locales. Reunimos sus catálogos en una sola app para que
            descubras propuestas únicas sin recorrer decenas de perfiles.
          </p>
        </div>
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl bg-neutral-900 p-7 text-white sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Nuestra misión
          </span>
          <p className="mt-4 text-lg font-semibold leading-7">
            Dar visibilidad a las marcas locales e independientes, conectándolas
            con quienes buscan prendas con identidad.
          </p>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Queremos que comprar diseño independiente sea tan simple como buscar
            en cualquier otra tienda.
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {valueProps.map((prop) => (
            <li
              key={prop.title}
              className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200/80 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-neutral-900/5"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <prop.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-bold text-neutral-900">{prop.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500">{prop.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-3xl bg-neutral-900 px-6 py-10 text-white sm:px-12 sm:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">
              ¿Tenés una marca?
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              Sumá tu marca al circuito independiente
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/70 sm:text-base">
              Llegá a nuevos clientes sin pagar comisiones por venta. Te pedimos
              solo el nombre, el logo, la ubicación y el catálogo para cargarte
              en el día.
            </p>
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackOutboundClick('IndieHub', WHATSAPP_URL, 'whatsapp')}
            className="flex shrink-0 items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            <WhatsAppIcon />
            Hablar por WhatsApp para sumarme
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
            Preguntas frecuentes
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Todo lo que necesitás saber
          </h2>
        </div>
        <FaqAccordion />
      </section>
    </main>
  );
}
