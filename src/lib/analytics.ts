declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type DestinationType = 'instagram' | 'ecommerce' | 'whatsapp';

export function trackOutgoingClick(brandName: string, destinationType: DestinationType): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'click_outbound', {
      brand_name: brandName,
      destination_type: destinationType,
      transport_type: 'beacon',
    });
  }
}
