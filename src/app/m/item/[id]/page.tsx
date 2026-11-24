import { notFound } from "next/navigation";
import { z } from "zod";

import { getShopProduct } from "@/features/catalog/services/catalog-shop.service";
import { ProductScreen } from "@/features/mobile/components/product-screen";

/**
 * A shop listing opened from the app: its own product view, drawn at once from the catalogue
 * while the screen confirms today's price with the store. Never through the chat.
 */
export default async function MobileItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const product = await getShopProduct(id.data);
  if (!product) notFound();
  return (
    <ProductScreen
      id={null}
      seed={{
        title: product.title,
        image: product.image_url,
        store: product.store,
        totalGhs: product.unpriceable ? null : product.total_ghs,
        rating: product.rating,
        reviews: product.review_count,
        productUrl: product.product_url,
      }}
    />
  );
}
