import { ProductScreen } from "@/features/mobile/components/product-screen";
import { PriceHandoff } from "@/features/mobile/components/price-handoff";
import { shortLink } from "@/features/mobile/format";

/**
 * `/m/price?url=` — any product link (a price-drop alert, a watch): the product view straight
 * away while today's price is confirmed with the store. No chat is started. `t` and `img`
 * carry what the caller already knows so the screen is never empty.
 */
export default async function MobilePricePage({ searchParams }: { searchParams: Promise<{ url?: string; t?: string; img?: string }> }) {
  const { url, t, img } = await searchParams;
  let valid: URL | null = null;
  try {
    valid = url ? new URL(url) : null;
  } catch {
    valid = null;
  }
  if (!valid || !/^https?:$/.test(valid.protocol)) return <PriceHandoff url={null} />;
  return (
    <ProductScreen
      id={null}
      seed={{
        title: t?.trim() || shortLink(valid.href),
        image: img && /^https:\/\//.test(img) ? img : null,
        store: valid.hostname.replace(/^www\./, "").split(".")[0] ?? "store",
        totalGhs: null,
        rating: null,
        reviews: null,
        productUrl: valid.href,
      }}
    />
  );
}
