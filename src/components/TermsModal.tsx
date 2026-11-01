import { useEffect } from 'react';
import { Shield, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: '1. Aceptación de los términos',
    body: 'Al acceder y utilizar IndieHub, aceptás los presentes Términos y Condiciones en su totalidad. Si no estás de acuerdo con alguna parte, te pedimos que no utilices la plataforma.',
  },
  {
    title: '2. Descripción del servicio',
    body: 'IndieHub es un directorio y vitrina de marcas independientes de Argentina. Funcionamos como un escaparate que conecta a las marcas con sus clientes. No intervenimos en la transacción ni en la logística de las compras, que se realizan directamente en los canales de cada marca.',
  },
  {
    title: '3. Responsabilidad sobre las marcas y productos',
    body: 'La información de cada marca (descripciones, precios, imágenes, talles, promociones y envíos) es provista por las propias marcas. IndieHub no se responsabiliza por inaccuraciones, desabastecimiento, cambios de precio o diferencias en la moldería. Ante cualquier duda sobre un producto, recomendamos contactar directamente a la tienda.',
  },
  {
    title: '4. Favoritos y almacenamiento local',
    body: 'La función de favoritos se guarda exclusivamente en tu navegador mediante localStorage. No requerimos inicio de sesión ni procesamos datos personales para esta función. Si limpiás los datos del navegador, tus favoritos se borrarán.',
  },
  {
    title: '5. Propiedad intelectual',
    body: 'Los logos, nombres de marca y contenidos mostrados pertenecen a sus respectivos propietarios. El diseño y desarrollo de IndieHub, incluyendo su nombre e identidad visual, es propiedad del proyecto.',
  },
  {
    title: '6. Uso aceptable',
    body: 'Te comprometés a utilizar IndieHub de manera lícita, sin reproducir contenido de las marcas para fines comerciales sin autorización, ni realizar acciones que dañen la plataforma o a terceros.',
  },
  {
    title: '7. Modificaciones',
    body: 'Podemos actualizar estos términos en cualquier momento. Te recomendamos revisarlos periódicamente. El uso continuado de la plataforma después de cambios implica la aceptación de los nuevos términos.',
  },
];

const PRIVACY_SECTIONS = [
  {
    title: '1. Datos que recopilamos',
    body: 'IndieHub no solicita datos personales para navegar ni para usar la función de favoritos. Las reseñas que dejás en los productos se asocian a un nombre que elegís y se almacenan en nuestra base de datos para mostrarlas públicamente.',
  },
  {
    title: '2. Almacenamiento local',
    body: 'Tus favoritos se guardan en tu navegador con localStorage. Esta información no se envía a nuestros servidores ni se comparte con terceros.',
  },
  {
    title: '3. Enlaces externos',
    body: 'Al hacer clic en "Ver tienda" o en los links de Instagram de las marcas, salís de IndieHub y pasás a sitios de terceros. No nos responsabilizamos por las políticas de privacidad de esos sitios.',
  },
  {
    title: '4. Contacto',
    body: 'Si te comunicás con nosotros por WhatsApp o correo electrónico, usaremos esa información únicamente para responder tu consulta.',
  },
];

export default function TermsModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-900 text-white">
              <Shield className="h-4.5 w-4.5" />
            </span>
            <h2 id="terms-title" className="text-base font-bold text-neutral-900 sm:text-lg">
              Términos y Condiciones
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
              Términos y Condiciones
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Última actualización: 1 de noviembre de 2026
            </p>
            <div className="mt-4 space-y-4">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-neutral-900">{section.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">{section.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
              Política de Privacidad
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Cómo tratamos tus datos en IndieHub
            </p>
            <div className="mt-4 space-y-4">
              {PRIVACY_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-neutral-900">{section.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">{section.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-100 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
