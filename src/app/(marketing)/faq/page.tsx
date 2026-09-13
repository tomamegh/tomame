import { whatsappHref } from "@/components/layout/marketing/links";
import { getMarketingSettings } from "@/features/marketing/services";
import { FAQPage } from "./faq-page";

/**
 * `/faq` — still the pre-redesign screen (Phase F rebuilds it on the v2
 * design), and linked from the new nav. This server wrapper resolves the
 * WhatsApp CTA from `site_settings.whatsapp_number` instead of the hardcoded
 * `wa.me/233000000000` that was there before.
 */
export default async function FAQRoute() {
  const settings = await getMarketingSettings();
  return <FAQPage whatsappHref={whatsappHref(settings.whatsappNumber)} />;
}
