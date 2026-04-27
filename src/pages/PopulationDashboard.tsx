import { API_BASE_URL } from "@/api/base";
import { authFetch } from "@/api/client";
import { handleUnauthorizedStatus } from "@/api/utils";
import * as echarts from "echarts";
import * as echartsCharts from "echarts/charts";
import { GridStack, type GridStackNode, type GridStackWidget } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { IoIosInformationCircleOutline } from "react-icons/io";
import { useNavigate } from "react-router-dom";
import { v7 as uuidv7 } from "uuid";

import {
  clearSelectedDashboardId,
  createDashboard,
  fetchDashboard,
  fetchDashboardWidgets,
  fetchDashboards,
  getSelectedDashboardId,
  setSelectedDashboardId,
  updateDashboard,
} from "@/api/dashboard";
import {
  fetchQueryFilters,
  fetchQueryWithData,
  fetchSavedQueries,
} from "@/api/queries";
import { CurrentUserBadge } from "@/components/CurrentUserBadge";
import { DataTable } from "@/components/DataTable";
import { VariableDatePicker } from "@/components/VariableDatePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import {
  coercePrimitiveValue,
  filterVariablesForDefinitions,
  formatVariableValueForText,
  mergeVariableOptions,
  normalizeVariableMap,
  normalizeWidgetConfig,
  parseVariableValueFromText,
  resolveWidgetVariables,
  stringifyVariableOptionValue,
} from "@/lib/variables";
import {
  type DashboardSummary,
  type DashboardWidget,
  type DashboardWidgetConfig,
  type WidgetPosition,
} from "@/types/dashboard";
import {
  type ChartType,
  type Query,
  type QueryRow,
  type QueryVariableDefinition,
  type QueryVariableMap,
  type QueryVariableOption,
} from "@/types/query";
import { LayoutDashboard, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

type BackendWidget = {
  config?: DashboardWidgetConfig | Record<string, unknown>;
  id: string;
  widget_type: ChartType;
  position: WidgetPosition;
  query_id?: string;
};

type ChartsMeta = {
  instance?: echarts.ECharts;
  type: ChartType;
  observer?: ResizeObserver;
  root?: Root;
  statusRoot?: Root;
};

type WidgetMeta = {
  queryId: string;
  chartType: ChartType;
  config?: DashboardWidgetConfig;
  variableDefinitions?: QueryVariableDefinition[];
};

type DashboardFilterDefinition = QueryVariableDefinition & {
  options?: QueryVariableOption[];
};

type WidgetScopedVariableDefinition = QueryVariableDefinition & {
  dashboardKey: string;
  options?: QueryVariableOption[];
  queryKey: string;
  widgetId: string;
};

type WidgetSettingsState = {
  widgetId: string;
  queryId: string;
  queryName: string;
  variableDefinitions: QueryVariableDefinition[];
  config: DashboardWidgetConfig;
};

type ChartTypeGuide = {
  description: string;
  minimumFields: number;
  required: string[];
  optional?: string[];
  sampleRow: Record<string, string | number>;
  notes?: string[];
};

type QueryPreview = {
  data: QueryRow[];
  schema?: string[];
};

type QueryShapeSummary = {
  fieldCount: number;
  numericFieldCount: number;
  categoryFieldCount: number;
  hasRows: boolean;
};

type ChartPreviewSummary = {
  status: "ready" | "fallback" | "insufficient";
  title: string;
  note: string;
  schemaFields: string[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  seriesLabels: string[];
  sampleItems: string[];
};

const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_TABLE_PAGE_SIZE = 25;

const getWidgetTablePageSize = (config?: DashboardWidgetConfig) => {
  const parsedValue = Number(config?.table_page_size);

  return TABLE_PAGE_SIZE_OPTIONS.includes(
    parsedValue as (typeof TABLE_PAGE_SIZE_OPTIONS)[number],
  )
    ? parsedValue
    : DEFAULT_TABLE_PAGE_SIZE;
};

function WidgetHeaderControls({
  widgetId,
  type,
  tablePageSize,
  onTablePageSizeChange,
}: {
  widgetId: string;
  type: ChartType;
  tablePageSize: number;
  onTablePageSizeChange: (widgetId: string, pageSize: number) => void;
}) {
  return (
    <div className="relative z-30 flex items-center gap-2">
      {type === "table" ? (
        <Select
          value={String(tablePageSize)}
          onValueChange={(value) =>
            onTablePageSizeChange(widgetId, Number(value))
          }
        >
          <SelectTrigger
            size="sm"
            className="h-8 border-white/15 bg-slate-950/80 px-1.5 text-xs text-slate-100 hover:bg-slate-900 [&_svg]:text-slate-300"
            aria-label="Table size"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-slate-900 text-slate-100">
            {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem
                key={size}
                value={String(size)}
                className="text-xs text-slate-100 focus:bg-white/10 focus:text-slate-100"
              >
                {size} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <button
        className="widget-menu-toggle flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-white/15 text-slate-200 transition hover:bg-white/10"
        type="button"
        aria-label="Widget actions"
        data-widget-id={widgetId}
      >
        ...
      </button>
      <div className="widget-menu absolute right-10 top-10 z-40 hidden min-w-36 overflow-hidden rounded-lg border border-white/10 bg-slate-900/95 shadow-lg">
        <button
          className="widget-settings block w-full cursor-pointer px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
          type="button"
          data-widget-id={widgetId}
        >
          Filters
        </button>
        <button
          className="export-widget block w-full cursor-pointer px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
          type="button"
          data-widget-id={widgetId}
        >
          Export CSV
        </button>
      </div>
      <button
        className="delete-widget h-8 w-8 cursor-pointer rounded-md border border-red-400/40 text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
        type="button"
      >
        X
      </button>
    </div>
  );
}

const formatCompactNumber = (value: unknown): string => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? "");

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(numericValue);
};

const NUMERIC_TABLE_VALUE_PATTERN = /^-?\d+(?:\.\d+)?$/;

const toNumeric = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const toLabel = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
};

const formatTableValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (typeof value === "bigint") {
    return value.toLocaleString("en-US");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!NUMERIC_TABLE_VALUE_PATTERN.test(trimmed)) return value;

    const isNegative = trimmed.startsWith("-");
    const unsignedValue = isNegative ? trimmed.slice(1) : trimmed;
    const [integerPart, fractionPart] = unsignedValue.split(".");
    const formattedInteger = Number(integerPart).toLocaleString("en-US");
    const withSign = isNegative ? `-${formattedInteger}` : formattedInteger;

    return fractionPart !== undefined
      ? `${withSign}.${fractionPart}`
      : withSign;
  }

  return String(value);
};

const formatDashboardLabel = (dashboard: DashboardSummary) => {
  if (dashboard.department?.name) {
    return `${dashboard.name} / ${dashboard.department.name}`;
  }

  return dashboard.name;
};

const enrichVariableDefinitions = (
  definitions: QueryVariableDefinition[] = [],
  filterData: Record<string, QueryVariableOption[]> = {},
) =>
  definitions.map((definition) => ({
    ...definition,
    options: mergeVariableOptions(
      definition.options,
      filterData[definition.key],
    ),
  }));

const mergeDashboardFilterDefinitions = (
  current: Record<string, DashboardFilterDefinition>,
  definitions: QueryVariableDefinition[] = [],
) => {
  const next = { ...current };
  definitions.forEach((definition) => {
    const existing = next[definition.key];

    next[definition.key] = {
      ...definition,
      key: definition.key,
      options: mergeVariableOptions(existing?.options, definition.options),
    };
  });

  return next;
};

const hasVariableValue = (value: QueryVariableMap[string] | undefined) => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null && String(value).trim() !== "";
};

const getMissingRequiredVariables = (
  definitions: QueryVariableDefinition[],
  values: QueryVariableMap,
) =>
  definitions.filter(
    (definition) =>
      definition.required && !hasVariableValue(values[definition.key]),
  );

const getWidgetScopedVariableDefinitions = (
  widgetId: string,
  definitions: QueryVariableDefinition[] = [],
): WidgetScopedVariableDefinition[] => {
  return definitions.map((definition) => ({
    ...definition,
    dashboardKey: definition.key,
    key: definition.key,
    options: mergeVariableOptions(definition.options),
    queryKey: definition.key,
    widgetId,
  }));
};

function MultiVariableCombobox({
  disabled = false,
  options,
  selectedValues,
  onChange,
}: {
  disabled?: boolean;
  options: QueryVariableOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const selectedOptions = options.filter((option) =>
    selectedValues.includes(stringifyVariableOptionValue(option.value)),
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        option.label.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [options, search],
  );
  const allSelected =
    options.length > 0 && selectedValues.length === options.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-left text-sm text-slate-100"
        >
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selectedOptions.length ? (
              selectedOptions.map((option) => (
                <span
                  key={`${option.label}-${option.value}`}
                  className="rounded-sm bg-slate-800 px-2 py-1 text-xs text-slate-100"
                >
                  {option.label}
                </span>
              ))
            ) : (
              <span className="text-slate-400">Select values</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        portalled={false}
        className="w-(--radix-popover-trigger-width) border-white/10 bg-slate-950/95 p-2 text-slate-100"
      >
        <div className="space-y-2">
          <input
            type="text"
            value={search}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search values"
            className="w-full rounded-md border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            disabled={disabled}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
            onClick={() =>
              onChange(
                allSelected
                  ? []
                  : options.map((option) =>
                      stringifyVariableOptionValue(option.value),
                    ),
              )
            }
          >
            <Checkbox checked={allSelected} className="pointer-events-none" />
            <span>{allSelected ? "Deselect all" : "Select all"}</span>
          </button>
          <ScrollArea className="h-64 min-h-48 rounded-md bg-slate-950/95">
            <div className="space-y-1 bg-slate-950/95 pr-3">
              {filteredOptions.length ? (
                filteredOptions.map((option) => {
                  const optionValue = stringifyVariableOptionValue(
                    option.value,
                  );
                  const checked = selectedValues.includes(optionValue);

                  return (
                    <button
                      key={`${option.label}-${option.value}`}
                      type="button"
                      disabled={disabled}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                      onClick={() =>
                        onChange(
                          checked
                            ? selectedValues.filter(
                                (value) => value !== optionValue,
                              )
                            : [...selectedValues, optionValue],
                        )
                      }
                    >
                      <Checkbox
                        checked={checked}
                        className="pointer-events-none"
                      />
                      <span>{option.label}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-2 py-3 text-sm text-slate-400">
                  No options found.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VariableValueInput({
  className,
  disabled = false,
  definition,
  placeholder,
  value,
  onChange,
}: {
  className?: string;
  disabled?: boolean;
  definition: Pick<
    QueryVariableDefinition,
    "key" | "label" | "type" | "multiple" | "options"
  >;
  placeholder?: string;
  value: QueryVariableMap[string];
  onChange: (value: QueryVariableMap[string]) => void;
}) {
  const options = definition.options ?? [];

  if (options.length) {
    if (definition.multiple) {
      return (
        <MultiVariableCombobox
          disabled={disabled}
          options={options}
          selectedValues={
            Array.isArray(value) ? value.map(stringifyVariableOptionValue) : []
          }
          onChange={(nextValues) =>
            onChange(
              nextValues.map((item) => coercePrimitiveValue(item, definition)),
            )
          }
        />
      );
    }

    return (
      <Select
        disabled={disabled}
        value={stringifyVariableOptionValue(
          Array.isArray(value) ? (value[0] ?? null) : (value ?? null),
        )}
        onValueChange={(nextValue) =>
          onChange(
            nextValue && nextValue !== "__all__"
              ? coercePrimitiveValue(nextValue, definition)
              : null,
          )
        }
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder ?? "Select value"} />
        </SelectTrigger>
        <SelectContent className="border-white/10 bg-slate-950/95 text-slate-100">
          <SelectItem value="__all__">All</SelectItem>
          {options.map((option) => (
            <SelectItem
              key={`${definition.key}-${option.label}-${option.value}`}
              value={stringifyVariableOptionValue(option.value)}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (
    !definition.multiple &&
    (definition.type === "date" || definition.type === "datetime")
  ) {
    return (
      <VariableDatePicker
        definition={definition}
        disabled={disabled}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <input
      type="text"
      disabled={disabled}
      value={formatVariableValueForText(value)}
      onChange={(event) =>
        onChange(parseVariableValueFromText(event.target.value, definition))
      }
      placeholder={
        placeholder ??
        (definition.multiple ? "Comma-separated values" : "Enter value")
      }
      className={className}
    />
  );
}

const normalizeRoleName = (roleName?: string | null) =>
  roleName?.trim().toUpperCase() ?? "";

const getColumns = (data: QueryRow[] = [], schema?: string[]): string[] => {
  const rawColumns = schema?.length
    ? schema
    : data.flatMap((row) => Object.keys(row));

  return Array.from(new Set(rawColumns));
};

const toCsvValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);

  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
};

const buildCsvContent = (data: QueryRow[] = [], schema?: string[]): string => {
  const columns = getColumns(data, schema);
  if (!columns.length) return "";

  const header = columns.map(toCsvValue).join(",");
  const rows = data.map((row) =>
    columns.map((column) => toCsvValue(row[column])).join(","),
  );

  return [header, ...rows].join("\r\n");
};

const DASHBOARD_QUERY_CONCURRENCY = 2;

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

function TableWidgetView({
  data,
  schema,
  tablePageSize = DEFAULT_TABLE_PAGE_SIZE,
}: {
  data: QueryRow[];
  schema?: string[];
  tablePageSize?: number;
}) {
  return (
    <DataTable
      data={data}
      columns={getColumns(data, schema)}
      formatValue={formatTableValue}
      pageSize={tablePageSize}
      paginationThreshold={tablePageSize}
      emptyMessage={
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-300">
          No data available.
        </div>
      }
      classes={{
        container: "flex h-full min-h-0 flex-col bg-slate-950/20",
        tableWrapper:
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3",
        table: "min-w-full text-slate-100",
        header: "sticky top-0 z-10 bg-slate-900",
        headerRow: "border-white/10 hover:bg-transparent",
        headerCell:
          "h-9 bg-slate-900 px-2.5 text-[11px] font-semibold text-slate-300",
        headerButton:
          "cursor-pointer select-none text-left font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:text-slate-100",
        row: "border-white/5 odd:bg-white/2",
        cell: "px-2.5 py-2 align-top text-sm text-slate-100",
        paginationContainer:
          "flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-xs text-slate-300",
        paginationText: "",
        paginationPrevious:
          "border border-white/10 bg-slate-900/70 text-slate-100 hover:bg-slate-800 disabled:opacity-40",
        paginationCurrent:
          "border border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
        paginationNext:
          "border border-white/10 bg-slate-900/70 text-slate-100 hover:bg-slate-800 disabled:opacity-40",
        emptyState:
          "flex h-full items-center justify-center px-6 text-center text-sm text-slate-300",
      }}
    />
  );
}

const inferDataShape = (data: QueryRow[], schema?: string[]) => {
  const sample = data[0] ?? {};
  const keys = schema?.length ? schema : Object.keys(sample);
  const numericKeys = keys.filter((key) =>
    data.every((row) => toNumeric(row[key]) !== null),
  );
  const categoryKey =
    keys.find((key) => !numericKeys.includes(key)) ?? keys[0] ?? "category";
  const valueKeys = numericKeys.length ? numericKeys : keys.slice(1, 2);
  const primaryValueKey = valueKeys[0] ?? keys[1] ?? keys[0];

  return { keys, numericKeys, valueKeys, categoryKey, primaryValueKey };
};

const inferPreviewShape = (data: QueryRow[], schema?: string[]) => {
  const keys = getColumns(data, schema);
  const hasRows = data.length > 0;
  const sampledNumericKeys = keys.filter((key) =>
    hasRows ? data.every((row) => toNumeric(row[key]) !== null) : false,
  );
  const guessedNumericKeys = keys.filter((key) =>
    /(amount|total|count|value|rate|avg|sum|score|price|cost|revenue|open|close|low|high|min|max|median|q1|q3|qty|quantity|percent|percentage)/i.test(
      key,
    ),
  );
  const numericKeys = sampledNumericKeys.length
    ? sampledNumericKeys
    : guessedNumericKeys;
  const categoryKeys = keys.filter((key) => !numericKeys.includes(key));
  const categoryKey =
    categoryKeys[0] ?? (keys.length > 1 ? keys[0] : undefined);
  const valueKeys = numericKeys.length
    ? numericKeys
    : keys
        .filter((key) => key !== categoryKey)
        .slice(0, Math.max(keys.length - 1, 1));

  return {
    keys,
    numericKeys,
    categoryKeys,
    categoryKey,
    valueKeys,
    hasRows,
  };
};

const buildChartPreviewSummary = (
  chartType: string,
  data: QueryRow[] = [],
  schema?: string[],
): ChartPreviewSummary => {
  const { keys, categoryKey, valueKeys } = inferPreviewShape(data, schema);
  const fallbackValueKey = valueKeys[0] ?? keys[0];
  const sampleItems = data.slice(0, 3).map((row, index) => {
    const labelKey = categoryKey ?? keys[0];
    const label = labelKey ? toLabel(row[labelKey]) : `Row ${index + 1}`;

    if (chartType === "table") {
      return `${label}: ${keys.map((key) => `${key}=${formatTableValue(row[key])}`).join(", ")}`;
    }

    if (chartType === "gauge") {
      return `${fallbackValueKey}: ${formatTableValue(row[fallbackValueKey])}`;
    }

    if (chartType === "candlestick" || chartType === "boxplot") {
      return `${label}: ${valueKeys
        .slice(0, chartType === "candlestick" ? 4 : 5)
        .map((key) => `${key}=${formatTableValue(row[key])}`)
        .join(", ")}`;
    }

    return `${label}: ${valueKeys
      .slice(
        0,
        chartType === "stackedArea" || chartType === "stackedBar" ? 3 : 2,
      )
      .map((key) => `${key}=${formatTableValue(row[key])}`)
      .join(", ")}`;
  });

  if (!keys.length) {
    return {
      status: "insufficient",
      title: "No preview available yet",
      note: "Run or save a query with result fields so the chart can infer axes and series.",
      schemaFields: [],
      seriesLabels: [],
      sampleItems: [],
    };
  }

  if (chartType === "table") {
    return {
      status: "ready",
      title: "Table preview",
      note: "The widget will render the selected query as tabular rows using the returned schema order.",
      schemaFields: keys,
      seriesLabels: keys,
      sampleItems,
    };
  }

  if (chartType === "gauge") {
    return {
      status: fallbackValueKey ? "ready" : "insufficient",
      title: "Gauge preview",
      note: fallbackValueKey
        ? "The first numeric-looking field is used as the gauge value."
        : "Add at least one numeric field so the gauge has a value to display.",
      schemaFields: keys,
      seriesLabels: fallbackValueKey ? [fallbackValueKey] : [],
      sampleItems,
    };
  }

  if (chartType === "candlestick" || chartType === "boxplot") {
    const requiredMetrics = chartType === "candlestick" ? 4 : 5;
    const metricKeys = valueKeys.slice(0, requiredMetrics);
    const isReady =
      Boolean(categoryKey) && metricKeys.length === requiredMetrics;

    return {
      status: isReady ? "ready" : "insufficient",
      title:
        chartType === "candlestick" ? "OHLC preview" : "Distribution preview",
      note: isReady
        ? `${chartType === "candlestick" ? "Candlestick" : "Boxplot"} will use ${categoryKey} as the label field and ${metricKeys.join(", ")} as ordered metrics.`
        : `This chart needs ${requiredMetrics} numeric fields plus one label field.`,
      schemaFields: keys,
      xAxisLabel: categoryKey,
      yAxisLabel: metricKeys.join(", "),
      seriesLabels: metricKeys,
      sampleItems,
    };
  }

  if (chartType === "pie" || chartType === "funnel") {
    const primaryValueKey = valueKeys[0];
    const isReady = Boolean(categoryKey && primaryValueKey);

    return {
      status: isReady ? "ready" : "insufficient",
      title: chartType === "pie" ? "Segment preview" : "Stage preview",
      note: isReady
        ? `${categoryKey} becomes each ${chartType === "pie" ? "slice" : "stage"} and ${primaryValueKey} becomes the size/value.`
        : "This chart needs one label field and one numeric value field.",
      schemaFields: keys,
      xAxisLabel: categoryKey,
      yAxisLabel: primaryValueKey,
      seriesLabels: primaryValueKey ? [primaryValueKey] : [],
      sampleItems,
    };
  }

  const multiSeriesTypes = new Set(["stackedArea", "stackedBar"]);
  const specializedTypes = new Set([
    "radar",
    "heatmap",
    "tree",
    "treemap",
    "sunburst",
  ]);
  const primarySeries = multiSeriesTypes.has(chartType)
    ? valueKeys.slice(0, Math.max(valueKeys.length, 2))
    : valueKeys.slice(0, Math.max(valueKeys.length, 1));
  const hasCategoryAndValue = Boolean(categoryKey && primarySeries.length > 0);

  return {
    status: hasCategoryAndValue
      ? specializedTypes.has(chartType)
        ? "fallback"
        : "ready"
      : "insufficient",
    title: specializedTypes.has(chartType)
      ? "Schema preview with fallback mapping"
      : "Axis preview",
    note: hasCategoryAndValue
      ? specializedTypes.has(chartType)
        ? `${categoryKey} is the main label field and ${primarySeries.join(", ")} will seed the chart. Rendering may adapt or fall back depending on the final schema.`
        : `${categoryKey} will map to the horizontal/category axis and ${primarySeries.join(", ")} will render as ${primarySeries.length > 1 ? "series" : "the value series"}.`
      : "This chart needs at least one label field and one value field to infer the visual layout.",
    schemaFields: keys,
    xAxisLabel: categoryKey,
    yAxisLabel: primarySeries.join(", "),
    seriesLabels: primarySeries,
    sampleItems,
  };
};

const summarizeQueryShape = (
  data: QueryRow[] = [],
  schema?: string[],
): QueryShapeSummary => {
  const keys = getColumns(data, schema);
  const numericKeys = keys.filter((key) =>
    data.length ? data.every((row) => toNumeric(row[key]) !== null) : false,
  );

  return {
    fieldCount: keys.length,
    numericFieldCount: numericKeys.length,
    categoryFieldCount: Math.max(0, keys.length - numericKeys.length),
    hasRows: data.length > 0,
  };
};

const isChartTypeCompatible = (
  chartType: string,
  shape: QueryShapeSummary | null,
): boolean => {
  if (!shape || shape.fieldCount === 0) return false;

  switch (chartType) {
    case "table":
      return true;
    case "pie":
    case "funnel":
    case "radar":
    case "sunburst":
    case "treemap":
    case "tree":
    case "heatmap":
    case "line":
    case "bar":
    case "scatter":
    case "effectScatter":
    case "pictorialBar":
      return shape.fieldCount >= 2 && shape.numericFieldCount >= 1;
    case "stackedArea":
    case "stackedBar":
      return shape.fieldCount >= 3 && shape.numericFieldCount >= 2;
    case "gauge":
      return shape.numericFieldCount >= 1;
    case "candlestick":
      return shape.fieldCount >= 5 && shape.numericFieldCount >= 4;
    case "boxplot":
      return shape.fieldCount >= 6 && shape.numericFieldCount >= 5;
    default:
      return false;
  }
};

const CARTESIAN_SERIES_PALETTE = [
  {
    solid: "#38bdf8",
    stroke: "#7dd3fc",
    fillTop: "rgba(56, 189, 248, 0.8)",
    fillBottom: "rgba(56, 189, 248, 0.14)",
    border: "rgba(186, 230, 253, 0.9)",
  },
  {
    solid: "#f59e0b",
    stroke: "#fbbf24",
    fillTop: "rgba(245, 158, 11, 0.78)",
    fillBottom: "rgba(245, 158, 11, 0.12)",
    border: "rgba(253, 230, 138, 0.9)",
  },
  {
    solid: "#34d399",
    stroke: "#6ee7b7",
    fillTop: "rgba(52, 211, 153, 0.78)",
    fillBottom: "rgba(52, 211, 153, 0.13)",
    border: "rgba(167, 243, 208, 0.9)",
  },
  {
    solid: "#f472b6",
    stroke: "#f9a8d4",
    fillTop: "rgba(244, 114, 182, 0.76)",
    fillBottom: "rgba(244, 114, 182, 0.12)",
    border: "rgba(251, 207, 232, 0.9)",
  },
  {
    solid: "#a78bfa",
    stroke: "#c4b5fd",
    fillTop: "rgba(167, 139, 250, 0.76)",
    fillBottom: "rgba(167, 139, 250, 0.12)",
    border: "rgba(221, 214, 254, 0.88)",
  },
];

const fallbackCartesianOption = (
  chartType: string,
  categoryData: string[],
  seriesData: number[],
): echarts.EChartsOption => ({
  title: {
    text: `${chartType} needs specialized schema`,
    subtext: "Showing fallback bar chart",
    left: "center",
    top: 4,
    textStyle: { color: "#e2e8f0", fontSize: 13, fontWeight: 600 },
    subtextStyle: { color: "#94a3b8", fontSize: 11 },
  },
  backgroundColor: "transparent",
  grid: { left: 28, right: 20, top: 54, bottom: 40, containLabel: true },
  xAxis: {
    type: "category",
    data: categoryData,
    axisLabel: { color: "#cbd5e1", fontSize: 11 },
    axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.45)" } },
  },
  yAxis: {
    type: "value",
    axisLabel: {
      color: "#cbd5e1",
      fontSize: 11,
      formatter: (value: number) => formatCompactNumber(value),
    },
    splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderColor: "rgba(148, 163, 184, 0.3)",
    textStyle: { color: "#e2e8f0" },
  },
  series: [
    {
      type: "bar",
      data: seriesData,
      itemStyle: { color: "#60a5fa" },
    },
  ],
});

const CHART_TYPE_GUIDES: Record<string, ChartTypeGuide> = {
  line: {
    description: "Trend over categories or time.",
    minimumFields: 2,
    required: ["1 category field (string/date)", "1+ numeric field"],
    optional: ["Additional numeric fields for multiple lines"],
    sampleRow: { month: "2026-01", total_amount: 12045.5 },
    notes: ["Schema order should be category first, then metrics."],
  },
  bar: {
    description: "Compare values across categories.",
    minimumFields: 2,
    required: ["1 category field", "1+ numeric field"],
    optional: ["Additional numeric fields for grouped bars"],
    sampleRow: { provider_type: "FPX", total_amount: 87000.23 },
  },
  stackedBar: {
    description:
      "Compare cumulative totals across categories with stacked segments.",
    minimumFields: 3,
    required: ["1 category field", "2+ numeric fields"],
    optional: ["More numeric fields for additional stacked segments"],
    sampleRow: { month: "2026-01", approved: 120, pending: 45, rejected: 8 },
    notes: ["Works best when each numeric column is part of the same total."],
  },
  stackedArea: {
    description: "Show cumulative trend contribution over categories or time.",
    minimumFields: 3,
    required: ["1 category field", "2+ numeric fields"],
    optional: ["More numeric fields for additional stacked bands"],
    sampleRow: { month: "2026-01", web: 1200, retail: 860, partner: 420 },
    notes: [
      "Uses stacked lines with filled area to show contribution over time.",
    ],
  },
  scatter: {
    description: "Relationship/distribution of numeric values.",
    minimumFields: 2,
    required: ["1 category/label field", "1 numeric field"],
    optional: ["Additional numeric fields as extra series"],
    sampleRow: { merchant: "Store A", revenue: 12345.67 },
  },
  effectScatter: {
    description: "Scatter with emphasis animation.",
    minimumFields: 2,
    required: ["1 category/label field", "1 numeric field"],
    sampleRow: { region: "North", count: 98 },
  },
  pictorialBar: {
    description: "Bar chart using symbols/icons.",
    minimumFields: 2,
    required: ["1 category field", "1 numeric field"],
    sampleRow: { product: "Plan A", users: 4200 },
  },
  pie: {
    description: "Part-to-whole distribution.",
    minimumFields: 2,
    required: ["1 category/segment field", "1 numeric value field"],
    sampleRow: { payment_type: "EWallet", total_amount: 4014.24 },
  },
  funnel: {
    description: "Sequential stage drop-off.",
    minimumFields: 2,
    required: ["1 stage/category field", "1 numeric value field"],
    sampleRow: { stage: "Checkout", users: 8400 },
  },
  gauge: {
    description: "Single KPI progress meter.",
    minimumFields: 1,
    required: ["1 numeric value field"],
    optional: ["1 label field (optional)"],
    sampleRow: { completion_rate: 72.5 },
    notes: ["Only first numeric value is used."],
  },
  radar: {
    description: "Compare multiple dimensions for one profile.",
    minimumFields: 2,
    required: ["1 dimension/category field", "1 numeric value field"],
    optional: ["Additional numeric fields"],
    sampleRow: { metric: "Speed", score: 86 },
  },
  heatmap: {
    description: "Intensity map by category cell.",
    minimumFields: 2,
    required: ["1 category field", "1 numeric value field"],
    sampleRow: { day: "Mon", transactions: 1200 },
  },
  tree: {
    description: "Hierarchical view (auto-built from flat rows).",
    minimumFields: 2,
    required: ["1 category field", "1 numeric value field"],
    sampleRow: { segment: "Enterprise", amount: 53200 },
  },
  treemap: {
    description: "Nested area sizing by value.",
    minimumFields: 2,
    required: ["1 category field", "1 numeric value field"],
    sampleRow: { team: "A", cost: 23000 },
  },
  sunburst: {
    description: "Radial hierarchical view.",
    minimumFields: 2,
    required: ["1 category field", "1 numeric value field"],
    sampleRow: { channel: "Online", value: 34200 },
  },
  candlestick: {
    description: "OHLC financial-style chart.",
    minimumFields: 5,
    required: [
      "1 category/timestamp field",
      "4 numeric fields: open, close, low, high",
    ],
    sampleRow: {
      date: "2026-02-19",
      open: 100,
      close: 108,
      low: 95,
      high: 112,
    },
    notes: ["Numeric field order matters for correct OHLC rendering."],
  },
  boxplot: {
    description: "Distribution summary with quartiles.",
    minimumFields: 6,
    required: [
      "1 category field",
      "5 numeric fields: min, q1, median, q3, max",
    ],
    sampleRow: {
      segment: "A",
      min: 10,
      q1: 22,
      median: 35,
      q3: 47,
      max: 61,
    },
    notes: ["Numeric field order matters for boxplot rendering."],
  },
  table: {
    description: "Tabular list view for raw query results.",
    minimumFields: 1,
    required: ["1+ fields from any query result"],
    optional: ["Any number of rows and columns"],
    sampleRow: { country: "Malaysia", population: 34500000, year: 2025 },
    notes: ["Useful when users need exact values instead of a chart."],
  },
};

const getChartTypeGuide = (type: string): ChartTypeGuide => {
  return (
    CHART_TYPE_GUIDES[type] ?? {
      description: "Generic support with automatic fallback rendering.",
      minimumFields: 2,
      required: ["1 category field", "1 numeric field"],
      sampleRow: { category: "A", value: 120 },
      notes: [
        "If this chart needs special schema, dashboard falls back to bar visualization.",
      ],
    }
  );
};

/**
 * Build ECharts option dynamically based on query.data
 * This supports generic SQL results like:
 *
 * [
 *   { type: "CreditCard", sum_amount: 308 },
 *   { type: "FPX", sum_amount: 86790 }
 * ]
 */
export function buildOption(
  type: ChartType,
  data: QueryRow[] = [],
  schema?: string[],
): echarts.EChartsOption {
  if (!data.length) {
    return {
      title: {
        text: "No Data",
        left: "center",
        top: "middle",
        textStyle: { color: "#cbd5e1", fontSize: 20, fontWeight: 700 },
      },
    };
  }

  const { keys, valueKeys, categoryKey, primaryValueKey } = inferDataShape(
    data,
    schema,
  );
  const categoryData = data.map((row) => toLabel(row[categoryKey]));
  const baseSeriesData = data.map(
    (row) => toNumeric(row[primaryValueKey]) ?? 0,
  );
  const nameValuePairs = data.map((row, index) => ({
    name: toLabel(row[categoryKey] ?? `Item ${index + 1}`),
    value: toNumeric(row[primaryValueKey]) ?? 0,
  }));
  const selectedType = String(type);
  const isStackedArea = selectedType === "stackedArea";
  const isStackedBar = selectedType === "stackedBar";

  if (selectedType === "pie" || selectedType === "funnel") {
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderColor: "rgba(148, 163, 184, 0.3)",
        textStyle: { color: "#e2e8f0" },
        valueFormatter: (value) => formatCompactNumber(value),
      },
      legend: {
        bottom: 4,
        textStyle: { color: "#cbd5e1", fontSize: 12 },
        itemWidth: 10,
        itemHeight: 10,
        type: "scroll",
      },
      series: [
        {
          type: selectedType as any,
          radius: selectedType === "pie" ? ["42%", "72%"] : undefined,
          center: selectedType === "pie" ? ["50%", "46%"] : undefined,
          minAngle: 3,
          itemStyle: {
            borderColor: "rgba(15, 23, 42, 0.7)",
            borderWidth: 2,
          },
          labelLine: {
            length: 12,
            length2: 8,
            lineStyle: { color: "rgba(203, 213, 225, 0.55)" },
          },
          label: {
            color: "#e2e8f0",
            fontSize: 12,
            formatter: "{name|{b}} {percent|{d}%}",
            rich: {
              name: { color: "#cbd5e1", fontWeight: 500 },
              percent: { color: "#f8fafc", fontWeight: 700 },
            },
          },
          data: data.map((row) => ({
            name: toLabel(row[categoryKey]),
            value: toNumeric(row[primaryValueKey]) ?? 0,
          })),
        },
      ],
    };
  }

  if (selectedType === "gauge") {
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderColor: "rgba(148, 163, 184, 0.3)",
        textStyle: { color: "#e2e8f0" },
      },
      series: [
        {
          type: "gauge",
          progress: { show: true, width: 14 },
          axisLine: { lineStyle: { width: 14 } },
          detail: {
            valueAnimation: true,
            color: "#f8fafc",
            formatter: (value: number) => formatCompactNumber(value),
          },
          data: [{ value: baseSeriesData[0] ?? 0 }],
        },
      ],
    };
  }

  if (selectedType === "radar") {
    const maxValue = Math.max(...baseSeriesData, 1);
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      radar: {
        indicator: nameValuePairs.map((entry) => ({
          name: entry.name,
          max: Math.ceil(maxValue * 1.2),
        })),
        axisName: { color: "#cbd5e1" },
      },
      series: [
        {
          type: "radar",
          data: [{ value: nameValuePairs.map((entry) => entry.value) }],
          areaStyle: { color: "rgba(96, 165, 250, 0.25)" },
          lineStyle: { color: "#60a5fa" },
        },
      ],
    };
  }

  if (selectedType === "sunburst") {
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      series: [
        {
          type: "sunburst",
          radius: ["20%", "85%"],
          data: nameValuePairs,
          label: { color: "#e2e8f0" },
        },
      ],
    };
  }

  if (selectedType === "treemap") {
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      series: [
        {
          type: "treemap",
          data: nameValuePairs,
          label: { color: "#e2e8f0" },
        },
      ],
    };
  }

  if (selectedType === "tree") {
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      series: [
        {
          type: "tree",
          data: [
            {
              name: keys[0] ? toLabel(keys[0]) : "Data",
              children: nameValuePairs.map((entry) => ({
                name: `${entry.name}: ${formatCompactNumber(entry.value)}`,
              })),
            },
          ],
          top: "8%",
          left: "8%",
          bottom: "10%",
          right: "20%",
          symbolSize: 8,
          label: { color: "#e2e8f0" },
          lineStyle: { color: "rgba(148, 163, 184, 0.5)" },
        },
      ],
    };
  }

  if (selectedType === "heatmap") {
    return {
      backgroundColor: "transparent",
      tooltip: { position: "top" },
      xAxis: {
        type: "category",
        data: categoryData,
        axisLabel: { color: "#cbd5e1" },
      },
      yAxis: {
        type: "category",
        data: [primaryValueKey],
        axisLabel: { color: "#cbd5e1" },
      },
      visualMap: {
        min: Math.min(...baseSeriesData),
        max: Math.max(...baseSeriesData, 1),
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        textStyle: { color: "#cbd5e1" },
      },
      series: [
        {
          type: "heatmap",
          data: baseSeriesData.map((value, index) => [index, 0, value]),
          label: { show: false },
        },
      ],
    };
  }

  if (selectedType === "candlestick" && valueKeys.length >= 4) {
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: categoryData,
        axisLabel: { color: "#cbd5e1" },
      },
      yAxis: { scale: true, axisLabel: { color: "#cbd5e1" } },
      series: [
        {
          type: "candlestick",
          data: data.map((row) =>
            valueKeys.slice(0, 4).map((key) => toNumeric(row[key]) ?? 0),
          ),
        },
      ],
    };
  }

  if (selectedType === "boxplot" && valueKeys.length >= 5) {
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      xAxis: {
        type: "category",
        data: categoryData,
        axisLabel: { color: "#cbd5e1" },
      },
      yAxis: { type: "value", axisLabel: { color: "#cbd5e1" } },
      series: [
        {
          type: "boxplot",
          data: data.map((row) =>
            valueKeys.slice(0, 5).map((key) => toNumeric(row[key]) ?? 0),
          ),
        },
      ],
    };
  }

  const isMultiCartesianType =
    selectedType === "line" ||
    selectedType === "bar" ||
    isStackedArea ||
    isStackedBar ||
    selectedType === "scatter" ||
    selectedType === "effectScatter" ||
    selectedType === "pictorialBar";
  const fallbackSeries =
    (fallbackCartesianOption(selectedType, categoryData, baseSeriesData)
      .series as any[]) ?? [];
  const cartesianSeries = isMultiCartesianType
    ? valueKeys.map((key, index) => {
        const palette =
          CARTESIAN_SERIES_PALETTE[index % CARTESIAN_SERIES_PALETTE.length];

        return {
          type: isStackedArea
            ? ("line" as const)
            : isStackedBar
              ? ("bar" as const)
              : (selectedType as any),
          name: key,
          data: data.map((row) => toNumeric(row[key]) ?? 0),
          stack: isStackedArea || isStackedBar ? "total" : undefined,
          smooth: selectedType === "line" || isStackedArea,
          barMaxWidth: selectedType === "bar" || isStackedBar ? 42 : undefined,
          emphasis: {
            focus: "series" as const,
          },
          itemStyle: {
            color: palette.solid,
            borderColor:
              selectedType === "bar" || isStackedBar
                ? palette.border
                : palette.solid,
            borderWidth: selectedType === "bar" || isStackedBar ? 1.25 : 0,
            borderRadius:
              selectedType === "bar" ? [8, 8, 0, 0] : isStackedBar ? 0 : 0,
          },
          lineStyle: {
            width: 3,
            color: palette.stroke,
          },
          areaStyle:
            selectedType === "line" || isStackedArea
              ? {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    {
                      offset: 0,
                      color: palette.fillTop,
                    },
                    {
                      offset: 1,
                      color: palette.fillBottom,
                    },
                  ]),
                }
              : undefined,
        };
      })
    : fallbackSeries;

  return {
    backgroundColor: "transparent",
    grid: {
      left: 28,
      right: 20,
      top: 28,
      bottom: 40,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      borderColor: "rgba(148, 163, 184, 0.3)",
      textStyle: { color: "#e2e8f0" },
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => formatCompactNumber(value),
    },
    xAxis: {
      type: "category",
      data: categoryData,
      axisLabel: {
        color: "#cbd5e1",
        fontSize: 11,
        formatter: (value: string) =>
          value?.length > 14 ? `${value.slice(0, 14)}...` : value,
      },
      axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.45)" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#cbd5e1",
        fontSize: 11,
        formatter: (value: number) => formatCompactNumber(value),
      },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
    },
    series: [...cartesianSeries],
    ...(isMultiCartesianType
      ? {}
      : {
          title: {
            text: `${selectedType} needs specialized schema`,
            subtext: "Showing fallback bar series",
            left: "center",
            top: 4,
            textStyle: { color: "#e2e8f0", fontSize: 13, fontWeight: 600 },
            subtextStyle: { color: "#94a3b8", fontSize: 11 },
          },
        }),
  };
}

export default function PopulationDashboard() {
  const { currentUser } = useAuth();
  const currentRoleName = normalizeRoleName(currentUser?.role?.name);
  const isSuperAdmin = currentRoleName === "SUPER_ADMIN";
  const isViewer = currentRoleName === "VIEWER";
  const canManageDashboardMeta = new Set([
    "SUPER_ADMIN",
    "ADMIN",
    "EDITOR",
  ]).has(currentRoleName);
  const userDepartmentValue =
    currentUser?.department?.slug || currentUser?.department?.name || "";
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<GridStack | null>(null);

  // chart instances by widget id
  const chartsRef = useRef<Record<string, ChartsMeta>>({});
  const widgetsMetaRef = useRef<Record<string, WidgetMeta>>({});
  const widgetsRef = useRef<DashboardWidget[]>([]);
  const queriesRef = useRef<Query[]>([]);
  const dashboardVariablesRef = useRef<QueryVariableMap>({});
  const globalFilterKeySetRef = useRef<Set<string>>(new Set());
  const headerControlsRootsRef = useRef<Record<string, Root>>({});
  const widgetTableSizeChangeRef = useRef<
    (widgetId: string, pageSize: number) => void
  >(() => undefined);
  const dashboardLoadRequestRef = useRef(0);
  const dashboardLoadAbortRef = useRef<AbortController | null>(null);

  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [dashboardOptions, setDashboardOptions] = useState<DashboardSummary[]>(
    [],
  );
  const [selectedDashboardId, setSelectedDashboardIdState] = useState("");
  const [loadingDashboardOptions, setLoadingDashboardOptions] = useState(true);
  const [dashboardSelectorOpen, setDashboardSelectorOpen] = useState(false);

  const [dashboardName, setDashboardName] = useState("My Dashboard");
  const [dashboardDescription, setDashboardDescription] = useState("");
  const [dashboardVariables, setDashboardVariables] =
    useState<QueryVariableMap>({});
  const [persistedDashboardVariables, setPersistedDashboardVariables] =
    useState<QueryVariableMap>({});
  const [dashboardFilterDefinitions, setDashboardFilterDefinitions] = useState<
    Record<string, DashboardFilterDefinition>
  >({});
  const [editingDashboardMeta, setEditingDashboardMeta] = useState(false);
  const [dashboardNameDraft, setDashboardNameDraft] = useState("My Dashboard");
  const [dashboardDescriptionDraft, setDashboardDescriptionDraft] =
    useState("");
  const [updatingDashboardMeta, setUpdatingDashboardMeta] = useState(false);
  const [showCreateDashboardModal, setShowCreateDashboardModal] =
    useState(false);
  const [creatingDashboard, setCreatingDashboard] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [newDashboardDescription, setNewDashboardDescription] = useState("");
  const [newDashboardDepartment, setNewDashboardDepartment] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [selectedChartType, setSelectedChartType] = useState<ChartType>("line");

  const [saving, setSaving] = useState(false);
  const [loadingDashboardStructure, setLoadingDashboardStructure] =
    useState(false);

  const [queries, setQueries] = useState<Query[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState<string>("");
  const [selectedQueryPreview, setSelectedQueryPreview] =
    useState<QueryPreview | null>(null);
  const [loadingQueryPreview, setLoadingQueryPreview] = useState(false);
  const [widgetSettings, setWidgetSettings] =
    useState<WidgetSettingsState | null>(null);

  const navigate = useNavigate();
  const selectedDashboardOption = useMemo(
    () =>
      dashboardOptions.find(
        (dashboard) => dashboard.id === selectedDashboardId,
      ) ?? null,
    [dashboardOptions, selectedDashboardId],
  );
  const selectedDashboardDepartmentValue = useMemo(
    () =>
      selectedDashboardOption?.department?.slug ||
      selectedDashboardOption?.department?.name ||
      selectedDashboardOption?.department_id ||
      "",
    [selectedDashboardOption],
  );
  const availableQueries = useMemo(() => {
    if (!isSuperAdmin) {
      return queries;
    }

    const normalizedDepartment = selectedDashboardDepartmentValue
      .trim()
      .toLowerCase();

    if (!normalizedDepartment) {
      return [];
    }

    return queries.filter((query) => {
      const queryDepartment =
        query.department?.slug ||
        query.department?.name ||
        query.department_id ||
        "";

      return queryDepartment.trim().toLowerCase() === normalizedDepartment;
    });
  }, [isSuperAdmin, queries, selectedDashboardDepartmentValue]);
  const hasDashboardMetaChanges = useMemo(
    () =>
      dashboardNameDraft.trim() !== dashboardName.trim() ||
      dashboardDescriptionDraft.trim() !== dashboardDescription.trim(),
    [
      dashboardDescription,
      dashboardDescriptionDraft,
      dashboardName,
      dashboardNameDraft,
    ],
  );
  const chartTypeOptions = useMemo(() => {
    const toLabel = (type: string) =>
      type
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (char) => char.toUpperCase())
        .trim();

    const chartTypes = Object.keys(echartsCharts)
      .filter((key) => key.endsWith("Chart"))
      .map((key) => key.replace(/Chart$/, ""))
      .map((base) => `${base.charAt(0).toLowerCase()}${base.slice(1)}`)
      .filter((value, index, array) => array.indexOf(value) === index)
      .concat("stackedArea", "stackedBar")
      .concat("table")
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({
        value,
        label: toLabel(value),
      }));

    return chartTypes;
  }, []);
  const selectedChartGuide = useMemo(
    () => getChartTypeGuide(String(selectedChartType)),
    [selectedChartType],
  );
  const selectedQueryShape = useMemo(
    () =>
      selectedQueryPreview
        ? summarizeQueryShape(
            selectedQueryPreview.data,
            selectedQueryPreview.schema,
          )
        : null,
    [selectedQueryPreview],
  );
  const selectedChartPreview = useMemo(
    () =>
      buildChartPreviewSummary(
        String(selectedChartType),
        selectedQueryPreview?.data ?? [],
        selectedQueryPreview?.schema,
      ),
    [selectedChartType, selectedQueryPreview],
  );
  const compatibleChartTypes = useMemo(
    () =>
      new Set(
        chartTypeOptions
          .filter((option) =>
            isChartTypeCompatible(option.value, selectedQueryShape),
          )
          .map((option) => option.value),
      ),
    [chartTypeOptions, selectedQueryShape],
  );
  const dynamicFilterTopology = useMemo(() => {
    const widgetCandidates = widgets.flatMap((widget) => {
      if (!widget.queryId) {
        return [];
      }

      const meta = widgetsMetaRef.current[widget.id];

      return getWidgetScopedVariableDefinitions(
        widget.id,
        meta?.variableDefinitions ?? [],
      );
    });

    const usage = widgetCandidates.reduce<
      Record<
        string,
        {
          definitions: WidgetScopedVariableDefinition[];
          widgetIds: Set<string>;
        }
      >
    >((acc, definition) => {
      const groupKey = `${definition.dashboardKey}::${definition.label}`;
      const current = acc[groupKey] ?? {
        definitions: [],
        widgetIds: new Set<string>(),
      };

      current.definitions.push(definition);
      current.widgetIds.add(definition.widgetId);
      acc[groupKey] = current;
      return acc;
    }, {});

    const globalDefinitions = Object.values(usage).reduce<
      Record<string, DashboardFilterDefinition>
    >((acc, entry) => {
      if (entry.widgetIds.size < 2) {
        return acc;
      }

      const [firstDefinition] = entry.definitions;
      const existing = acc[firstDefinition.dashboardKey];
      const mergedFromState =
        dashboardFilterDefinitions[firstDefinition.dashboardKey];

      acc[firstDefinition.dashboardKey] = {
        ...(existing ?? mergedFromState ?? firstDefinition),
        key: firstDefinition.dashboardKey,
        label:
          existing?.label ?? mergedFromState?.label ?? firstDefinition.label,
        type: existing?.type ?? mergedFromState?.type ?? firstDefinition.type,
        multiple:
          existing?.multiple ??
          mergedFromState?.multiple ??
          firstDefinition.multiple,
        options: mergeVariableOptions(
          existing?.options,
          mergedFromState?.options,
          ...entry.definitions.map((item) => item.options),
        ),
      };

      return acc;
    }, {});

    const widgetDefinitions = widgetCandidates.reduce<
      Record<string, WidgetScopedVariableDefinition[]>
    >((acc, definition) => {
      const groupKey = `${definition.dashboardKey}::${definition.label}`;
      const entry = usage[groupKey];

      if (entry.widgetIds.size >= 2) {
        return acc;
      }

      acc[definition.widgetId] = [
        ...(acc[definition.widgetId] ?? []),
        definition,
      ];
      return acc;
    }, {});

    return {
      globalDefinitions: Object.values(globalDefinitions),
      hasAnyVariables: widgetCandidates.length > 0,
      widgetDefinitions,
    };
  }, [dashboardFilterDefinitions, widgets]);
  const globalFilterKeySet = useMemo(
    () =>
      new Set(
        dynamicFilterTopology.globalDefinitions.map(
          (definition) => definition.key,
        ),
      ),
    [dynamicFilterTopology.globalDefinitions],
  );
  const persistableDashboardVariables = useMemo(
    () =>
      Object.entries(dashboardVariables).reduce<QueryVariableMap>(
        (acc, [key, value]) => {
          if (globalFilterKeySet.has(key)) {
            acc[key] = value;
          }

          return acc;
        },
        {},
      ),
    [dashboardVariables, globalFilterKeySet],
  );
  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  useEffect(() => {
    queriesRef.current = queries;
  }, [queries]);

  useEffect(() => {
    dashboardVariablesRef.current = dashboardVariables;
  }, [dashboardVariables]);

  useEffect(() => {
    globalFilterKeySetRef.current = globalFilterKeySet;
  }, [globalFilterKeySet]);

  useEffect(() => {
    setDashboardNameDraft(dashboardName);
  }, [dashboardName]);

  useEffect(() => {
    setDashboardDescriptionDraft(dashboardDescription);
  }, [dashboardDescription]);

  useEffect(() => {
    setNewDashboardDepartment(userDepartmentValue);
  }, [userDepartmentValue]);

  const loadDashboardOptions = useCallback(
    async (options?: { preserveSelection?: boolean }) => {
      const preserveSelection = options?.preserveSelection ?? true;
      const dashboards = await fetchDashboards(currentUser?.role?.name);

      setDashboardOptions(dashboards);

      if (!dashboards.length) {
        clearSelectedDashboardId();
        setSelectedDashboardIdState("");
        setDashboardVariables({});
        setPersistedDashboardVariables({});
        setDashboardFilterDefinitions({});
        setDashboardSelectorOpen(false);
        return dashboards;
      }

      const candidateId = preserveSelection
        ? selectedDashboardId || getSelectedDashboardId()
        : getSelectedDashboardId();
      const matchedDashboard = dashboards.find(
        (dashboard) => dashboard.id === candidateId,
      );

      if (matchedDashboard) {
        setSelectedDashboardIdState(matchedDashboard.id);
        setSelectedDashboardId(matchedDashboard.id);
        setDashboardSelectorOpen(false);
        return dashboards;
      }

      clearSelectedDashboardId();
      setSelectedDashboardIdState("");
      setDashboardSelectorOpen(true);
      return dashboards;
    },
    [currentUser?.role?.name, selectedDashboardId],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoadingDashboardOptions(true);

        if (cancelled) return;
        const dashboards = await loadDashboardOptions({
          preserveSelection: true,
        });
        if (cancelled) return;
        if (!dashboards.length) {
          toast.error("No dashboards are available for this account.");
        }
      } catch (err) {
        if (cancelled) return;

        setDashboardOptions([]);
        setSelectedDashboardIdState("");
        clearSelectedDashboardId();
        toast.error("Failed to load dashboards: " + (err as Error).message);
      } finally {
        if (!cancelled) {
          setLoadingDashboardOptions(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadDashboardOptions]);

  const handleDashboardSelectionChange = useCallback((dashboardId: string) => {
    setSelectedDashboardIdState(dashboardId);
    setSelectedDashboardId(dashboardId);
    setDashboardSelectorOpen(false);
  }, []);

  const handleStartDashboardMetaEdit = useCallback(() => {
    if (!canManageDashboardMeta) return;
    setDashboardNameDraft(dashboardName);
    setDashboardDescriptionDraft(dashboardDescription);
    setEditingDashboardMeta(true);
  }, [canManageDashboardMeta, dashboardDescription, dashboardName]);

  const handleCancelDashboardMetaEdit = useCallback(() => {
    setDashboardNameDraft(dashboardName);
    setDashboardDescriptionDraft(dashboardDescription);
    setEditingDashboardMeta(false);
  }, [dashboardDescription, dashboardName]);

  const handleUpdateDashboardMeta = useCallback(async () => {
    if (!canManageDashboardMeta) return;
    if (!selectedDashboardId) return;

    const nextName = dashboardNameDraft.trim();
    const nextDescription = dashboardDescriptionDraft.trim();

    if (!nextName) {
      toast.error("Dashboard name is required.");
      return;
    }

    try {
      setUpdatingDashboardMeta(true);

      await updateDashboard(selectedDashboardId, {
        name: nextName,
        description: nextDescription,
        variables: persistableDashboardVariables,
      });

      setDashboardName(nextName);
      setDashboardDescription(nextDescription);
      setPersistedDashboardVariables(persistableDashboardVariables);
      setEditingDashboardMeta(false);

      const dashboards = await loadDashboardOptions({
        preserveSelection: true,
      });
      const updatedDashboard = dashboards.find(
        (dashboard) => dashboard.id === selectedDashboardId,
      );

      if (updatedDashboard) {
        setDashboardName(updatedDashboard.name || nextName);
        setDashboardDescription(
          updatedDashboard.description || nextDescription,
        );
      }

      toast.success("Dashboard details updated.");
    } catch (err) {
      toast.error("Failed to update dashboard: " + (err as Error).message);
    } finally {
      setUpdatingDashboardMeta(false);
    }
  }, [
    canManageDashboardMeta,
    dashboardDescriptionDraft,
    dashboardNameDraft,
    loadDashboardOptions,
    persistableDashboardVariables,
    selectedDashboardId,
  ]);

  const handleCreateDashboard = useCallback(async () => {
    if (!canManageDashboardMeta) return;

    const department = (
      isSuperAdmin ? newDashboardDepartment : userDepartmentValue
    ).trim();
    const name = newDashboardName.trim();
    const description = newDashboardDescription.trim();

    if (!department) {
      toast.error("Department is required.");
      return;
    }

    if (!name) {
      toast.error("Dashboard name is required.");
      return;
    }

    try {
      setCreatingDashboard(true);

      const result = await createDashboard({
        department,
        name,
        description,
      });

      const createdDashboardId = result?.data?.id || result?.data?.dashboard_id;
      const dashboards = await loadDashboardOptions({
        preserveSelection: false,
      });

      let nextDashboardId = "";

      if (createdDashboardId) {
        nextDashboardId =
          dashboards.find((dashboard) => dashboard.id === createdDashboardId)
            ?.id || createdDashboardId;
      }

      if (!nextDashboardId) {
        nextDashboardId =
          dashboards.find((dashboard) => dashboard.name === name)?.id || "";
      }

      if (nextDashboardId) {
        handleDashboardSelectionChange(nextDashboardId);
      }

      setShowCreateDashboardModal(false);
      setDashboardSelectorOpen(false);
      setNewDashboardName("");
      setNewDashboardDescription("");
      setNewDashboardDepartment(userDepartmentValue);
      toast.success("Dashboard created successfully.");
    } catch (err) {
      toast.error("Failed to create dashboard: " + (err as Error).message);
    } finally {
      setCreatingDashboard(false);
    }
  }, [
    canManageDashboardMeta,
    handleDashboardSelectionChange,
    isSuperAdmin,
    loadDashboardOptions,
    newDashboardDepartment,
    newDashboardDescription,
    newDashboardName,
    userDepartmentValue,
  ]);

  const updateWidgetData = useCallback(
    (id: string, data: QueryRow[], schema?: string[]) => {
      setWidgets((prev) =>
        prev.map((widget) =>
          widget.id === id
            ? {
                ...widget,
                data,
                schema,
              }
            : widget,
        ),
      );
    },
    [],
  );

  const updateWidgetTitle = useCallback((id: string, title: string) => {
    setWidgets((prev) =>
      prev.map((widget) => (widget.id === id ? { ...widget, title } : widget)),
    );

    const titleElement = document.querySelector<HTMLElement>(
      `[data-widget-title="${id}"]`,
    );

    if (titleElement) {
      titleElement.textContent = title;
    }
  }, []);

  const exportWidgetCsv = useCallback((id: string) => {
    const widget = widgetsRef.current.find((item) => item.id === id);
    if (!widget) {
      toast.error("Widget not found.");
      return;
    }

    const csv = buildCsvContent(widget.data ?? [], widget.schema);
    if (!csv) {
      toast.error("No data available to export.");
      return;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = (widget.title || "widget-data")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();

    link.href = url;
    link.download = `${safeTitle || "widget-data"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const resizeAllCharts = useCallback(() => {
    const charts = chartsRef.current;
    Object.values(charts).forEach((meta) => meta?.instance?.resize?.());
  }, []);

  const destroyChart = useCallback((id: string) => {
    const meta = chartsRef.current[id];
    meta?.observer?.disconnect?.();
    meta?.instance?.dispose?.();
    meta?.root?.unmount?.();
    meta?.statusRoot?.unmount?.();
    delete chartsRef.current[id];

    headerControlsRootsRef.current[id]?.unmount?.();
    delete headerControlsRootsRef.current[id];
  }, []);

  const deleteWidget = useCallback(
    (el: HTMLElement) => {
      const node = (el as any).gridstackNode as GridStackNode | undefined;
      const id =
        node?.id?.toString() ||
        el.querySelector(".grid-stack-item-content [id]")?.getAttribute("id") ||
        el.querySelector("[id]")?.getAttribute("id");

      if (id) destroyChart(id);

      gridRef.current?.removeWidget(el);
    },
    [destroyChart],
  );

  const getBottomY = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return 0;
    return grid.getRow();
  }, []);

  const ensureWidgetDom = useCallback((id: string, title: string) => {
    const wrapper = document.createElement("div");

    wrapper.innerHTML = `
      <div class="grid-stack-item">
        <div class="grid-stack-item-content overflow-hidden rounded-2xl border border-white/10 bg-slate-900/45 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl flex flex-col">
          <div class="px-4 py-3 border-b border-white/10 font-semibold text-slate-100 flex justify-between items-center gap-3">
            <span class="truncate" data-widget-title="${id}">${title}</span>
            <div data-widget-header-controls="${id}"></div>
          </div>
          <div class="relative flex flex-1 min-h-0 flex-col">
            <div id="${id}" class="flex-1 min-h-50"></div>
            <div data-widget-status="${id}" class="pointer-events-none absolute inset-0 z-10 hidden"></div>
          </div>
        </div>
      </div>
    `;

    return wrapper.firstElementChild as HTMLElement;
  }, []);

  const setWidgetBodyMode = useCallback((id: string, type: ChartType) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.remove(
      "flex-1",
      "min-h-50",
      "min-h-0",
      "h-full",
      "h-auto",
      "w-full",
    );

    if (type === "table") {
      el.classList.add("h-full", "w-full", "min-h-0");
      return;
    }

    el.classList.add("flex-1", "min-h-50");
  }, []);

  const renderWidgetStatus = useCallback(
    (
      id: string,
      content: ReactNode,
      className = "bg-slate-950/72 backdrop-blur-[2px]",
    ) => {
      const statusEl = document.querySelector<HTMLElement>(
        `[data-widget-status="${id}"]`,
      );

      if (!statusEl) return;

      statusEl.className = `pointer-events-none absolute inset-0 z-10 flex items-center justify-center ${className}`;

      const existingStatusRoot = chartsRef.current[id]?.statusRoot;
      const statusRoot = existingStatusRoot ?? createRoot(statusEl);
      statusRoot.render(content);

      const existingMeta = chartsRef.current[id];

      if (existingMeta) {
        existingMeta.statusRoot = statusRoot;
        return;
      }

      chartsRef.current[id] = {
        type: chartsRef.current[id]?.type ?? "bar",
        statusRoot,
      };
    },
    [],
  );

  const clearWidgetStatus = useCallback((id: string) => {
    const statusEl = document.querySelector<HTMLElement>(
      `[data-widget-status="${id}"]`,
    );

    if (!statusEl) return;

    statusEl.className = "pointer-events-none absolute inset-0 z-10 hidden";
    chartsRef.current[id]?.statusRoot?.render(null);
  }, []);

  const renderWidgetHeaderControls = useCallback(
    (id: string, type: ChartType, config?: DashboardWidgetConfig) => {
      const mountEl = document.querySelector<HTMLElement>(
        `[data-widget-header-controls="${id}"]`,
      );

      if (!mountEl) {
        return;
      }

      const root = headerControlsRootsRef.current[id] ?? createRoot(mountEl);
      headerControlsRootsRef.current[id] = root;

      root.render(
        <WidgetHeaderControls
          widgetId={id}
          type={type}
          tablePageSize={getWidgetTablePageSize(config)}
          onTablePageSizeChange={(widgetId, pageSize) =>
            widgetTableSizeChangeRef.current(widgetId, pageSize)
          }
        />,
      );
    },
    [],
  );

  /**
   * Initialize chart instance
   * Chart now renders directly from API query.data
   */
  const initChart = useCallback(
    (
      id: string,
      type: ChartType,
      data: QueryRow[] = [],
      schema?: string[],
      config?: DashboardWidgetConfig,
    ) => {
      const el = document.getElementById(id);
      if (!el) return;

      destroyChart(id);
      setWidgetBodyMode(id, type);
      renderWidgetHeaderControls(id, type, config);

      if (type === "table") {
        const root = createRoot(el);
        root.render(
          <TableWidgetView
            data={data}
            schema={schema}
            tablePageSize={getWidgetTablePageSize(config)}
          />,
        );
        chartsRef.current[id] = { type, root };
        return;
      }

      const chart = echarts.init(el);

      chart.setOption(buildOption(type, data, schema), { notMerge: true });

      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(el);

      chartsRef.current[id] = {
        instance: chart,
        type,
        observer,
      };
    },
    [destroyChart, renderWidgetHeaderControls, setWidgetBodyMode],
  );

  const handleWidgetTablePageSizeChange = useCallback(
    (widgetId: string, pageSize: number) => {
      const widget = widgetsRef.current.find((item) => item.id === widgetId);
      if (!widget || widget.chartType !== "table") {
        return;
      }

      const nextConfig = normalizeWidgetConfig({
        ...(widgetsMetaRef.current[widgetId]?.config ?? widget.config ?? {}),
        table_page_size: pageSize,
      });

      const existingMeta = widgetsMetaRef.current[widgetId];
      if (existingMeta) {
        widgetsMetaRef.current[widgetId] = {
          ...existingMeta,
          config: nextConfig,
        };
      }

      setWidgets((prev) =>
        prev.map((item) =>
          item.id === widgetId ? { ...item, config: nextConfig } : item,
        ),
      );

      initChart(
        widgetId,
        widget.chartType,
        widget.data ?? [],
        widget.schema,
        nextConfig,
      );
    },
    [initChart],
  );
  widgetTableSizeChangeRef.current = handleWidgetTablePageSizeChange;

  const setWidgetLoading = useCallback(
    (id: string, type: ChartType) => {
      const el = document.getElementById(id);
      if (!el) return;
      setWidgetBodyMode(id, type);
      renderWidgetStatus(
        id,
        <div className="flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-slate-900/88 px-4 py-3 text-sm text-slate-100 shadow-lg">
          <Spinner className="size-4 text-cyan-300" />
          <div>
            <p className="font-medium">Running query...</p>
            <p className="text-xs text-slate-300">
              Loading this widget&apos;s data.
            </p>
          </div>
        </div>,
      );
    },
    [renderWidgetStatus, setWidgetBodyMode],
  );

  const setWidgetError = useCallback(
    (id: string, type: ChartType) => {
      const el = document.getElementById(id);
      if (!el) return;
      setWidgetBodyMode(id, type);

      renderWidgetStatus(
        id,
        <div className="rounded-xl border border-rose-400/30 bg-slate-950/88 px-4 py-3 text-center text-sm font-medium text-rose-200 shadow-lg">
          Query failed
        </div>,
        "bg-slate-950/76 backdrop-blur-[2px]",
      );

      if (type === "table") {
        return;
      }

      chartsRef.current[id]?.instance?.setOption({
        title: {
          text: "Query Failed",
          left: "center",
          textStyle: { color: "#f87171" },
        },
      });
    },
    [renderWidgetStatus, setWidgetBodyMode],
  );

  const setWidgetNeedsVariables = useCallback(
    (
      id: string,
      type: ChartType,
      missingVariables: QueryVariableDefinition[],
    ) => {
      const el = document.getElementById(id);
      if (!el) return;
      setWidgetBodyMode(id, type);

      renderWidgetStatus(
        id,
        <div className="rounded-xl border border-amber-300/30 bg-slate-950/88 px-4 py-3 text-center text-sm text-amber-100 shadow-lg">
          <p className="font-medium">Widget needs filters before it can run</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Missing: {missingVariables.map((item) => item.label).join(", ")}
          </p>
        </div>,
        "bg-slate-950/76 backdrop-blur-[2px]",
      );
    },
    [renderWidgetStatus, setWidgetBodyMode],
  );

  const renderWidgetResult = useCallback(
    (id: string, type: ChartType, data: QueryRow[], schema?: string[]) => {
      const applyData = () => {
        const meta = chartsRef.current[id];

        if (!meta) {
          requestAnimationFrame(applyData);
          return;
        }

        if (type === "table") {
          clearWidgetStatus(id);
          initChart(id, type, data, schema, widgetsMetaRef.current[id]?.config);
          return;
        }

        clearWidgetStatus(id);
        meta.instance?.resize();
        meta.instance?.setOption(buildOption(type, data, schema), {
          notMerge: true,
        });
      };

      applyData();
    },
    [clearWidgetStatus, initChart],
  );

  const updateWidgetConfig = useCallback(
    (widgetId: string, config: DashboardWidgetConfig) => {
      const normalizedConfig = normalizeWidgetConfig(config);
      const existingMeta = widgetsMetaRef.current[widgetId];

      if (existingMeta) {
        widgetsMetaRef.current[widgetId] = {
          ...existingMeta,
          config: normalizedConfig,
        };
      }

      setWidgets((prev) =>
        prev.map((widget) =>
          widget.id === widgetId
            ? { ...widget, config: normalizedConfig }
            : widget,
        ),
      );
      renderWidgetHeaderControls(
        widgetId,
        existingMeta?.chartType ?? "table",
        normalizedConfig,
      );
    },
    [renderWidgetHeaderControls],
  );

  const loadWidgetVariableDefinitions = useCallback(async (queryId: string) => {
    const filterMetadata = await fetchQueryFilters(queryId);

    return enrichVariableDefinitions(
      filterMetadata?.variables ?? [],
      filterMetadata?.filter_data ?? {},
    );
  }, []);

  const runWidgetQuery = useCallback(
    async (
      widgetId: string,
      queryId: string,
      chartType: ChartType,
      dashboardVariableValues: QueryVariableMap = dashboardVariablesRef.current,
      configOverride?: DashboardWidgetConfig,
    ) => {
      const meta = widgetsMetaRef.current[widgetId];
      const normalizedInputConfig = normalizeWidgetConfig(
        configOverride ?? meta?.config,
      );
      const effectiveConfig = configOverride
        ? normalizedInputConfig
        : normalizeWidgetConfig({
            ...normalizedInputConfig,
            variables: Object.entries(
              normalizedInputConfig.variables ?? {},
            ).reduce<QueryVariableMap>((acc, [key, value]) => {
              if (!globalFilterKeySetRef.current.has(key)) {
                acc[key] = value;
              }

              return acc;
            }, {}),
          });
      let variableDefinitions = meta?.variableDefinitions ?? [];

      try {
        variableDefinitions = await loadWidgetVariableDefinitions(queryId);
      } catch {
        variableDefinitions = meta?.variableDefinitions ?? [];
      }

      const runtimeVariables = filterVariablesForDefinitions(
        resolveWidgetVariables(dashboardVariableValues, effectiveConfig),
        variableDefinitions,
      );

      setWidgetLoading(widgetId, chartType);
      const result = await fetchQueryWithData(
        queryId,
        {},
        {
          dashboard_id: selectedDashboardId,
          widget_id: widgetId,
          variables: runtimeVariables,
        },
      );

      const rows = result.data ?? [];
      const schema = result.result_schema ?? [];

      widgetsMetaRef.current[widgetId] = {
        queryId,
        chartType,
        config: effectiveConfig,
        variableDefinitions,
      };

      setDashboardFilterDefinitions((prev) =>
        mergeDashboardFilterDefinitions(prev, variableDefinitions),
      );
      updateWidgetData(widgetId, rows, schema);
      renderWidgetResult(widgetId, chartType, rows, schema);
      updateWidgetTitle(widgetId, result.name || meta?.queryId || "Widget");
    },
    [
      renderWidgetResult,
      selectedDashboardId,
      setWidgetLoading,
      updateWidgetData,
      updateWidgetTitle,
    ],
  );

  const rerunDashboardWidgets = useCallback(async () => {
    const activeWidgets = widgetsRef.current.filter((widget) => widget.queryId);
    if (!activeWidgets.length) {
      return;
    }

    const failures: string[] = [];

    await mapWithConcurrency(
      activeWidgets,
      DASHBOARD_QUERY_CONCURRENCY,
      async (widget) => {
        try {
          await runWidgetQuery(widget.id, widget.queryId, widget.chartType);
        } catch (error) {
          failures.push(widget.id);
          setWidgetError(widget.id, widget.chartType);
          throw error;
        }
      },
    ).catch(() => undefined);

    if (failures.length) {
      toast.error(
        `${failures.length} ${
          failures.length === 1 ? "widget query" : "widget queries"
        } failed to load.`,
      );
    }
  }, [runWidgetQuery, setWidgetError]);

  const addWidget = useCallback(
    (opts: {
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      title: string;
    }) => {
      const grid = gridRef.current;
      const container = gridContainerRef.current;
      if (!grid || !container) return;

      const el = ensureWidgetDom(opts.id, opts.title);
      el.setAttribute("gs-x", String(Number(opts.x)));
      el.setAttribute("gs-y", String(Number(opts.y)));
      el.setAttribute("gs-w", String(Number(opts.w)));
      el.setAttribute("gs-h", String(Number(opts.h)));
      el.setAttribute("gs-id", opts.id);

      container.appendChild(el);
      grid.makeWidget(el, {
        x: Number(opts.x),
        y: Number(opts.y),
        w: Number(opts.w),
        h: Number(opts.h),
        id: opts.id,
      } as GridStackWidget);

      return el;
    },
    [ensureWidgetDom],
  );

  const openWidgetSettings = useCallback(
    (widgetId: string) => {
      const widget = widgetsRef.current.find((item) => item.id === widgetId);
      if (!widget?.queryId) {
        toast.error("Widget query not found.");
        return;
      }

      const query =
        queriesRef.current.find((item) => item.id === widget.queryId) ??
        widget.query ??
        null;
      const meta = widgetsMetaRef.current[widgetId];
      const baseConfig = normalizeWidgetConfig(meta?.config ?? widget.config);
      const widgetConfig = normalizeWidgetConfig({
        ...baseConfig,
        variables: Object.entries(
          baseConfig.variables ?? {},
        ).reduce<QueryVariableMap>((acc, [key, value]) => {
          if (!globalFilterKeySetRef.current.has(key)) {
            acc[key] = value;
          }

          return acc;
        }, {}),
      });

      const openSettings = (variableDefinitions: QueryVariableDefinition[]) =>
        setWidgetSettings({
          widgetId,
          queryId: widget.queryId,
          queryName: query?.name || widget.title,
          variableDefinitions,
          config: widgetConfig,
        });

      if (meta?.variableDefinitions?.length) {
        openSettings(meta.variableDefinitions);
        return;
      }

      void loadWidgetVariableDefinitions(widget.queryId)
        .then((variableDefinitions) => {
          widgetsMetaRef.current[widgetId] = {
            ...(widgetsMetaRef.current[widgetId] ?? {
              chartType: widget.chartType,
              queryId: widget.queryId,
            }),
            config: widgetConfig,
            variableDefinitions,
          };

          setDashboardFilterDefinitions((prev) =>
            mergeDashboardFilterDefinitions(prev, variableDefinitions),
          );
          openSettings(variableDefinitions);
        })
        .catch(() => openSettings([]));
    },
    [loadWidgetVariableDefinitions],
  );

  const updateDashboardVariableValue = useCallback(
    (
      definition: QueryVariableDefinition,
      value: QueryVariableMap[string],
      keyOverride?: string,
    ) => {
      const targetKey = keyOverride || definition.key;
      setDashboardVariables((prev) => ({
        ...prev,
        [targetKey]: value,
      }));
    },
    [],
  );

  const updateWidgetSettingsConfig = useCallback(
    (updater: (config: DashboardWidgetConfig) => DashboardWidgetConfig) => {
      setWidgetSettings((prev) =>
        prev
          ? {
              ...prev,
              config: normalizeWidgetConfig(updater(prev.config)),
            }
          : prev,
      );
    },
    [],
  );

  const applyWidgetSettings = useCallback(async () => {
    if (!widgetSettings) {
      return;
    }

    const normalizedConfig = normalizeWidgetConfig(widgetSettings.config);
    updateWidgetConfig(widgetSettings.widgetId, normalizedConfig);

    try {
      await runWidgetQuery(
        widgetSettings.widgetId,
        widgetSettings.queryId,
        widgetsMetaRef.current[widgetSettings.widgetId]?.chartType || "table",
        dashboardVariablesRef.current,
        normalizedConfig,
      );
      setWidgetSettings(null);
      toast.success("Widget filters updated.");
    } catch (error) {
      setWidgetError(
        widgetSettings.widgetId,
        widgetsMetaRef.current[widgetSettings.widgetId]?.chartType || "table",
      );
      toast.error("Failed to update widget filters.");
    }
  }, [runWidgetQuery, setWidgetError, updateWidgetConfig, widgetSettings]);

  useEffect(() => {
    if (!showModal) return;

    (async () => {
      try {
        const q = await fetchSavedQueries(currentUser?.role?.name);
        setQueries(q);
      } catch (err) {
        toast.error("Failed to load queries: " + (err as Error).message);
      }
    })();
  }, [currentUser?.role?.name, showModal]);

  useEffect(() => {
    if (!selectedQueryId) return;

    if (!availableQueries.some((query) => query.id === selectedQueryId)) {
      setSelectedQueryId("");
      setSelectedQueryPreview(null);
    }
  }, [availableQueries, selectedQueryId]);

  useEffect(() => {
    if (!showModal || !selectedQueryId) {
      setSelectedQueryPreview(null);
      setLoadingQueryPreview(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setLoadingQueryPreview(true);
        const selectedQuery =
          availableQueries.find((query) => query.id === selectedQueryId) ??
          null;

        if (
          selectedQuery &&
          (selectedQuery.variable_definitions?.length ||
            selectedQuery.variables?.length)
        ) {
          if (cancelled) return;

          setSelectedQueryPreview({
            data: [],
            schema: selectedQuery.result_schema ?? [],
          });
          return;
        }

        const result = await fetchQueryWithData(selectedQueryId);

        if (cancelled) return;

        setSelectedQueryPreview({
          data: result.data ?? [],
          schema: result.result_schema ?? [],
        });
      } catch (err) {
        if (cancelled) return;

        setSelectedQueryPreview(null);
        toast.error(
          "Failed to inspect query format: " + (err as Error).message,
        );
      } finally {
        if (!cancelled) {
          setLoadingQueryPreview(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [availableQueries, selectedQueryId, showModal]);

  const confirmAddChart = useCallback(async () => {
    if (isViewer) {
      toast.error("VIEWER cannot add charts.");
      return;
    }

    setShowModal(false);

    const id = uuidv7();
    const type = selectedChartType;
    const selectedQuery = queries.find((q) => q.id === selectedQueryId);

    if (!selectedQuery) return;
    let variableDefinitions: QueryVariableDefinition[] = [];

    try {
      variableDefinitions =
        await loadWidgetVariableDefinitions(selectedQueryId);
    } catch {
      variableDefinitions = [];
    }

    widgetsMetaRef.current[id] = {
      queryId: selectedQueryId,
      chartType: type,
      config: {},
      variableDefinitions,
    };

    const bottomY = getBottomY();

    addWidget({
      id,
      x: 0,
      y: bottomY,
      w: 6,
      h: 3,
      title: selectedQuery?.name || `${type.toUpperCase()} CHART`,
    });

    setWidgets((prev) => [
      ...prev,
      {
        id,
        queryId: selectedQueryId,
        chartType: selectedChartType,
        title: selectedQuery.name,
        position: { x: 0, y: bottomY, w: 6, h: 3 },
        data: [],
        schema: [],
        config: {},
        query: selectedQuery,
      },
    ]);

    // initialize empty chart first
    const waitForDom = () => {
      const el = document.getElementById(id);

      if (!el) {
        requestAnimationFrame(waitForDom);
        return;
      }

      initChart(id, type, [], undefined, widgetsMetaRef.current[id]?.config);
      const resolvedVariables = resolveWidgetVariables(
        dashboardVariablesRef.current,
        {},
      );
      const missingRequiredVariables = getMissingRequiredVariables(
        variableDefinitions,
        resolvedVariables,
      );

      if (missingRequiredVariables.length) {
        setWidgetNeedsVariables(id, type, missingRequiredVariables);
      } else {
        setWidgetLoading(id, type);
      }
      resizeAllCharts();
    };

    requestAnimationFrame(waitForDom);

    try {
      const resolvedVariables = resolveWidgetVariables(
        dashboardVariablesRef.current,
        {},
      );
      const missingRequiredVariables = getMissingRequiredVariables(
        variableDefinitions,
        resolvedVariables,
      );

      if (missingRequiredVariables.length) {
        setWidgetSettings({
          widgetId: id,
          queryId: selectedQueryId,
          queryName: selectedQuery.name,
          variableDefinitions,
          config: {},
        });
        toast.message("Chart added. Configure its filters to load data.");
        return;
      }

      await runWidgetQuery(id, selectedQueryId, type);
    } catch (err) {
      toast.error("Query failed: " + (err as Error).message);

      setWidgetError(id, type);
    }
  }, [
    addWidget,
    getBottomY,
    initChart,
    isViewer,
    renderWidgetResult,
    resizeAllCharts,
    runWidgetQuery,
    setWidgetError,
    setWidgetLoading,
    setWidgetNeedsVariables,
    loadWidgetVariableDefinitions,
    selectedChartType,
    selectedQueryId,
    queries,
  ]);

  const saveDashboard = useCallback(async () => {
    if (isViewer) {
      toast.error("VIEWER cannot save dashboards.");
      return;
    }

    const grid = gridRef.current;
    if (!grid || !selectedDashboardId) return;

    try {
      setSaving(true);

      const layout = grid.save(false, false) as GridStackWidget[];
      const widgets = layout.map((item) => {
        const meta = widgetsMetaRef.current[item.id!];

        return {
          id: item.id,
          type: meta?.chartType,
          query_id: meta?.queryId,
          config: meta?.config ?? {},
          position: {
            x: item.x!,
            y: item.y!,
            w: item.w!,
            h: item.h!,
          },
        };
      });

      const payload = {
        dashboard_id: selectedDashboardId,
        widgets,
      };

      const res = await authFetch(`${API_BASE_URL}/api/v1/widgets`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      handleUnauthorizedStatus(res.status);

      if (!res.ok) {
        throw new Error("Failed to save dashboard");
      }

      await updateDashboard(selectedDashboardId, {
        name: dashboardName.trim(),
        description: dashboardDescription.trim(),
        variables: persistableDashboardVariables,
      });
      setPersistedDashboardVariables(persistableDashboardVariables);

      toast.success("Dashboard saved successfully.");
    } catch (err) {
      console.error("Failed to save dashboard:", err);

      toast.error("Failed to save dashboard.");
    } finally {
      setSaving(false);
    }
  }, [
    dashboardDescription,
    dashboardName,
    isViewer,
    persistableDashboardVariables,
    selectedDashboardId,
  ]);

  /**
   * Load dashboard configuration + query results from API
   */
  const loadDashboardFromAPI = useCallback(
    async (dashboardId: string) => {
      const container = gridContainerRef.current;
      if (!container) return;
      const requestId = ++dashboardLoadRequestRef.current;
      dashboardLoadAbortRef.current?.abort();
      const abortController = new AbortController();
      dashboardLoadAbortRef.current = abortController;
      const isStaleRequest = () =>
        dashboardLoadRequestRef.current !== requestId;

      try {
        setLoadingDashboardStructure(true);
        const [result, widgetsResult] = await Promise.all([
          fetchDashboard(dashboardId, { signal: abortController.signal }),
          fetchDashboardWidgets(dashboardId, {
            signal: abortController.signal,
          }),
        ]);

        if (abortController.signal.aborted || isStaleRequest()) {
          return;
        }

        if (!result?.data) {
          throw new Error("Dashboard response missing data");
        }

        const nextDashboardVariables = normalizeVariableMap(
          result.data?.variables,
        );
        setDashboardName(result.data?.name || "My Dashboard");
        setDashboardDescription(result.data?.description || "");
        setDashboardVariables(nextDashboardVariables);
        setPersistedDashboardVariables(nextDashboardVariables);
        setDashboardFilterDefinitions({});
        const list: BackendWidget[] = widgetsResult?.data ?? [];

        // 1. Destroy all charts first
        Object.keys(chartsRef.current).forEach(destroyChart);
        widgetsMetaRef.current = {};

        // 2. Fully destroy the grid instance and wipe the container DOM
        if (gridRef.current) {
          gridRef.current.destroy(false); // keeps DOM nodes
          gridRef.current = null;
        }
        // Manually remove all grid-stack-item children
        container.innerHTML = "";

        // 3. Reinitialize a fresh grid
        const grid = GridStack.init(
          { column: 12, cellHeight: 120, margin: 15, float: false },
          container,
        );
        gridRef.current = grid;

        // Re-attach resize listeners
        grid.on("resize", () => resizeAllCharts());
        grid.on("resizestop", () => resizeAllCharts());
        grid.on("dragstop", () => resizeAllCharts());

        setWidgets([]);

        if (!list.length) {
          return;
        }

        const widgetQueryIds = Array.from(
          new Set(list.map((widget) => widget.query_id).filter(Boolean)),
        ) as string[];
        const missingQueryIds = widgetQueryIds.filter(
          (queryId) =>
            !queriesRef.current.some((query) => query.id === queryId),
        );

        if (missingQueryIds.length) {
          const loadedQueries = await fetchSavedQueries(
            currentUser?.role?.name,
          );

          if (abortController.signal.aborted || isStaleRequest()) {
            return;
          }

          setQueries(loadedQueries);
        }

        const loadedWidgets: DashboardWidget[] = [];
        let nextFilterDefinitions: Record<string, DashboardFilterDefinition> =
          {};

        for (const w of list) {
          const id = w.id;
          const type = w.widget_type;
          const title = `${type.toUpperCase()} CHART`;
          const normalizedConfig = normalizeWidgetConfig(w.config);
          let variableDefinitions: QueryVariableDefinition[] = [];

          if (w.query_id) {
            try {
              variableDefinitions = await loadWidgetVariableDefinitions(
                w.query_id,
              );
            } catch {
              variableDefinitions = [];
            }
          }

          widgetsMetaRef.current[id] = {
            queryId: w.query_id ?? "",
            chartType: type,
            config: normalizedConfig,
            variableDefinitions,
          };

          nextFilterDefinitions = mergeDashboardFilterDefinitions(
            nextFilterDefinitions,
            variableDefinitions,
          );

          addWidget({
            id,
            x: w.position.x,
            y: w.position.y,
            w: w.position.w,
            h: w.position.h,
            title,
          });

          loadedWidgets.push({
            id,
            queryId: w.query_id ?? "",
            chartType: type,
            title,
            position: w.position,
            data: [],
            schema: [],
            config: normalizedConfig,
          });
        }

        setDashboardFilterDefinitions(nextFilterDefinitions);
        setWidgets(loadedWidgets);

        requestAnimationFrame(() => {
          for (const widget of loadedWidgets) {
            initChart(
              widget.id,
              widget.chartType,
              [],
              undefined,
              widget.config,
            );

            if (widget.queryId) {
              const meta = widgetsMetaRef.current[widget.id];
              const resolvedVariables = resolveWidgetVariables(
                nextDashboardVariables,
                meta?.config,
              );
              const missingRequiredVariables = getMissingRequiredVariables(
                meta?.variableDefinitions ?? [],
                resolvedVariables,
              );

              if (missingRequiredVariables.length) {
                setWidgetNeedsVariables(
                  widget.id,
                  widget.chartType,
                  missingRequiredVariables,
                );
              } else {
                setWidgetLoading(widget.id, widget.chartType);
              }
              continue;
            }

            setWidgetError(widget.id, widget.chartType);
          }

          resizeAllCharts();
        });

        if (!abortController.signal.aborted && !isStaleRequest()) {
          setLoadingDashboardStructure(false);
        }

        const failedQueryIds: string[] = [];

        await mapWithConcurrency(
          loadedWidgets.filter((widget) => widget.queryId),
          DASHBOARD_QUERY_CONCURRENCY,
          async (widget) => {
            try {
              const meta = widgetsMetaRef.current[widget.id];
              const resolvedVariables = resolveWidgetVariables(
                nextDashboardVariables,
                meta?.config,
              );
              const missingRequiredVariables = getMissingRequiredVariables(
                meta?.variableDefinitions ?? [],
                resolvedVariables,
              );

              if (missingRequiredVariables.length) {
                return;
              }

              await runWidgetQuery(
                widget.id,
                widget.queryId,
                widget.chartType,
                nextDashboardVariables,
              );
            } catch (error) {
              if (isAbortError(error)) {
                throw error;
              }

              failedQueryIds.push(widget.queryId);
              setWidgetError(widget.id, widget.chartType);
            }
          },
        );

        if (!isStaleRequest() && failedQueryIds.length) {
          toast.error(
            `${failedQueryIds.length} ${
              failedQueryIds.length === 1 ? "widget query" : "widget queries"
            } failed to load.`,
          );
        }
      } catch (err) {
        if (isAbortError(err) || isStaleRequest()) {
          return;
        }

        console.error("Failed to load dashboard:", err);
        toast.error("Failed to load dashboard: " + (err as Error).message);
        return;
      } finally {
        if (dashboardLoadAbortRef.current === abortController) {
          dashboardLoadAbortRef.current = null;
        }

        if (!abortController.signal.aborted && !isStaleRequest()) {
          setLoadingDashboardStructure(false);
        }
      }
    },
    [
      addWidget,
      destroyChart,
      initChart,
      resizeAllCharts,
      runWidgetQuery,
      setWidgetError,
      setWidgetLoading,
    ],
  );

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const grid = GridStack.init(
      {
        column: 12,
        cellHeight: 120,
        margin: 15,
        float: false,
      },
      container,
    );

    gridRef.current = grid;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.classList.contains("widget-menu-toggle")) {
        const menuContainer = target.parentElement;
        const menu = menuContainer?.querySelector(".widget-menu");
        const willOpen = menu?.classList.contains("hidden");

        container
          .querySelectorAll(".widget-menu")
          .forEach((menuEl) => menuEl.classList.add("hidden"));

        if (menu && willOpen) {
          menu.classList.remove("hidden");
        }
        return;
      }

      if (target.classList.contains("export-widget")) {
        const widgetId = target.getAttribute("data-widget-id");
        container
          .querySelectorAll(".widget-menu")
          .forEach((menuEl) => menuEl.classList.add("hidden"));
        if (widgetId) {
          exportWidgetCsv(widgetId);
        }
        return;
      }

      if (target.classList.contains("widget-settings")) {
        const widgetId = target.getAttribute("data-widget-id");
        container
          .querySelectorAll(".widget-menu")
          .forEach((menuEl) => menuEl.classList.add("hidden"));
        if (widgetId) {
          openWidgetSettings(widgetId);
        }
        return;
      }

      container
        .querySelectorAll(".widget-menu")
        .forEach((menuEl) => menuEl.classList.add("hidden"));

      if (target.classList.contains("delete-widget")) {
        const widgetEl = target.closest(".grid-stack-item") as HTMLElement;

        if (widgetEl) {
          const widgetId = widgetEl.querySelector("[id]")?.getAttribute("id");
          deleteWidget(widgetEl);
          if (widgetId) {
            delete widgetsMetaRef.current[widgetId];
            setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
          }
        }
      }
    };

    container.addEventListener("click", onClick);

    grid.on("resize", () => resizeAllCharts());
    grid.on("resizestop", () => resizeAllCharts());
    grid.on("dragstop", () => resizeAllCharts());

    window.addEventListener("resize", resizeAllCharts);

    return () => {
      container.removeEventListener("click", onClick);
      window.removeEventListener("resize", resizeAllCharts);
      Object.keys(chartsRef.current).forEach(destroyChart);

      // grid may have been reinitialized by loadDashboardFromAPI
      gridRef.current?.destroy(false);
      gridRef.current = null;
    };
  }, [
    deleteWidget,
    destroyChart,
    exportWidgetCsv,
    openWidgetSettings,
    resizeAllCharts,
  ]);

  useEffect(() => {
    if (!selectedDashboardId || !gridContainerRef.current) {
      return;
    }

    void loadDashboardFromAPI(selectedDashboardId);

    return () => {
      dashboardLoadAbortRef.current?.abort();
      dashboardLoadAbortRef.current = null;
    };
  }, [loadDashboardFromAPI, selectedDashboardId]);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 text-white relative overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-indigo-500/18 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-cyan-500/12 blur-3xl" />
      </div>

      <div className="relative z-10 p-6 md:p-8">
        <div className="mx-auto max-w-360">
          <div className="mb-8 rounded-2xl border border-white/10 bg-slate-900/45 px-6 py-5 shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                {editingDashboardMeta ? (
                  <div className="max-w-3xl space-y-3">
                    <input
                      value={dashboardNameDraft}
                      onChange={(e) => setDashboardNameDraft(e.target.value)}
                      className="w-full rounded-xl border border-cyan-300/20 bg-slate-950/55 px-4 py-3 text-3xl font-semibold tracking-tight text-slate-100 outline-none transition focus:border-cyan-300/40 md:text-4xl"
                      placeholder="Dashboard name"
                    />
                    <textarea
                      value={dashboardDescriptionDraft}
                      onChange={(e) =>
                        setDashboardDescriptionDraft(e.target.value)
                      }
                      className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-300/35 md:text-base"
                      placeholder="Dashboard description"
                    />
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={handleUpdateDashboardMeta}
                        disabled={
                          updatingDashboardMeta || !hasDashboardMetaChanges
                        }
                        variant="outline"
                        className="rounded-xl border-cyan-300/30 bg-cyan-500/20 text-cyan-50 hover:bg-cyan-500/30 hover:text-cyan-50 disabled:opacity-50"
                      >
                        {updatingDashboardMeta ? "Updating..." : "Update"}
                      </Button>
                      <Button
                        onClick={handleCancelDashboardMetaEdit}
                        disabled={updatingDashboardMeta}
                        variant="outline"
                        className="rounded-xl border-white/10 bg-slate-800/70 text-slate-200 hover:bg-slate-700/70 hover:text-slate-100 disabled:opacity-50"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-3xl">
                    {canManageDashboardMeta ? (
                      <div className="flex flex-col items-start">
                        <Button
                          onClick={handleStartDashboardMetaEdit}
                          variant="ghost"
                          className="block h-auto p-0 text-left hover:bg-transparent"
                        >
                          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 transition hover:text-cyan-100 md:text-4xl">
                            {dashboardName}
                          </h1>
                        </Button>
                        <Button
                          onClick={handleStartDashboardMetaEdit}
                          variant="ghost"
                          className="mt-2 block h-auto p-0 text-left hover:bg-transparent"
                        >
                          <p className="text-sm text-slate-300/90 transition hover:text-slate-100 md:text-base">
                            {dashboardDescription || "Analytics workspace"}
                          </p>
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">
                          {dashboardName}
                        </h1>
                        <p className="mt-2 text-sm text-slate-300/90 md:text-base">
                          {dashboardDescription || "Analytics workspace"}
                        </p>
                      </>
                    )}
                  </div>
                )}
                {selectedDashboardId ? (
                  <div className="mt-4 flex flex-col gap-2 sm:max-w-sm">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Active Dashboard
                    </span>
                    <Select
                      value={selectedDashboardId}
                      onValueChange={handleDashboardSelectionChange}
                    >
                      <SelectTrigger className="w-full cursor-pointer border-white/10 bg-slate-950/55 text-slate-100">
                        <SelectValue placeholder="Select dashboard" />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-slate-950/95 text-slate-100">
                        {dashboardOptions.map((dashboard) => (
                          <SelectItem
                            key={dashboard.id}
                            value={dashboard.id}
                            className="cursor-pointer focus:bg-slate-800 focus:text-white"
                          >
                            {formatDashboardLabel(dashboard)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <CurrentUserBadge />
                <div className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                  Widgets: {widgets.length}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {!isViewer && canManageDashboardMeta ? (
                <Button
                  onClick={() => setShowCreateDashboardModal(true)}
                  variant="outline"
                  className="rounded-xl border-cyan-300/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 hover:text-cyan-100"
                >
                  + Create Dashboard
                </Button>
              ) : null}

              {!isViewer ? (
                <Button
                  onClick={() => {
                    setShowModal(true);
                  }}
                  variant="outline"
                  className="rounded-xl border-emerald-400/30 bg-emerald-500/20 text-emerald-100 shadow-sm hover:bg-emerald-500/30 hover:text-emerald-100"
                >
                  + Add Chart
                </Button>
              ) : null}

              {!isViewer ? (
                <Button
                  onClick={saveDashboard}
                  disabled={saving}
                  variant="outline"
                  className="rounded-xl border-indigo-300/30 bg-indigo-500/25 text-indigo-50 hover:bg-indigo-500/35 hover:text-indigo-50 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Dashboard"}
                </Button>
              ) : null}

              <Button
                onClick={() =>
                  selectedDashboardId
                    ? void loadDashboardFromAPI(selectedDashboardId)
                    : undefined
                }
                disabled={!selectedDashboardId || loadingDashboardStructure}
                variant="outline"
                className="rounded-xl border-amber-300/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 hover:text-amber-100 disabled:opacity-60"
              >
                {loadingDashboardStructure
                  ? "Refreshing..."
                  : "Refresh Dashboard"}
              </Button>

              {!isViewer ? (
                <Button
                  variant="outline"
                  className="rounded-xl border-white/15 bg-slate-700/45 text-slate-100 hover:bg-slate-700/65 hover:text-slate-100"
                  onClick={() => {
                    navigate("/query-builder");
                  }}
                >
                  Open Query Builder
                </Button>
              ) : null}

              {/* <Button
                asChild
                variant="outline"
                className="rounded-xl border-cyan-300/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 hover:text-cyan-100"
              >
                <Link to="/graphql-playground">Open GraphQL Playground</Link>
              </Button> */}
            </div>

            {selectedDashboardId &&
            dynamicFilterTopology.globalDefinitions.length ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      Global Filters
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-lg border-white/15 bg-slate-800/60 text-slate-100 hover:bg-slate-700/70 hover:text-slate-100"
                      onClick={() => {
                        setDashboardVariables(persistedDashboardVariables);
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-lg border-cyan-300/30 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 hover:text-cyan-100"
                      onClick={() => void rerunDashboardWidgets()}
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>

                {dynamicFilterTopology.globalDefinitions.length ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {dynamicFilterTopology.globalDefinitions.map(
                      (definition) => {
                        const currentValue = dashboardVariables[definition.key];

                        return (
                          <div
                            key={definition.key}
                            className="rounded-xl border border-white/10 bg-slate-900/55 p-3"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-100">
                                {definition.label}
                              </span>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center text-slate-400 transition-colors hover:text-slate-200"
                                    aria-label={`More info about ${definition.label}`}
                                  >
                                    <IoIosInformationCircleOutline className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>

                                <TooltipContent
                                  side="right"
                                  className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
                                >
                                  <span className="text-slate-400">
                                    Variable key:
                                  </span>
                                  <span className="font-mono uppercase tracking-[0.18em] text-slate-100 ">
                                    {definition.key}
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            {(definition.options ?? []).length ? (
                              definition.multiple ? (
                                <MultiVariableCombobox
                                  options={definition.options ?? []}
                                  selectedValues={
                                    Array.isArray(currentValue)
                                      ? currentValue.map(
                                          stringifyVariableOptionValue,
                                        )
                                      : []
                                  }
                                  onChange={(nextValues) =>
                                    updateDashboardVariableValue(
                                      definition,
                                      nextValues.map((value) =>
                                        coercePrimitiveValue(value, definition),
                                      ),
                                    )
                                  }
                                />
                              ) : (
                                <Select
                                  value={stringifyVariableOptionValue(
                                    Array.isArray(currentValue)
                                      ? (currentValue[0] ?? null)
                                      : (currentValue ?? null),
                                  )}
                                  onValueChange={(value) =>
                                    updateDashboardVariableValue(
                                      definition,
                                      value && value !== "__all__"
                                        ? coercePrimitiveValue(
                                            value,
                                            definition,
                                          )
                                        : null,
                                    )
                                  }
                                >
                                  <SelectTrigger className="mt-3 w-full border-white/10 bg-slate-950/60 text-slate-100">
                                    <SelectValue placeholder="Select value" />
                                  </SelectTrigger>
                                  <SelectContent className="border-white/10 bg-slate-950/95 text-slate-100">
                                    <SelectItem value="__all__">All</SelectItem>
                                    {(definition.options ?? []).map(
                                      (option) => (
                                        <SelectItem
                                          key={`${definition.key}-${option.label}-${option.value}`}
                                          value={stringifyVariableOptionValue(
                                            option.value,
                                          )}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              )
                            ) : definition.type === "date" ||
                              definition.type === "datetime" ? (
                              <VariableDatePicker
                                definition={definition}
                                value={currentValue}
                                onChange={(nextValue) =>
                                  updateDashboardVariableValue(
                                    definition,
                                    nextValue,
                                  )
                                }
                                className="mt-3 w-full justify-start border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900/80"
                              />
                            ) : (
                              <input
                                type="text"
                                value={formatVariableValueForText(currentValue)}
                                onChange={(event) =>
                                  updateDashboardVariableValue(
                                    definition,
                                    parseVariableValueFromText(
                                      event.target.value,
                                      definition,
                                    ),
                                  )
                                }
                                placeholder={
                                  definition.multiple
                                    ? "Comma-separated values"
                                    : "Enter value"
                                }
                                className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none"
                              />
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="relative mt-6 min-h-80">
            <div
              ref={gridContainerRef}
              className="grid-stack pb-8 data-[empty=true]:opacity-0"
              data-empty={widgets.length === 0}
            />

            {loadingDashboardStructure ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 backdrop-blur-sm">
                <div className="flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-slate-900/80 px-5 py-4 text-sm text-slate-100 shadow-lg">
                  <Spinner className="size-5 text-cyan-300" />
                  <div>
                    <p className="font-medium">Loading dashboard data...</p>
                    <p className="text-slate-300">
                      Fetching dashboard metadata and widget layout.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {!loadingDashboardStructure &&
            selectedDashboardId &&
            widgets.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/40">
                <div className="max-w-md px-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-500/10">
                    <LayoutDashboard className="size-6 text-cyan-200" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    No widgets added
                  </h3>
                  <p className="mt-2 text-sm text-slate-300">
                    This dashboard is empty right now. Add a chart to start
                    building your analytics view.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {(loadingDashboardOptions || dashboardSelectorOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-100">
              Select Dashboard
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Choose a dashboard before entering the analytics workspace.
            </p>
            {canManageDashboardMeta ? (
              <Button
                onClick={() => setShowCreateDashboardModal(true)}
                variant="outline"
                className="mt-4 rounded-xl border-cyan-300/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 hover:text-cyan-100"
              >
                + Create Dashboard
              </Button>
            ) : null}

            <div className="mt-6">
              {loadingDashboardOptions ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-6 text-center text-sm text-slate-300">
                  Loading available dashboards...
                </div>
              ) : dashboardOptions.length ? (
                <div className="space-y-3">
                  <Select
                    value={selectedDashboardId || undefined}
                    onValueChange={handleDashboardSelectionChange}
                  >
                    <SelectTrigger className="w-full border-white/10 bg-slate-950/60 text-slate-100">
                      <SelectValue placeholder="Select a dashboard" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-slate-950/95 text-slate-100">
                      {dashboardOptions.map((dashboard) => (
                        <SelectItem
                          key={dashboard.id}
                          value={dashboard.id}
                          className="focus:bg-slate-800 focus:text-white"
                        >
                          {formatDashboardLabel(dashboard)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedDashboardOption ? (
                    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                      <p className="text-sm font-medium text-slate-100">
                        {selectedDashboardOption.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {selectedDashboardOption.description ||
                          "No dashboard description provided."}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                  No dashboards are currently available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateDashboardModal && canManageDashboardMeta && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-100">
              Create Dashboard
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Create a new dashboard and switch into it right away.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <p className="mb-2 text-sm text-slate-300">Department</p>
                {isSuperAdmin ? (
                  <input
                    value={newDashboardDepartment}
                    onChange={(e) => setNewDashboardDepartment(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-slate-800/90 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-300/40"
                    placeholder="finance"
                  />
                ) : (
                  <div className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2.5 text-slate-200">
                    {userDepartmentValue || "No department found"}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm text-slate-300">Name</p>
                <input
                  value={newDashboardName}
                  onChange={(e) => setNewDashboardName(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-slate-800/90 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-300/40"
                  placeholder="Dashboard name"
                />
              </div>

              <div>
                <p className="mb-2 text-sm text-slate-300">Description</p>
                <textarea
                  value={newDashboardDescription}
                  onChange={(e) => setNewDashboardDescription(e.target.value)}
                  className="min-h-28 w-full rounded-lg border border-white/15 bg-slate-800/90 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-300/40"
                  placeholder="Dashboard description"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                onClick={() => setShowCreateDashboardModal(false)}
                disabled={creatingDashboard}
                variant="outline"
                className="rounded-lg border-white/15 bg-slate-700/70 text-slate-100 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDashboard}
                disabled={creatingDashboard}
                variant="outline"
                className="rounded-lg border-cyan-300/30 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 hover:text-cyan-100 disabled:opacity-50"
              >
                {creatingDashboard ? "Creating..." : "Create Dashboard"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(widgetSettings)}
        onOpenChange={(open) => {
          if (!open) {
            setWidgetSettings(null);
          }
        }}
      >
        <DialogContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="max-h-[85vh] overflow-visible border-white/10 bg-slate-950/95 text-slate-100 sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription className="text-slate-300">
              {widgetSettings?.queryName || "Configure widget-level overrides"}
            </DialogDescription>
          </DialogHeader>

          {widgetSettings ? (
            <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
              {!widgetSettings.variableDefinitions.length ? (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-slate-300">
                  This query does not define runtime variables yet.
                </div>
              ) : (
                widgetSettings.variableDefinitions.map((definition) => {
                  const widgetOptions = definition.options ?? [];
                  const widgetValue =
                    widgetSettings.config.variables?.[definition.key];
                  const resolvedWidgetValue =
                    widgetValue ?? dashboardVariables[definition.key] ?? null;

                  return (
                    <div
                      key={definition.key}
                      className="rounded-xl border border-white/10 bg-slate-900/70 p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">
                          {definition.label}
                        </span>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center text-slate-400 transition-colors hover:text-slate-200"
                              aria-label={`More info about ${definition.label}`}
                            >
                              <IoIosInformationCircleOutline className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>

                          <TooltipContent
                            side="right"
                            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
                          >
                            <span className="text-slate-400">
                              Variable key:
                            </span>
                            <span className="font-mono uppercase tracking-[0.18em] text-slate-100 ">
                              {definition.key}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <div className="mt-4">
                        {definition.multiple && widgetOptions.length ? (
                          <div>
                            <MultiVariableCombobox
                              options={widgetOptions}
                              selectedValues={
                                Array.isArray(resolvedWidgetValue)
                                  ? resolvedWidgetValue.map(
                                      stringifyVariableOptionValue,
                                    )
                                  : []
                              }
                              onChange={(nextValues) =>
                                updateWidgetSettingsConfig((config) => ({
                                  ...config,
                                  variables: {
                                    ...(config.variables ?? {}),
                                    [definition.key]: nextValues.map((value) =>
                                      coercePrimitiveValue(value, definition),
                                    ),
                                  },
                                }))
                              }
                            />
                          </div>
                        ) : (
                          <VariableValueInput
                            definition={{
                              ...definition,
                              options: widgetOptions,
                            }}
                            value={resolvedWidgetValue}
                            onChange={(value) =>
                              updateWidgetSettingsConfig((config) => ({
                                ...config,
                                variables: {
                                  ...(config.variables ?? {}),
                                  [definition.key]: value,
                                },
                              }))
                            }
                            placeholder="Use global/default"
                            className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none"
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 bg-slate-900/70 text-slate-100 hover:bg-slate-800 hover:text-slate-100"
              onClick={() => setWidgetSettings(null)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-cyan-300/30 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 hover:text-cyan-100"
              onClick={() => void applyWidgetSettings()}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/85 p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-semibold text-slate-100">
              Add New Chart
            </h2>

            <div className="mb-5">
              <p className="mb-2 text-sm text-slate-300">Query</p>

              <select
                value={selectedQueryId}
                onChange={(e) => setSelectedQueryId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-slate-800/90 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-300/40"
              >
                <option value="">Select Query</option>

                {availableQueries.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
              {showModal && availableQueries.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">
                  {isSuperAdmin
                    ? `No saved queries found for ${selectedDashboardOption?.department?.name || "this dashboard department"}.`
                    : "No saved queries available."}
                </p>
              ) : null}
            </div>

            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-300">Chart Type</p>
                {loadingQueryPreview ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
                    <LoaderCircle className="size-3 animate-spin" />
                    Matching query shape...
                  </span>
                ) : null}
              </div>
              <div
                className={`grid grid-cols-2 gap-2 transition md:grid-cols-3 ${
                  loadingQueryPreview ? "pointer-events-none opacity-70" : ""
                }`}
              >
                {chartTypeOptions.map((chartTypeOption) => {
                  const isSelected =
                    selectedChartType === chartTypeOption.value;
                  const isCompatible = compatibleChartTypes.has(
                    chartTypeOption.value,
                  );

                  return (
                    <label
                      key={chartTypeOption.value}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-center transition ${
                        isSelected
                          ? isCompatible
                            ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-100 shadow-[0_0_0_1px_rgba(110,231,183,0.2)]"
                            : "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                          : isCompatible
                            ? "cursor-pointer border-emerald-400/35 bg-emerald-500/8 text-emerald-100 hover:bg-emerald-500/14"
                            : "cursor-pointer border-white/15 bg-slate-800/80 text-slate-300 hover:bg-slate-700/70"
                      }`}
                    >
                      <input
                        type="radio"
                        value={chartTypeOption.value}
                        checked={isSelected}
                        onChange={() =>
                          setSelectedChartType(
                            chartTypeOption.value as ChartType,
                          )
                        }
                        className="hidden"
                      />
                      <span>{chartTypeOption.label}</span>
                      {isCompatible ? (
                        <span className="rounded-full border border-emerald-300/35 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                          Match
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {selectedQueryId
                  ? loadingQueryPreview
                    ? "Inspecting query result format..."
                    : compatibleChartTypes.size > 0
                      ? "Chart types marked 'Match' fit the selected query result."
                      : "No direct chart match found for this query result yet."
                  : "Select a query to highlight matching chart types."}
              </p>
            </div>

            <div
              className={`mb-6 rounded-xl border border-white/10 bg-slate-800/40 p-4 transition ${
                loadingQueryPreview ? "animate-pulse" : ""
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-100">
                  Data Requirements
                </p>
                <span className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">
                  {String(selectedChartType)}
                </span>
              </div>

              <p className="text-xs text-slate-300">
                {selectedChartGuide.description}
              </p>

              <p className="mt-3 text-xs text-slate-300">
                Minimum fields:{" "}
                <span className="font-semibold text-slate-100">
                  {selectedChartGuide.minimumFields}
                </span>
              </p>

              {selectedQueryShape ? (
                <p className="mt-3 text-xs text-slate-300">
                  Selected query shape:{" "}
                  <span className="font-semibold text-slate-100">
                    {selectedQueryShape.fieldCount} fields
                  </span>
                  ,{" "}
                  <span className="font-semibold text-slate-100">
                    {selectedQueryShape.numericFieldCount} numeric
                  </span>
                  ,{" "}
                  <span className="font-semibold text-slate-100">
                    {selectedQueryShape.categoryFieldCount} categorical
                  </span>
                  {selectedQueryShape.hasRows ? "" : " (no rows returned)"}
                </p>
              ) : null}

              <div className="mt-3 text-xs text-slate-300">
                <p className="font-medium text-slate-200">Required</p>
                <ul className="mt-1 list-disc pl-5">
                  {selectedChartGuide.required.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              {selectedChartGuide.optional?.length ? (
                <div className="mt-3 text-xs text-slate-300">
                  <p className="font-medium text-slate-200">Optional</p>
                  <ul className="mt-1 list-disc pl-5">
                    {selectedChartGuide.optional.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-3">
                <p className="text-xs font-medium text-slate-200">Sample row</p>
                <pre className="mt-1 overflow-x-auto rounded-lg border border-white/10 bg-slate-900/70 p-2 text-[11px] leading-relaxed text-slate-300">
                  {JSON.stringify(selectedChartGuide.sampleRow, null, 2)}
                </pre>
              </div>

              {selectedChartGuide.notes?.length ? (
                <div className="mt-3 text-xs text-amber-200/90">
                  {selectedChartGuide.notes.map((note) => (
                    <p key={note}>Note: {note}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              className={`mb-6 rounded-xl border border-white/10 bg-slate-800/40 p-4 transition ${
                loadingQueryPreview ? "animate-pulse" : ""
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-100">
                  Chart Preview
                </p>
                <span
                  className={`rounded-md px-2 py-1 text-xs ${
                    selectedChartPreview.status === "ready"
                      ? "border border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
                      : selectedChartPreview.status === "fallback"
                        ? "border border-amber-300/30 bg-amber-500/10 text-amber-100"
                        : "border border-white/15 bg-slate-900/70 text-slate-300"
                  }`}
                >
                  {selectedChartPreview.status === "ready"
                    ? "Ready"
                    : selectedChartPreview.status === "fallback"
                      ? "Adaptive"
                      : "Needs Fields"}
                </span>
              </div>

              <p className="text-xs font-medium text-slate-100">
                {selectedChartPreview.title}
              </p>
              <p className="mt-1 text-xs text-slate-300">
                {selectedChartPreview.note}
              </p>

              {selectedChartPreview.schemaFields.length ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-200">
                    Result schema
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedChartPreview.schemaFields.map((field) => (
                      <span
                        key={field}
                        className="rounded-full border border-white/10 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-200"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    X Axis / Labels
                  </p>
                  <p className="mt-2 text-sm text-slate-100">
                    {selectedChartPreview.xAxisLabel ?? "Not inferred yet"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Y Axis / Values
                  </p>
                  <p className="mt-2 text-sm text-slate-100">
                    {selectedChartPreview.yAxisLabel ?? "Not inferred yet"}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-medium text-slate-200">Series</p>
                {selectedChartPreview.seriesLabels.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedChartPreview.seriesLabels.map((series) => (
                      <span
                        key={series}
                        className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100"
                      >
                        {series}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    No series inferred yet.
                  </p>
                )}
              </div>

              <div className="mt-3">
                <p className="text-xs font-medium text-slate-200">
                  Sample mapping
                </p>
                {selectedChartPreview.sampleItems.length ? (
                  <div className="mt-2 space-y-2">
                    {selectedChartPreview.sampleItems.map((item) => (
                      <div
                        key={item}
                        className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-300"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Pick a query with rows to see example plotted values.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setShowModal(false)}
                variant="outline"
                className="rounded-lg border-white/15 bg-slate-700/70 text-slate-100 hover:bg-slate-700 hover:text-slate-100"
              >
                Cancel
              </Button>

              <Button
                disabled={!selectedQueryId}
                onClick={confirmAddChart}
                variant="outline"
                className="rounded-lg border-emerald-400/30 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35 hover:text-emerald-100 disabled:opacity-50"
              >
                Add Chart
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
