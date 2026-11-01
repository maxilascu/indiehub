import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapPin, ShoppingBag, X } from 'lucide-react';
import type { Brand } from '@/data/products';

interface Props {
  open: boolean;
  brands: Brand[];
  userLocation: { lat: number; lng: number } | null;
  selectedBrand: string | null;
  onSelectBrand: (name: string) => void;
  onClose: () => void;
}

const ARGENTINA_CENTER: [number, number] = [-34.6037, -58.3816];

function createPinIcon(highlighted: boolean): L.DivIcon {
  const color = highlighted ? '#0f172a' : '#059669';
  return L.divIcon({
    className: 'indiehub-map-pin',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white" stroke="${color}" stroke-width="1.5"/></svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

function createUserIcon(): L.DivIcon {
  return L.divIcon({
    className: 'indiehub-map-user',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#0ea5e9;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function MapView({ open, brands, userLocation, selectedBrand, onSelectBrand, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const physicalBrands = useMemo(
    () => brands.filter((brand) => brand.hasStore && brand.lat != null && brand.lng != null),
    [brands]
  );

  useEffect(() => {
    if (!open || !containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: userLocation ?? ARGENTINA_CENTER,
        zoom: userLocation ? 12 : 5,
        scrollWheelZoom: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // User location marker
    if (userLocation) {
      const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: createUserIcon() })
        .addTo(mapRef.current)
        .bindPopup('Tu ubicación');
      markersRef.current.push(userMarker);
    }

    // Brand markers
    physicalBrands.forEach((brand) => {
      const marker = L.marker([brand.lat!, brand.lng!], {
        icon: createPinIcon(selectedBrand === brand.name),
      })
        .addTo(mapRef.current!)
        .bindPopup(
          `<div style="min-width:180px;">` +
          `<p style="font-weight:700;font-size:14px;margin:0 0 4px 0;color:#0f172a;">${brand.name}</p>` +
          `<p style="font-size:12px;margin:0 0 2px 0;color:#64748b;">${[brand.city, brand.province].filter(Boolean).join(', ')}</p>` +
          (brand.address ? `<p style="font-size:11px;margin:0 0 6px 0;color:#94a3b8;">${brand.address}</p>` : '') +
          `<button id="map-pin-${brand.id}" style="background:#0f172a;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;width:100%;">Ver productos</button>` +
          `</div>`
        );

      marker.on('popupopen', () => {
        const btn = document.getElementById(`map-pin-${brand.id}`);
        if (btn) {
          btn.onclick = () => onSelectBrand(brand.name);
        }
      });

      markersRef.current.push(marker);
    });

    // Fit bounds to show all markers
    if (physicalBrands.length > 0 && !userLocation) {
      const group = L.featureGroup(markersRef.current);
      mapRef.current.fitBounds(group.getBounds().pad(0.2));
    } else if (userLocation && physicalBrands.length > 0) {
      const group = L.featureGroup([...markersRef.current]);
      mapRef.current.fitBounds(group.getBounds().pad(0.2));
    }

    setTimeout(() => mapRef.current?.invalidateSize(), 100);
  }, [open, physicalBrands, userLocation, selectedBrand, onSelectBrand]);

  useEffect(() => {
    if (!open) {
      return () => {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
          markersRef.current = [];
        }
      };
    }
  }, [open]);

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

  const physicalCount = physicalBrands.length;

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
            <MapPin className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-neutral-900 sm:text-lg">Mapa de locales</h2>
            <p className="text-xs text-neutral-400">
              {physicalCount} {physicalCount === 1 ? 'marca con local físico' : 'marcas con local físico'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar mapa"
          className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" style={{ background: '#e5e7eb' }} />

        {physicalCount === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 text-center">
            <MapPin className="h-12 w-12 text-neutral-200" />
            <p className="mt-4 text-sm font-medium text-neutral-600">
              No hay marcas con local físico y coordenadas disponibles
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Las marcas sin coordenadas no aparecen en el mapa.
            </p>
          </div>
        )}
      </div>

      {physicalBrands.length > 0 && (
        <div className="border-t border-neutral-100 bg-white px-4 py-3 sm:px-6">
          <p className="mb-2 text-xs font-semibold text-neutral-500">
            Marcas en el mapa ({physicalBrands.length}):
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {physicalBrands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.setView([brand.lat!, brand.lng!], 15);
                    const marker = markersRef.current.find((m) => {
                      const latlng = m.getLatLng();
                      return Math.abs(latlng.lat - brand.lat!) < 0.0001 && Math.abs(latlng.lng - brand.lng!) < 0.0001;
                    });
                    marker?.openPopup();
                  }
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200"
              >
                <ShoppingBag className="h-3 w-3" />
                {brand.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
