import { useState } from 'react';
import { Heart, Sparkles, Flame } from 'lucide-react';
import JoinBrandModal from '@/components/JoinBrandModal';

export type View = 'explore' | 'brands' | 'favorites' | 'about';

interface Props {
  view: View;
  favoritesCount: number;
  onPromotionsClick: () => void;
  onBrandsClick: () => void;
  onExploreClick: () => void;
  onFavoritesClick: () => void;
  onAboutClick: () => void;
}

export default function Header({
  view,
  favoritesCount,
  onPromotionsClick,
  onBrandsClick,
  onExploreClick,
  onFavoritesClick,
  onAboutClick,
}: Props) {
  const [joinOpen, setJoinOpen] = useState(false);
  const navButton = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`relative py-1 transition hover:text-neutral-900 ${
        active ? 'font-semibold text-neutral-900' : 'text-neutral-600'
      }`}
    >
      {label}
      {active && (
        <span className="absolute -bottom-[1px] left-0 right-0 h-0.5 rounded-full bg-emerald-500" />
      )}
    </button>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <button onClick={onExploreClick} className="flex items-center gap-2 shrink-0">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-900 text-white">
            <Sparkles className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="text-lg font-bold tracking-tight text-neutral-900">
            INDIE<span className="text-emerald-500">HUB</span>
          </span>
        </button>

        <nav className="hidden items-center gap-7 text-sm font-medium text-neutral-600 md:flex">
          {navButton('Explorar', view === 'explore', onExploreClick)}
          {navButton('Marcas', view === 'brands', onBrandsClick)}
          {navButton('Favoritos', view === 'favorites', onFavoritesClick)}
          {navButton('Quiénes somos', view === 'about', onAboutClick)}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onFavoritesClick}
            aria-label="Mis favoritos"
            className={`relative grid h-9 w-9 place-items-center rounded-full transition active:scale-95 ${
              view === 'favorites'
                ? 'bg-red-50 text-red-500 ring-1 ring-red-200'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-red-500'
            }`}
          >
            <Heart className="h-4 w-4" fill={favoritesCount > 0 ? 'currentColor' : 'none'} />
            {favoritesCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {favoritesCount}
              </span>
            )}
          </button>
          <button
            onClick={onPromotionsClick}
            className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-100 active:scale-[0.98] sm:px-4"
          >
            <Flame className="h-4 w-4" />
            <span className="hidden sm:inline">Promociones</span>
          </button>
          <button
            onClick={() => setJoinOpen(true)}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98] sm:px-5"
          >
            Sumá tu marca gratis
          </button>
        </div>
      </div>

      <nav className="flex items-center justify-center gap-6 border-t border-neutral-100 py-2 text-sm font-medium text-neutral-600 md:hidden">
        {navButton('Explorar', view === 'explore', onExploreClick)}
        {navButton('Marcas', view === 'brands', onBrandsClick)}
        {navButton('Favoritos', view === 'favorites', onFavoritesClick)}
        {navButton('Quiénes somos', view === 'about', onAboutClick)}
      </nav>

      <JoinBrandModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </header>
  );
}
