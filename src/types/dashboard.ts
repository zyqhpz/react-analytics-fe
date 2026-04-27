import {
  type ChartType,
  type Query,
  type QueryRow,
  type QueryVariableMap,
} from "@/types/query";

export interface DashboardDepartment {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  id: string;
  name: string;
  description: string;
  department_id: string;
  department?: DashboardDepartment;
  created_at: string;
  created_by: string;
  is_public: boolean;
  refresh_interval: number;
  updated_at: string;
  variables?: QueryVariableMap | string | null;
}

export type DashboardWidgetConfig = {
  table_page_size?: number;
  variables?: QueryVariableMap;
  variable_mapping?: Record<string, string>;
};

export interface DashboardWidget {
  id: string;
  queryId: string;
  chartType: ChartType;
  position: WidgetPosition;
  title: string;
  data?: QueryRow[];
  schema?: string[];
  config?: DashboardWidgetConfig;
  query?: Query;
}

export type WidgetPosition = { x: number; y: number; w: number; h: number };
