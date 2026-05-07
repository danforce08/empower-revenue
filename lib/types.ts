export type MetricType = 'count' | 'currency';

export type MetricSchemaField = {
  key: string;
  label: string;
  type: MetricType;
};

export type ChannelKind = 'product' | 'channel';

export type Channel = {
  id: string;
  key: string;
  name: string;
  kind: ChannelKind;
  owner_id: string | null;
  owner_label: string | null;
  metrics_schema: MetricSchemaField[];
  cell_format: string;
  /** The metric key whose value the Quantum target tracks (drives gap chip). */
  primary_metric_key: string | null;
  quantum_weekly: number;
  quantum_monthly: number;
  counts_in_total_sales: boolean;
  supports_source_breakdown: boolean;
  sort_order: number;
};

export type SourceOfTruth = 'jobflo_upload' | 'manual_entry';
export type PeriodType = 'week' | 'month';

export type MetricRow = {
  id: string;
  period_start: string; // ISO YYYY-MM-DD
  period_end: string;
  period_type: PeriodType;
  channel_id: string;
  source: string | null;
  branch: string | null;
  product: string | null;
  metrics: Record<string, number | string[]>;
  source_of_truth: SourceOfTruth;
  entered_by: string | null;
  entered_at: string;
  notes: string | null;
  excluded_from_kpi: boolean;
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'owner' | 'viewer';
  channels: string[];
};

export type SourceLookup = { key: string; name: string; status: string; sort_order: number };
export type BranchLookup = { key: string; name: string; state: string; status: string; sort_order: number };
