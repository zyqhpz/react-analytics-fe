export type QueryValue = string | number | boolean | null | undefined;
export type QueryRow = Record<string, QueryValue>;

export type ChartType = string;
export type QueryType = "visual" | "sql";

export interface Query {
    id: string;
    data?: QueryRow[];
    name: string;
    description: string;
    result_schema: string[];
    query_type?: QueryType;
    visual_config?: VisualQueryRequest | null;
    sql_text?: string | null;
}

export type Aggregation = {
    func: string;
    field: string;
    alias?: string;
};

export type PivotValueValue = string | number | boolean | null;

export type PivotValue = {
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
    columns: Record<string, ColumnSchema>;
    relations?: Record<string, never>;
};

export type FullSchema = {
    tables: Record<string, TableSchema>;
};

export type VisualQueryRequest = {
    table: string;
    joins: Join[];
    select: string[];
    aggregations: Aggregation[];
    group_by: string[];
    fill_missing_dates?: boolean;
    pivot?: PivotOptions;
    where: unknown;
    having: unknown;
    order_by: OrderBy[];
    limit?: number;
};
