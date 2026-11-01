import type { GeoArea } from '@/lib/brandLocation';

interface NominatimResponse {
  address?: {
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoArea> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    zoom: '10',
    addressdetails: '1',
    'accept-language': 'es',
    lat: String(lat),
    lon: String(lng),
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
  if (!response.ok) {
    throw new Error(`Error al identificar la zona (${response.status})`);
  }

  const json: NominatimResponse = await response.json();
  const address = json.address ?? {};
  return {
    province: address.state ?? '',
    city: address.city ?? address.town ?? address.village ?? address.municipality ?? '',
    partido: (address.county ?? '').replace(/^Partido de\s+/i, ''),
  };
}
