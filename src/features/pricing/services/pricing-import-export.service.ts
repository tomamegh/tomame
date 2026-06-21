import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────────

interface ExportPricingGroup {
  slug: string;
  name: string;
  flat_rate_ghs: number | null;
  flat_rate_expression: string | null;
  value_percentage: number;
  value_percentage_high: number | null;
  value_threshold_usd: number | null;
  default_weight_lbs: number | null;
  requires_weight: boolean;
  is_active: boolean;
  sort_order: number;
}

interface ExportCategoryMapping {
  tomame_category: string;
  pricing_group_slug: string;
}

interface ImportPreviewResult {
  groups: {
    create: ExportPricingGroup[];
    update: { slug: string; changes: Partial<ExportPricingGroup> }[];
    unchanged: string[];
  };
  mappings: {
    create: ExportCategoryMapping[];
    update: ExportCategoryMapping[];
    unchanged: string[];
  };
  errors: string[];
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function exportPricingToExcel(): Promise<Buffer> {
  const client = createAdminClient();

  const [{ data: groups, error: gErr }, { data: mappings, error: mErr }] =
    await Promise.all([
      client
        .from("pricing_groups")
        .select(
          "slug, name, flat_rate_ghs, flat_rate_expression, value_percentage, value_percentage_high, value_threshold_usd, default_weight_lbs, requires_weight, is_active, sort_order",
        )
        .order("sort_order"),
      client
        .from("category_pricing_map")
        .select("tomame_category, pricing_groups!inner(slug)")
        .order("tomame_category"),
    ]);

  if (gErr) throw new APIError(500, `Failed to export groups: ${gErr.message}`);
  if (mErr) throw new APIError(500, `Failed to export mappings: ${mErr.message}`);

  // Build sheets
  const groupRows = (groups ?? []).map((g) => ({
    slug: g.slug,
    name: g.name,
    flat_rate_ghs: g.flat_rate_ghs,
    flat_rate_expression: g.flat_rate_expression,
    value_percentage: g.value_percentage,
    value_percentage_high: g.value_percentage_high,
    value_threshold_usd: g.value_threshold_usd,
    default_weight_lbs: g.default_weight_lbs,
    requires_weight: g.requires_weight,
    is_active: g.is_active,
    sort_order: g.sort_order,
  }));

  const mappingRows = (mappings ?? []).map((m) => ({
    tomame_category: m.tomame_category,
    pricing_group_slug: (m.pricing_groups as unknown as { slug: string }).slug,
  }));

  const wb = XLSX.utils.book_new();

  const gsWs = XLSX.utils.json_to_sheet(groupRows);
  XLSX.utils.book_append_sheet(wb, gsWs, "Pricing Groups");

  const msWs = XLSX.utils.json_to_sheet(mappingRows);
  XLSX.utils.book_append_sheet(wb, msWs, "Category Mappings");

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ── Import Preview ──────────────────────────────────────────────────────────

export async function previewPricingImport(
  fileBuffer: Buffer,
): Promise<ImportPreviewResult> {
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const errors: string[] = [];

  // Parse groups sheet
  const groupSheet = wb.Sheets["Pricing Groups"];
  const groupRows: ExportPricingGroup[] = groupSheet
    ? XLSX.utils.sheet_to_json(groupSheet)
    : [];

  // Parse mappings sheet
  const mappingSheet = wb.Sheets["Category Mappings"];
  const mappingRows: ExportCategoryMapping[] = mappingSheet
    ? XLSX.utils.sheet_to_json(mappingSheet)
    : [];

  // Validate groups
  for (let i = 0; i < groupRows.length; i++) {
    const row = groupRows[i]!;
    const rowNum = i + 2; // 1-indexed + header
    if (!row.slug || typeof row.slug !== "string") {
      errors.push(`Pricing Groups row ${rowNum}: missing or invalid slug`);
    }
    if (!row.name || typeof row.name !== "string") {
      errors.push(`Pricing Groups row ${rowNum}: missing or invalid name`);
    }
    if (row.flat_rate_ghs == null && !row.flat_rate_expression) {
      errors.push(
        `Pricing Groups row ${rowNum} (${row.slug}): must have flat_rate_ghs or flat_rate_expression`,
      );
    }
    if (row.flat_rate_ghs != null && row.flat_rate_expression) {
      errors.push(
        `Pricing Groups row ${rowNum} (${row.slug}): cannot have both flat_rate_ghs and flat_rate_expression`,
      );
    }
    if (row.value_percentage == null || row.value_percentage < 0 || row.value_percentage > 1) {
      errors.push(
        `Pricing Groups row ${rowNum} (${row.slug}): value_percentage must be between 0 and 1`,
      );
    }
  }

  // Validate mappings
  const importSlugs = new Set(groupRows.map((g) => g.slug));
  for (let i = 0; i < mappingRows.length; i++) {
    const row = mappingRows[i]!;
    const rowNum = i + 2;
    if (!row.tomame_category) {
      errors.push(`Category Mappings row ${rowNum}: missing tomame_category`);
    }
    if (!row.pricing_group_slug) {
      errors.push(`Category Mappings row ${rowNum}: missing pricing_group_slug`);
    }
  }

  if (errors.length > 0) {
    return {
      groups: { create: [], update: [], unchanged: [] },
      mappings: { create: [], update: [], unchanged: [] },
      errors,
    };
  }

  // Compare with existing data
  const client = createAdminClient();
  const [{ data: existingGroups }, { data: existingMappings }] =
    await Promise.all([
      client
        .from("pricing_groups")
        .select(
          "slug, name, flat_rate_ghs, flat_rate_expression, value_percentage, value_percentage_high, value_threshold_usd, default_weight_lbs, requires_weight, is_active, sort_order",
        ),
      client
        .from("category_pricing_map")
        .select("tomame_category, pricing_groups!inner(slug)"),
    ]);

  const existingGroupMap = new Map(
    (existingGroups ?? []).map((g) => [g.slug, g]),
  );
  const existingMappingMap = new Map(
    (existingMappings ?? []).map((m) => [
      m.tomame_category as string,
      (m.pricing_groups as unknown as { slug: string }).slug,
    ]),
  );

  // Diff groups
  const groupsCreate: ExportPricingGroup[] = [];
  const groupsUpdate: { slug: string; changes: Partial<ExportPricingGroup> }[] = [];
  const groupsUnchanged: string[] = [];

  for (const row of groupRows) {
    const existing = existingGroupMap.get(row.slug);
    if (!existing) {
      groupsCreate.push(row);
    } else {
      const changes: Partial<ExportPricingGroup> = {};
      if (row.name !== existing.name) changes.name = row.name;
      if (Number(row.flat_rate_ghs) !== Number(existing.flat_rate_ghs))
        changes.flat_rate_ghs = row.flat_rate_ghs;
      if (row.flat_rate_expression !== existing.flat_rate_expression)
        changes.flat_rate_expression = row.flat_rate_expression;
      if (Number(row.value_percentage) !== Number(existing.value_percentage))
        changes.value_percentage = row.value_percentage;
      if (Number(row.value_percentage_high) !== Number(existing.value_percentage_high))
        changes.value_percentage_high = row.value_percentage_high;
      if (Number(row.value_threshold_usd) !== Number(existing.value_threshold_usd))
        changes.value_threshold_usd = row.value_threshold_usd;
      if (Number(row.default_weight_lbs) !== Number(existing.default_weight_lbs))
        changes.default_weight_lbs = row.default_weight_lbs;
      if (Boolean(row.requires_weight) !== Boolean(existing.requires_weight))
        changes.requires_weight = row.requires_weight;
      if (Number(row.sort_order) !== Number(existing.sort_order))
        changes.sort_order = row.sort_order;

      if (Object.keys(changes).length > 0) {
        groupsUpdate.push({ slug: row.slug, changes });
      } else {
        groupsUnchanged.push(row.slug);
      }
    }
  }

  // Diff mappings — validate slugs exist (in import or DB)
  const allKnownSlugs = new Set([
    ...importSlugs,
    ...Array.from(existingGroupMap.keys()),
  ]);

  const mappingsCreate: ExportCategoryMapping[] = [];
  const mappingsUpdate: ExportCategoryMapping[] = [];
  const mappingsUnchanged: string[] = [];

  for (const row of mappingRows) {
    if (!allKnownSlugs.has(row.pricing_group_slug)) {
      errors.push(
        `Category Mappings: "${row.tomame_category}" references unknown group "${row.pricing_group_slug}"`,
      );
      continue;
    }

    const existingSlug = existingMappingMap.get(row.tomame_category);
    if (!existingSlug) {
      mappingsCreate.push(row);
    } else if (existingSlug !== row.pricing_group_slug) {
      mappingsUpdate.push(row);
    } else {
      mappingsUnchanged.push(row.tomame_category);
    }
  }

  return {
    groups: {
      create: groupsCreate,
      update: groupsUpdate,
      unchanged: groupsUnchanged,
    },
    mappings: {
      create: mappingsCreate,
      update: mappingsUpdate,
      unchanged: mappingsUnchanged,
    },
    errors,
  };
}

// ── Import Apply ────────────────────────────────────────────────────────────

export async function applyPricingImport(
  fileBuffer: Buffer,
  adminId: string,
): Promise<{ groupsCreated: number; groupsUpdated: number; mappingsUpserted: number }> {
  const preview = await previewPricingImport(fileBuffer);

  if (preview.errors.length > 0) {
    throw new APIError(400, `Import has errors: ${preview.errors.join("; ")}`);
  }

  const client = createAdminClient();
  const now = new Date().toISOString();
  let groupsCreated = 0;
  let groupsUpdated = 0;
  let mappingsUpserted = 0;

  // Create new groups
  for (const group of preview.groups.create) {
    const { error } = await client.from("pricing_groups").insert({
      slug: group.slug,
      name: group.name,
      flat_rate_ghs: group.flat_rate_ghs,
      flat_rate_expression: group.flat_rate_expression || null,
      value_percentage: group.value_percentage,
      value_percentage_high: group.value_percentage_high,
      value_threshold_usd: group.value_threshold_usd,
      default_weight_lbs: group.default_weight_lbs,
      requires_weight: Boolean(group.requires_weight),
      is_active: group.is_active !== false,
      sort_order: group.sort_order ?? 0,
      updated_by: adminId,
      updated_at: now,
    });
    if (error) {
      logger.error("Import: failed to create group", {
        slug: group.slug,
        error: error.message,
      });
      throw new APIError(500, `Failed to create group "${group.slug}": ${error.message}`);
    }
    groupsCreated++;
  }

  // Update existing groups
  for (const { slug, changes } of preview.groups.update) {
    const { error } = await client
      .from("pricing_groups")
      .update({ ...changes, updated_by: adminId, updated_at: now })
      .eq("slug", slug);
    if (error) {
      logger.error("Import: failed to update group", {
        slug,
        error: error.message,
      });
      throw new APIError(500, `Failed to update group "${slug}": ${error.message}`);
    }
    groupsUpdated++;
  }

  // Upsert mappings (need to resolve slugs to IDs)
  const allMappings = [...preview.mappings.create, ...preview.mappings.update];
  if (allMappings.length > 0) {
    // Fetch all group IDs by slug
    const slugs = [...new Set(allMappings.map((m) => m.pricing_group_slug))];
    const { data: groupsData } = await client
      .from("pricing_groups")
      .select("id, slug")
      .in("slug", slugs);

    const slugToId = new Map(
      (groupsData ?? []).map((g) => [g.slug, g.id as string]),
    );

    for (const mapping of allMappings) {
      const groupId = slugToId.get(mapping.pricing_group_slug);
      if (!groupId) {
        throw new APIError(
          400,
          `Group "${mapping.pricing_group_slug}" not found for category "${mapping.tomame_category}"`,
        );
      }

      const { error } = await client.from("category_pricing_map").upsert(
        {
          tomame_category: mapping.tomame_category,
          pricing_group_id: groupId,
          updated_by: adminId,
          updated_at: now,
        },
        { onConflict: "tomame_category" },
      );
      if (error) {
        throw new APIError(
          500,
          `Failed to upsert mapping for "${mapping.tomame_category}": ${error.message}`,
        );
      }
      mappingsUpserted++;
    }
  }

  await logAuditEvent({
    actorId: adminId,
    actorRole: "admin",
    action: "pricing_import_applied",
    entityType: "order",
    entityId: null,
    metadata: {
      groupsCreated,
      groupsUpdated,
      mappingsUpserted,
    },
  });

  return { groupsCreated, groupsUpdated, mappingsUpserted };
}
