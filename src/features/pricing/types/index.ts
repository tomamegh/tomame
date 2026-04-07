export interface PricingGroup {
  id: string;
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
  category_count: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryMapping {
  id: string;
  tomame_category: string;
  pricing_group_id: string;
  updated_at: string;
  pricing_groups: {
    id: string;
    slug: string;
    name: string;
  };
}

export interface PricingGroupsTableMeta {
  onEdit: (group: PricingGroup) => void;
  onDelete: (group: PricingGroup) => void;
}

export interface CategoryMappingsTableMeta {
  groups: PricingGroup[];
}
