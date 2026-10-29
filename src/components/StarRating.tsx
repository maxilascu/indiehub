import { Star } from 'lucide-react';

interface Props {
  value: number;
  onChange?: (value: number) => void;
  sizeClass?: string;
}

const STARS = [1, 2, 3, 4, 5];

export default function StarRating({ value, onChange, sizeClass = 'h-4 w-4' }: Props) {
  const rounded = Math.round(value);

  return (
    <div className="flex items-center gap-0.5">
      {STARS.map((star) => {
        const icon = (
          <Star
            className={`${sizeClass} ${star <= rounded ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`}
          />
        );

        if (!onChange) {
          return <span key={star}>{icon}</span>;
        }

        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            aria-label={`${star} ${star === 1 ? 'estrella' : 'estrellas'}`}
            className="rounded transition hover:scale-110 active:scale-95"
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
