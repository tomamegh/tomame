import { whatsappHref } from "@/components/layout/marketing/links";
import { getMarketingSettings } from "@/features/marketing/services";
import { ContactPage } from "./contact-page";

/**
 * `/contact` — still the pre-redesign screen (Phase F rebuilds it on the v2
 * design). This server wrapper exists for one reason: the "Join on WhatsApp"
 * button used to point at a hardcoded `wa.me/233000000000`, which is not a
 * Tomame number. It now resolves from `site_settings.whatsapp_number`, the same
 * row the footer and Home's "Ask a buyer" card read, so there is one number to
 * change and no dead link when it changes.
 */
export default async function ContactRoute() {
  const settings = await getMarketingSettings();
  return <ContactPage whatsappHref={whatsappHref(settings.whatsappNumber)} />;
}
