import { Mail, MessageCircle } from 'lucide-react';
import { SOCIAL_LINKS, SUPPORT_EMAIL, WHATSAPP_URL } from '@/lib/contact';

export default function AboutFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">
            INDIE<span className="text-emerald-500">HUB</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-neutral-500">
            Hecho para las marcas independientes de Argentina.
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-400">
            Contacto
          </p>
          <ul className="mt-4 space-y-3 text-sm font-medium text-neutral-700">
            <li>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-emerald-600"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </li>
            {SUPPORT_EMAIL && (
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="inline-flex items-center gap-2 transition hover:text-emerald-600"
                >
                  <Mail className="h-4 w-4" />
                  {SUPPORT_EMAIL}
                </a>
              </li>
            )}
          </ul>
        </div>

        {SOCIAL_LINKS.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-400">
              Redes
            </p>
            <ul className="mt-4 space-y-3 text-sm font-medium text-neutral-700">
              {SOCIAL_LINKS.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition hover:text-emerald-600"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} IndieHub. Todos los derechos reservados.
      </div>
    </footer>
  );
}
