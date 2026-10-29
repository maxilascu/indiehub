import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Compass, MousePointerClick, Sparkles, X, Zap } from 'lucide-react';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { trackOutboundClick } from '@/lib/analytics';
import { WHATSAPP_URL } from '@/lib/contact';

interface Props {
  open: boolean;
  onClose: () => void;
}

const benefits = [
  {
    icon: MousePointerClick,
    title: 'Tráfico directo',
    description:
      'Redirigimos a los compradores directo a tu Instagram o tienda online.',
  },
  {
    icon: Zap,
    title: '100% Gratuito',
    description:
      'Sin costos de inscripción, mantenimientos ni comisiones.',
  },
  {
    icon: Compass,
    title: 'Visibilidad focalizada',
    description:
      'Filtros por ubicación, estilo y prendas para que te encuentren rápido.',
  },
];

export default function JoinBrandModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-brand-title"
        onClick={(event) => event.stopPropagation()}
        className="relative my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-600"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            Sumá tu marca
          </span>
          <h2
            id="join-brand-title"
            className="mt-3.5 text-2xl font-bold leading-tight tracking-tight text-neutral-900"
          >
            Llevá tu marca al circuito independiente
          </h2>
          <p className="mt-2.5 text-sm leading-6 text-neutral-500">
            Sumá tu showroom o marca de autor al catálogo y conectá con nuevos
            clientes sin pagar comisiones por venta.
          </p>
        </div>

        <ul className="space-y-3.5">
          {benefits.map((benefit) => (
            <li key={benefit.title} className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <benefit.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-neutral-900">
                  {benefit.title}
                </p>
                <p className="mt-0.5 text-sm leading-5 text-neutral-500">
                  {benefit.description}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOutboundClick('IndieHub', WHATSAPP_URL, 'whatsapp')}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.98]"
        >
          <WhatsAppIcon />
          Hablar por WhatsApp para sumarme
        </a>

        <p className="mt-3 text-center text-xs leading-5 text-neutral-400">
          Te pediremos solo el nombre de tu marca, logo, ubicación y catálogo
          para cargarte en el día.
        </p>
      </div>
    </div>,
    document.body
  );
}
