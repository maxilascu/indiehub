import type { Product } from '@/data/products';

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  daysAgo: number;
}

const AUTHORS = [
  'Valentina M.',
  'Lucas R.',
  'Camila P.',
  'Mateo G.',
  'Sofía L.',
  'Tomás F.',
  'Julieta S.',
  'Franco A.',
];

const COMMENTS = [
  'Calidad de tela excelente, se siente muy bien puesta.',
  'Llegó tal cual se ve en la foto. Muy contenta con la compra.',
  'Diseño único, no se parece a nada que haya visto en otras tiendas.',
  'El talle quedó un poco grande, pero la prenda es hermosa.',
  'Buena relación entre precio y calidad. La recomiendo.',
  'Los detalles de costura son impecables.',
  'El color es aún mejor en persona.',
  'Entrega rápida y muy buena atención de la marca.',
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function getSimulatedReviews(product: Product): Review[] {
  const random = createRandom(hashString(`${product.brand}${product.name}`));
  const count = 3 + Math.floor(random() * 4);

  return Array.from({ length: count }, (_, index) => ({
    id: `simulated-${index}`,
    author: AUTHORS[Math.floor(random() * AUTHORS.length)],
    rating: 3 + Math.floor(random() * 3),
    comment: COMMENTS[Math.floor(random() * COMMENTS.length)],
    daysAgo: 2 + Math.floor(random() * 120),
  }));
}

export function averageRating(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
}
