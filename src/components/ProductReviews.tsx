import { useMemo, useState, type FormEvent } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import StarRating from '@/components/StarRating';
import type { Product } from '@/data/products';
import { averageRating, getSimulatedReviews, type Review } from '@/lib/reviews';

function formatDaysAgo(days: number): string {
  if (days === 0) return 'Recién publicada';
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const months = Math.round(days / 30);
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export default function ProductReviews({ product }: { product: Product }) {
  const simulated = useMemo(() => getSimulatedReviews(product), [product]);
  const [submitted, setSubmitted] = useState<Review[]>([]);
  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reviews = [...submitted, ...simulated];
  const average = averageRating(reviews);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftRating === 0) {
      setError('Elegí una cantidad de estrellas para valorar.');
      return;
    }
    setSubmitted([
      {
        id: `submitted-${Date.now()}`,
        author: 'Vos',
        rating: draftRating,
        comment: draftComment.trim(),
        daysAgo: 0,
      },
      ...submitted,
    ]);
    setDraftRating(0);
    setDraftComment('');
    setError(null);
  };

  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <h3 className="text-lg font-bold text-neutral-900">Reseñas</h3>
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-neutral-50 p-5 ring-1 ring-neutral-200/80">
          <p className="text-4xl font-bold tracking-tight text-neutral-900">
            {average.toFixed(1)}
          </p>
          <div>
            <StarRating value={average} sizeClass="h-4 w-4" />
            <p className="mt-1 text-xs text-neutral-500">
              {reviews.length} {reviews.length === 1 ? 'valoración' : 'valoraciones'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-neutral-200/80">
          <p className="text-sm font-semibold text-neutral-900">Dejá tu valoración</p>
          <div className="mt-3">
            <StarRating value={draftRating} onChange={setDraftRating} sizeClass="h-6 w-6" />
          </div>
          <textarea
            value={draftComment}
            onChange={(event) => setDraftComment(event.target.value)}
            maxLength={280}
            rows={3}
            placeholder="Contá tu experiencia con la prenda (opcional)"
            className="mt-3 w-full resize-none rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 ring-1 ring-neutral-200 placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <button
            type="submit"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
          >
            <Send className="h-4 w-4" />
            Publicar valoración
          </button>
        </form>
      </div>

      <ul className="space-y-3">
        {reviews.map((review) => (
          <li key={review.id} className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200/80">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600">
                  {review.author.charAt(0)}
                </span>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{review.author}</p>
                  <p className="text-[11px] text-neutral-400">{formatDaysAgo(review.daysAgo)}</p>
                </div>
              </div>
              <StarRating value={review.rating} sizeClass="h-3.5 w-3.5" />
            </div>
            {review.comment && (
              <p className="mt-3 flex gap-2 text-sm leading-6 text-neutral-600">
                <MessageSquare className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-300" />
                {review.comment}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
