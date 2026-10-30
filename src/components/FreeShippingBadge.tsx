import { Truck } from 'lucide-react';

export default function FreeShippingBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white/80 ${className}`}
    >
      <Truck className="h-3 w-3" />
      Envío Gratis
    </span>
  );
}
