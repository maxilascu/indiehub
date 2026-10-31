import { Heart } from 'lucide-react';

interface Props {
  active: boolean;
  onClick: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export default function FavoriteButton({ active, onClick, className = '', size = 'sm' }: Props) {
  const dimensions = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onClick();
      }}
      aria-label={active ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      aria-pressed={active}
      className={`grid place-items-center rounded-full backdrop-blur-sm transition active:scale-90 ${dimensions} ${
        active
          ? 'bg-white text-red-500 shadow-sm ring-1 ring-red-100'
          : 'bg-white/70 text-neutral-500 hover:bg-white hover:text-red-500'
      } ${className}`}
    >
      <Heart className={icon} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
