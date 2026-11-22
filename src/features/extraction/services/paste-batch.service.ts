import "server-only";

import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listPastesForViewer } from "@/db/queries/extraction-requests";
import { previewBatch } from "@/features/bag/services/bag.service";
import { buildReceiptRows } from "@/features/app-home/components/format";
import type { Viewer } from "@/features/quotes/types";
import { PASTE_BATCH_MAX, type PasteBatchPreview } from "./paste-batch";

/**
 * The priced links of a batch, together (plan 2b, "all together").
 *
 * Only this viewer's own pastes are considered, so a paste id cannot be used
 * to price somebody else's link; only priced, still-valid quotes go in. The
 * money is the bag's (`previewBatch`): same pricing, same pay gate, same box
 * planner, nothing written.
 */
export async function previewPastes(viewer: Viewer, pasteIds: readonly string[]): Promise<PasteBatchPreview> {
  const wanted = new Set(pasteIds.slice(0, PASTE_BATCH_MAX));
  // Twice the batch size: a viewer's newest pastes, which is where a batch lives.
  const rows = (await listPastesForViewer(viewer, PASTE_BATCH_MAX * 2)).filter((r) => wanted.has(r.id) && r.extraction_cache_id);
  const facts = await getQuoteFacts(rows.map((r) => r.extraction_cache_id!));
  const priced = rows.filter((r) => facts.get(r.extraction_cache_id!)?.priced);

  const preview = await previewBatch(viewer, priced.map((r) => r.extraction_cache_id!));
  const requestByExtraction = new Map(priced.map((r) => [r.extraction_cache_id!, r.id]));

  return {
    lines: preview.lines.map((line) => ({
      request_id: requestByExtraction.get(line.extraction_cache_id!) ?? line.id,
      extraction_cache_id: line.extraction_cache_id!,
      title: line.product.title,
      image: line.product.image,
      // "generic" is the registry's slug for an unlisted store, not a name: the card shows the host instead.
      store: line.product.store && line.product.store.toLowerCase() !== "generic" ? line.product.store : null,
      url: line.product.url,
      total_ghs: line.pricing?.total_ghs ?? null,
      total_usd: line.pricing?.total_usd ?? null,
      pricing_unavailable_reason: line.pricing_unavailable_reason,
      pay_hold: line.pay_hold ?? null,
      receipt: line.pricing ? buildReceiptRows(line.pricing).map(({ key, label, value }) => ({ key, label, value })) : [],
    })),
    total_ghs: preview.total_ghs,
    total_usd: preview.total_usd,
    consolidation_saving_ghs: preview.consolidation_saving_ghs,
    ready_count: preview.ready_count,
    rate_locked_until: preview.rate_locked_until,
  };
}
