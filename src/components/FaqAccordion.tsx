import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    question: '¿Cómo funciona la plataforma?',
    answer:
      'IndieHub reúne en un solo lugar las prendas de marcas independientes y de autor. Explorás por categoría, estilo, género, ubicación o precio, y cuando encontrás algo que te gusta, vas directo a la tienda de la marca.',
  },
  {
    question: '¿Puedo comprar directamente desde acá?',
    answer:
      'No. IndieHub no procesa pagos ni vende productos. Al tocar "Ver en la tienda" te redirigimos a la tienda oficial de cada marca, donde completás la compra con ellos.',
  },
  {
    question: '¿Tiene costo sumar mi marca?',
    answer:
      'No. Sumar tu marca es 100% gratuito en los primeros meses: no cobramos inscripción, mantenimiento ni comisiones por venta hasta demostrar un aumento de interacciones y ventas.',
  },
  {
    question: '¿Qué necesito para aparecer en la app?',
    answer:
      'Solo el nombre de tu marca, el logo, la ubicación y el catálogo. Con esos datos te cargamos en el día.',
  },
];

export default function FaqAccordion() {
  return (
    <div className="divide-y divide-neutral-200 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/80">
      {FAQS.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition duration-300 group-open:rotate-180" />
          </summary>
          <p className="px-5 pb-5 text-sm leading-6 text-neutral-600">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
