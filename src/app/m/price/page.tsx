import { PriceHandoff } from "@/features/mobile/components/price-handoff";

/** `/m/price?url=` — a product link from Home's shelves, priced the way a paste is. */
export default async function MobilePricePage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  return <PriceHandoff url={url ?? null} />;
}
