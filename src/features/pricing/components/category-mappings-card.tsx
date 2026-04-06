"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TomameCategory } from "@/config/categories/tomame_category";
import {
  usePricingGroups,
  useCategoryMappings,
  useUpdateCategoryMapping,
  useRemoveCategoryMapping,
  type PricingGroup,
  type CategoryMapping,
} from "../hooks/usePricingGroups";

// ── All Tomame Category values ──────────────────────────────────────────────

const ALL_CATEGORIES = Object.values(TomameCategory).sort();

// ── Category Row ────────────────────────────────────────────────────────────

function CategoryRow({
  category,
  mapping,
  groups,
}: {
  category: string;
  mapping: CategoryMapping | undefined;
  groups: PricingGroup[];
}) {
  const updateMutation = useUpdateCategoryMapping();
  const removeMutation = useRemoveCategoryMapping();
  const isBusy = updateMutation.isPending || removeMutation.isPending;

  async function handleChange(groupId: string) {
    if (groupId === "__none__") {
      if (!mapping) return;
      try {
        await removeMutation.mutateAsync(category);
        toast.success(`Mapping removed for "${category}"`);
      } catch {
        toast.error("Failed to remove mapping");
      }
      return;
    }

    try {
      await updateMutation.mutateAsync({
        category,
        pricing_group_id: groupId,
      });
      toast.success(`"${category}" mapped`);
    } catch {
      toast.error("Failed to update mapping");
    }
  }

  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm text-stone-700 truncate">{category}</span>
        {!mapping && (
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 shrink-0">
            Unmapped
          </Badge>
        )}
      </div>
      <div className="shrink-0">
        <Select
          value={mapping?.pricing_group_id ?? "__none__"}
          onValueChange={handleChange}
          disabled={isBusy}
        >
          <SelectTrigger size="sm" className="w-44 text-xs">
            <SelectValue placeholder="Select group..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs text-stone-400">
              No group
            </SelectItem>
            {groups
              .filter((g) => g.is_active)
              .map((g) => (
                <SelectItem key={g.id} value={g.id} className="text-xs">
                  {g.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── Main Card ───────────────────────────────────────────────────────────────

type FilterMode = "all" | "unmapped" | "mapped";

export function CategoryMappingsCard() {
  const { data: groups, isLoading: groupsLoading } = usePricingGroups();
  const { data: mappings, isLoading: mappingsLoading } = useCategoryMappings();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  const isLoading = groupsLoading || mappingsLoading;

  const mappingsByCategory = useMemo(() => {
    const map = new Map<string, CategoryMapping>();
    for (const m of mappings ?? []) {
      map.set(m.tomame_category, m);
    }
    return map;
  }, [mappings]);

  const filteredCategories = useMemo(() => {
    let list = ALL_CATEGORIES;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.toLowerCase().includes(q));
    }

    if (filter === "unmapped") {
      list = list.filter((c) => !mappingsByCategory.has(c));
    } else if (filter === "mapped") {
      list = list.filter((c) => mappingsByCategory.has(c));
    }

    return list;
  }, [search, filter, mappingsByCategory]);

  const mappedCount = ALL_CATEGORIES.filter((c) =>
    mappingsByCategory.has(c),
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Category Mappings</CardTitle>
            <CardDescription>
              Assign product categories to pricing groups.
            </CardDescription>
          </div>
          <Badge variant={mappedCount === ALL_CATEGORIES.length ? "default" : "secondary"}>
            {mappedCount}/{ALL_CATEGORIES.length} mapped
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-stone-400 text-sm h-24">
            <Spinner className="size-4" />
            <span>Loading...</span>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <Input
                placeholder="Search categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs h-8 text-sm"
              />
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as FilterMode)}
              >
                <SelectTrigger size="sm" className="w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All
                  </SelectItem>
                  <SelectItem value="unmapped" className="text-xs">
                    Unmapped
                  </SelectItem>
                  <SelectItem value="mapped" className="text-xs">
                    Mapped
                  </SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-stone-400 ml-auto">
                {filteredCategories.length} shown
              </span>
            </div>

            {/* Category list */}
            <div className="divide-y divide-stone-100 max-h-[500px] overflow-y-auto">
              {filteredCategories.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-6">
                  No categories match your filters.
                </p>
              ) : (
                filteredCategories.map((cat) => (
                  <CategoryRow
                    key={cat}
                    category={cat}
                    mapping={mappingsByCategory.get(cat)}
                    groups={groups ?? []}
                  />
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
