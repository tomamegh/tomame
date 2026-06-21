/**
 * A legal policy row as stored in the `policies` table.
 * `content` is markdown rendered via react-markdown on the public + admin pages.
 */
export interface PolicyRow {
  id: string;
  slug: string;
  label: string;
  content: string;
  effective_date: string | null;
  last_updated: string;
  is_published: boolean;
}

/** Public-facing subset returned by the public policies API. */
export type PublicPolicy = Omit<PolicyRow, never>;
