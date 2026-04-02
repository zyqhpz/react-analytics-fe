import { type ChartType, type QueryRow } from "@/types/query";

export interface DashboardWidget {
  id: string;
  queryId: string;
  chartType: ChartType;
  position: WidgetPosition;
  title: string;
  data?: QueryRow[];
  schema?: string[];
}

export type WidgetPosition = { x: number; y: number; w: number; h: number };
