import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import type { GeoArea, UserLocation } from '@/lib/brandLocation';
import { reverseGeocode } from '@/lib/reverseGeocode';

interface Props {
  userLocation: UserLocation | null;
  onLocate: (location: UserLocation) => void;
  onClear: () => void;
}

const EMPTY_AREA: GeoArea = { province: '', city: '', partido: '' };
const UNIDENTIFIED_MESSAGE = 'No pudimos identificar tu zona. Elegí provincia y ciudad manualmente.';

export default function UserLocationButton({ userLocation, onLocate, onClear }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocate = () => {
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        let area: GeoArea = EMPTY_AREA;
        try {
          area = await reverseGeocode(lat, lng);
        } catch {
          // Zone stays empty; the user can pick province and city manually.
        }
        onLocate({ lat, lng, ...area });
        if (!area.province && !area.city) setError(UNIDENTIFIED_MESSAGE);
        setLoading(false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Permiso denegado. Elegí provincia y ciudad manualmente.'
            : 'No pudimos obtener tu ubicación.'
        );
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <div>
      {userLocation ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {[userLocation.city, userLocation.province].filter(Boolean).join(', ') ||
                'Ubicación activa'}
            </span>
          </span>
          <button
            onClick={onClear}
            className="shrink-0 text-xs font-medium text-emerald-600 underline-offset-2 hover:underline"
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          onClick={handleLocate}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-60"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          {loading ? 'Obteniendo ubicación...' : 'Usar mi ubicación'}
        </button>
      )}
      {error && <p className="mt-1.5 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
