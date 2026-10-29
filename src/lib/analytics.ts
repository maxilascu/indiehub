declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type ClickType = 'instagram' | 'ecommerce' | 'whatsapp';

export function trackOutboundClick(
  brandName: string,
  destinationUrl: string,
  clickType: ClickType
): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'outbound_brand_click', {
      brand_name: brandName,
      destination_url: destinationUrl,
      click_type: clickType,
    });
  }
}
