import { notFound } from "next/navigation";
import { z } from "zod";

import { ProductScreen } from "@/features/mobile/components/product-screen";

/** A product priced to the door; the screen reads `/api/extractions/:id` itself. */
export default async function MobileProductPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <ProductScreen id={id.data} />;
}
