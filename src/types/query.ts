export type QueryValue = string | number | boolean | null | undefined;
export type QueryRow = Record<string, QueryValue>;
export type QueryVariablePrimitive = string | number | boolean | null;
export type QueryVariableValue =
  | QueryVariablePrimitive
  | QueryVariablePrimitive[];
export type QueryVariableMap = Record<string, QueryVariableValue>;

export type ChartType = string;
export type QueryType = "visual" | "sql";

export interface QueryDepartment {
  id: string;
  name: string;
  slug?: string;
  created_at?: string;
  updated_at?: string;
  settings?: Record<string, unknown>;
}

export interface Query {
  id: string;
  data?: QueryRow[];
  name: string;
  description: string;
  department?: QueryDepartment | null;
  department_id?: string | null;
  result_schema: string[];
  query_type?: QueryType;
  visual_config?: VisualQueryRequest | null;
  sql_text?: string | null;
  variables?: QueryVariableDefinition[];
  applied_variables?: QueryVariableMap;
  variable_definitions?: QueryVariableDefinition[];
  filter_data?: Record<string, QueryVariableOption[]>;
}

export type QueryVariableOption = {
  label: string;
  value: QueryVariablePrimitive;
};

export type QueryVariableSource = {
  kind: string;
  sql?: string;
  value_field?: string;
  label_field?: string;
};

export type QueryVariableDefinition = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  multiple?: boolean;
  options?: QueryVariableOption[];
  source?: QueryVariableSource;
};

export type Aggregation = {
  id?: string;
  func: string;
  field: string;
  alias?: string;
};

export type SelectedColumn = {
  id?: string;
  name: string;
  alias?: string;
};

export type VisualSelectColumn = string | SelectedColumn;

export type PivotValueValue = string | number | boolean | null;

export type PivotValue = {
  id?: string;
  value: PivotValueValue;
  alias: string;
};

export type PivotOptions = {
  enabled: boolean;
  pivot_field: string;
  value_field: string;
  func: string;
  values: PivotValue[];
};

export type OrderBy = {
  field: string;
  direction: string;
};

export type ResultColumnOrderItem = {
  kind: "select" | "aggregation" | "pivot";
  id: string;
};

export type Join = {
  table: string;
};

export type ColumnSchema = {
  type: string;
  selectable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  aggregatable?: boolean;
  values?: string[];
};

export type TableSchema = {
  description?: string;
  columns: Record<string, ColumnSchema>;
  relations?: Record<string, never>;
};

export type FullSchema = {
  tables: Record<string, TableSchema>;
};

export type VisualQueryRequest = {
  table: string;
  joins: Join[];
  select: VisualSelectColumn[];
  aggregations: Aggregation[];
  result_column_order?: ResultColumnOrderItem[];
  group_by: string[];
  fill_missing_dates?: boolean;
  pivot?: PivotOptions;
  where: unknown;
  having: unknown;
  order_by: OrderBy[];
  limit?: number;
};
