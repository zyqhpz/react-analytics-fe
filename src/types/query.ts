export type QueryRow = Record<string, never>;

export type ChartType = "line" | "bar" | "pie";

export interface Query {
    id: string;
    data?: QueryRow[];
    name: string;
    description: string;
    result_schema: string[];
    visual_config: string;
}

export type Aggregation = {
    func: string;
    field: string;
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