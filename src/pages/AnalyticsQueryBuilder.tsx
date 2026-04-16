import { API_BASE_URL, type ResponseApiBase } from "@/api/base";
import { authFetch } from "@/api/client";
import { deleteSavedQuery, fetchSavedQueries } from "@/api/queries";
import { handleUnauthorizedStatus } from "@/api/utils";
import { CurrentUserBadge } from "@/components/CurrentUserBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { type Query, type QueryType } from "@/types/query";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { FaCheckCircle } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";
import {
  QueryBuilder,
  ValueEditor,
  type Field,
  type FieldSelectorProps,
  type OperatorSelectorProps,
  type RuleGroupType,
  type RuleType,
  type ValueEditorProps,
} from "react-querybuilder";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { format as formatSqlString } from "sql-formatter";

import type { GetSchemasResponse } from "@/api/queries";
import type {
  Aggregation,
  ColumnSchema,
  FullSchema,
  Join,
  OrderBy,
  PivotOptions,
  PivotValue,
  PivotValueValue,
  QueryRow,
  SelectedColumn,
  VisualQueryRequest,
  VisualSelectColumn,
} from "@/types/query";

const getResultColumns = (data: QueryRow[] = []): string[] =>
  Array.from(new Set(data.flatMap((row) => Object.keys(row))));

const toCsvValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);

  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
};

const buildCsvContent = (data: QueryRow[] = []): string => {
  const columns = getResultColumns(data);
  if (!columns.length) return "";

  const header = columns.map(toCsvValue).join(",");
  const rows = data.map((row) =>
    columns.map((column) => toCsvValue(row[column])).join(","),
  );

  return [header, ...rows].join("\r\n");
};

const NUMERIC_RESULT_PATTERN = /^-?\d+(?:\.\d+)?$/;
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_INPUT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const DATETIME_INPUT_PLACEHOLDER = "YYYY-MM-DD or YYYY-MM-DD HH:MM:SS";

type QueryBuilderField = Field & {
  group?: string;
  type?: string;
};

type ColumnOption = {
  group: string;
  label: string;
  name: string;
  type?: string;
};

type SharedSqlConfig = {
  sql: string;
};

const QUERY_TYPE_SEARCH_PARAM = "queryType";
const QUERY_CONFIG_SEARCH_PARAM = "config";
const QUERY_NAME_SEARCH_PARAM = "queryName";
const QUERY_DESCRIPTION_SEARCH_PARAM = "queryDescription";
const SAVED_QUERY_ID_SEARCH_PARAM = "savedQueryId";

const formatNumericStringWithSeparators = (value: string): string => {
  const trimmed = value.trim();
  if (!NUMERIC_RESULT_PATTERN.test(trimmed)) return value;

  const isNegative = trimmed.startsWith("-");
  const unsignedValue = isNegative ? trimmed.slice(1) : trimmed;
  const [integerPart, fractionPart] = unsignedValue.split(".");
  const formattedInteger = Number(integerPart).toLocaleString("en-US");
  const withSign = isNegative ? `-${formattedInteger}` : formattedInteger;

  return fractionPart !== undefined ? `${withSign}.${fractionPart}` : withSign;
};

const formatResultValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 20,
    });
  }
  if (typeof value === "bigint") {
    return value.toLocaleString("en-US");
  }
  if (typeof value === "string") {
    return formatNumericStringWithSeparators(value);
  }

  return String(value);
};

const isValidCalendarDate = (
  year: number,
  month: number,
  day: number,
): boolean => {
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const isValidDateTimeInput = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;

  const dateMatch = trimmed.match(DATE_INPUT_PATTERN);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return isValidCalendarDate(Number(year), Number(month), Number(day));
  }

  const dateTimeMatch = trimmed.match(DATETIME_INPUT_PATTERN);
  if (!dateTimeMatch) return false;

  const [, year, month, day, hours, minutes, seconds] = dateTimeMatch;
  const numericHours = Number(hours);
  const numericMinutes = Number(minutes);
  const numericSeconds = Number(seconds);

  return (
    isValidCalendarDate(Number(year), Number(month), Number(day)) &&
    numericHours >= 0 &&
    numericHours <= 23 &&
    numericMinutes >= 0 &&
    numericMinutes <= 59 &&
    numericSeconds >= 0 &&
    numericSeconds <= 59
  );
};

const getDateTimeRuleValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => getDateTimeRuleValues(item))
      .filter((item) => item.length > 0);
  }

  const stringValue = String(value ?? "").trim();
  if (!stringValue) return [];

  return stringValue
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const isValidDateTimeRuleValue = (value: unknown): boolean =>
  getDateTimeRuleValues(value).every(isValidDateTimeInput);

const DateTimeValueEditor = (props: ValueEditorProps) => {
  const fieldData = props.fieldData as QueryBuilderField | undefined;
  const className =
    typeof props.className === "string" ? props.className : undefined;
  const isDateTimeField =
    Boolean(fieldData) &&
    (fieldData?.type?.toLowerCase().includes("date") ||
      fieldData?.type?.toLowerCase().includes("time"));

  if (!isDateTimeField || props.type !== "text") {
    return <ValueEditor {...props} />;
  }

  const stringValue = Array.isArray(props.value)
    ? props.value.join(", ")
    : String(props.value ?? "");
  const isValid = isValidDateTimeRuleValue(stringValue);

  return (
    <div className="space-y-1">
      <input
        type="text"
        value={stringValue}
        onChange={(event) => props.handleOnChange(event.target.value)}
        placeholder={fieldData?.placeholder || DATETIME_INPUT_PLACEHOLDER}
        title={DATETIME_INPUT_PLACEHOLDER}
        className={`${className || ""} ${
          isValid ? "" : "border-destructive focus-visible:ring-destructive/30"
        }`}
      />
      {!isValid ? (
        <p className="text-xs text-destructive">
          Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS only.
        </p>
      ) : null}
    </div>
  );
};

const GroupedFieldSelector = (props: FieldSelectorProps) => {
  const options = props.options as Array<
    | { label: string; name: string }
    | {
        label: string;
        options: Array<{ label: string; name: string }>;
      }
  >;

  const groupedOptions =
    options.length > 0 && "options" in options[0]
      ? (options as Array<{
          label: string;
          options: Array<{ label: string; name: string }>;
        }>)
      : [
          {
            label: "Fields",
            options: options as Array<{ label: string; name: string }>,
          },
        ];

  return (
    <Select value={props.value} onValueChange={props.handleOnChange}>
      <SelectTrigger className="cursor-pointer hover:border-primary/40 transition">
        <SelectValue placeholder="Select field" />
      </SelectTrigger>
      <SelectContent>
        {groupedOptions.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 ? <SelectSeparator /> : null}
            <SelectGroup>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.name} value={option.name}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </div>
        ))}
      </SelectContent>
    </Select>
  );
};

const ThemedOperatorSelector = (props: OperatorSelectorProps) => {
  const options = props.options as Array<{ label: string; name: string }>;

  return (
    <Select value={props.value} onValueChange={props.handleOnChange}>
      <SelectTrigger className="min-w-36 cursor-pointer hover:border-primary/40 transition">
        <SelectValue placeholder="Operator" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Operators</SelectLabel>
          {options.map((option) => (
            <SelectItem key={option.name} value={option.name}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default function App() {
  const { currentUser } = useAuth();
  const isViewer = currentUser?.role?.name?.trim().toUpperCase() === "VIEWER";
  const [searchParams, setSearchParams] = useSearchParams();
  const [schema, setSchema] = useState<FullSchema | null>(null);
  const [table, setTable] = useState("");
  const [joins, setJoins] = useState<Join[]>([]);
  const [query, setQuery] = useState<RuleGroupType>({
    combinator: "and",
    rules: [],
  });
  const [having, setHaving] = useState<RuleGroupType>({
    combinator: "and",
    rules: [],
  });
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([]);
  const [aggregations, setAggregations] = useState<Aggregation[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [groupByDateField, setGroupByDateField] = useState("");
  const [aggregationFunc, setAggregationFunc] = useState("");
  const [aggregationField, setAggregationField] = useState("");
  const [aggregationAliasInput, setAggregationAliasInput] = useState("");
  const [pivotEnabled, setPivotEnabled] = useState(false);
  const [pivotField, setPivotField] = useState("");
  const [pivotValueField, setPivotValueField] = useState("");
  const [pivotFunc, setPivotFunc] = useState("");
  const [pivotValues, setPivotValues] = useState<PivotValue[]>([]);
  const [pivotValueType, setPivotValueType] = useState("string");
  const [pivotValueInput, setPivotValueInput] = useState("");
  const [pivotAliasInput, setPivotAliasInput] = useState("");
  const [fillMissingDates, setFillMissingDates] = useState(false);
  const [limit, setLimit] = useState("");
  const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
  const [results, setResults] = useState<QueryRow[]>([]);

  const [savedQueries, setSavedQueries] = useState<Query[]>([]);
  const [hasLoadedSavedQueries, setHasLoadedSavedQueries] = useState(false);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  const [queryType, setQueryType] = useState<QueryType>("visual");
  const [sqlQuery, setSqlQuery] = useState("");

  const [queryName, setQueryName] = useState("");
  const [queryDescription, setQueryDescription] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSaveBlockedModal, setShowSaveBlockedModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRunningQuery, setIsRunningQuery] = useState(false);

  const [testSuccess, setTestSuccess] = useState(false);
  const [hasInitializedFromUrl, setHasInitializedFromUrl] = useState(false);
  const [skipNextUrlSync, setSkipNextUrlSync] = useState(false);

  const navigate = useNavigate();

  if (isViewer) {
    return <Navigate to="/dashboard" replace />;
  }

  const isRawQualifiedColumn = (value: string) =>
    /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(value);

  const getJoinTableFromField = (value: string): string | null => {
    if (!isRawQualifiedColumn(value)) return null;
    return value.split(".")[0];
  };

  const isDateLikeColumn = (type: string | undefined, name: string) => {
    const normalizedType = (type || "").toLowerCase();
    if (normalizedType.includes("date") || normalizedType.includes("time")) {
      return true;
    }

    return /(_at|date|time)$/i.test(name);
  };

  const getDefaultAggregationAlias = (
    agg: Pick<Aggregation, "func" | "field">,
  ) => `${agg.func.toLowerCase()}_${agg.field}`;

  const getAggregationAlias = (agg: Aggregation) =>
    agg.alias?.trim() || getDefaultAggregationAlias(agg);

  const getSelectedColumnName = (column: VisualSelectColumn) =>
    typeof column === "string" ? column : column.name;

  const getSelectedColumnAlias = (column: VisualSelectColumn) =>
    typeof column === "string" ? "" : column.alias?.trim() || "";

  const normalizeSelectedColumns = (
    columns: VisualQueryRequest["select"] = [],
  ): SelectedColumn[] =>
    columns.reduce<SelectedColumn[]>((acc, column) => {
      const name = getSelectedColumnName(column).trim();
      if (!name || acc.some((item) => item.name === name)) {
        return acc;
      }

      const alias = getSelectedColumnAlias(column);
      acc.push(alias ? { name, alias } : { name });
      return acc;
    }, []);

  const hasSelectValue = (value: string | null | undefined) =>
    typeof value === "string" && value.trim().length > 0;

  const stringifyPivotValue = (value: PivotValueValue) => {
    if (value === null) return "null";
    if (typeof value === "string") return value;
    return String(value);
  };

  const parsePivotValue = (): PivotValueValue | undefined => {
    const rawValue = pivotValueInput.trim();

    switch (pivotValueType) {
      case "number": {
        if (!rawValue) return undefined;
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      case "boolean":
        if (rawValue.toLowerCase() === "true") return true;
        if (rawValue.toLowerCase() === "false") return false;
        return undefined;
      case "null":
        return null;
      case "string":
      default:
        return rawValue ? rawValue : undefined;
    }
  };

  const parsedLimit =
    limit.trim() && Number(limit) > 0 ? Math.floor(Number(limit)) : undefined;

  const handleFormatSql = () => {
    if (!sqlQuery.trim()) {
      toast.error("Enter SQL before formatting.");
      return;
    }

    try {
      setSqlQuery(
        formatSqlString(sqlQuery, {
          language: "sql",
          tabWidth: 2,
          keywordCase: "upper",
          linesBetweenQueries: 1,
        }),
      );
    } catch (error) {
      toast.error("Unable to format SQL.", {
        description:
          error instanceof Error
            ? error.message
            : "Please check the SQL syntax.",
      });
    }
  };

  const parseVisualConfig = (
    value: Query["visual_config"],
  ): VisualQueryRequest | null => {
    if (!value) return null;

    const parsedValue =
      typeof value === "string" ? (JSON.parse(value) as unknown) : value;

    return isVisualQueryRequest(parsedValue) ? parsedValue : null;
  };

  const isVisualQueryRequest = (value: unknown): value is VisualQueryRequest =>
    typeof value === "object" && value !== null && "table" in value;

  const isSharedSqlConfig = (value: unknown): value is SharedSqlConfig =>
    typeof value === "object" &&
    value !== null &&
    "sql" in value &&
    typeof value.sql === "string";

  const emptyRuleGroup: RuleGroupType = {
    combinator: "and",
    rules: [],
  };

  const toRuleGroup = (value: unknown): RuleGroupType => {
    if (
      typeof value === "object" &&
      value !== null &&
      "combinator" in value &&
      "rules" in value
    ) {
      return value as RuleGroupType;
    }

    return emptyRuleGroup;
  };

  const getSqlFromQuery = (savedQuery: Query) =>
    savedQuery.sql_text?.trim() || "";

  const resetVisualBuilderState = () => {
    setJoins([]);
    setSelectedColumns([]);
    setAggregations([]);
    setGroupBy([]);
    setGroupByDateField("");
    setAggregationFunc("");
    setAggregationField("");
    setAggregationAliasInput("");
    setPivotEnabled(false);
    setPivotField("");
    setPivotValueField("");
    setPivotFunc("");
    setPivotValues([]);
    setPivotValueType("string");
    setPivotValueInput("");
    setPivotAliasInput("");
    setFillMissingDates(false);
    setLimit("");
    setOrderBy([]);
    setQuery(emptyRuleGroup);
    setHaving(emptyRuleGroup);
  };

  const applyVisualConfig = (config: VisualQueryRequest) => {
    setTable(config.table || "");
    setJoins(config.joins || []);
    setSelectedColumns(normalizeSelectedColumns(config.select || []));
    setAggregations(
      (config.aggregations || []).map((agg: Aggregation) => ({
        ...agg,
        alias: agg.alias || "",
      })),
    );
    setGroupBy(config.group_by || []);
    setGroupByDateField("");
    setAggregationFunc("");
    setAggregationField("");
    setAggregationAliasInput("");
    const pivot = config.pivot as PivotOptions | undefined;
    setPivotEnabled(Boolean(pivot?.enabled));
    setPivotField(pivot?.pivot_field || "");
    setPivotValueField(pivot?.value_field || "");
    setPivotFunc(pivot?.func || "");
    setPivotValues(pivot?.values || []);
    setPivotValueType("string");
    setPivotValueInput("");
    setPivotAliasInput("");
    setFillMissingDates(Boolean(config.fill_missing_dates));
    setLimit(config.limit ? String(config.limit) : "");
    setOrderBy(config.order_by || []);
    setQuery(toRuleGroup(config.where));
    setHaving(toRuleGroup(config.having));
    setSqlQuery("");
  };

  const applySqlConfig = (sql: string) => {
    resetVisualBuilderState();
    setSqlQuery(sql);
  };

  const getVisualPayload = (): VisualQueryRequest => {
    const pivot = buildPivotOptions();

    return {
      table,
      joins,
      select: effectiveSelectColumns,
      aggregations,
      group_by: groupBy,
      ...(fillMissingDates ? { fill_missing_dates: true } : {}),
      ...(pivot ? { pivot } : {}),
      where: query,
      having,
      order_by: orderBy,
      ...(parsedLimit ? { limit: parsedLimit } : {}),
    };
  };

  const getAllColumnsWithMeta = () => {
    if (!schema || !tableSchema) return [];

    const seen = new Set<string>();
    const columns: { name: string; label: string; type?: string }[] = [];

    Object.entries(tableSchema.columns).forEach(
      ([name, columnSchema]: [string, ColumnSchema]) => {
        if (!seen.has(name)) {
          seen.add(name);
          columns.push({
            name,
            label: name,
            type: columnSchema.type,
          });
        }
      },
    );

    joins.forEach((join) => {
      const joinSchema = schema.tables[join.table];
      if (!joinSchema) return;

      Object.entries(joinSchema.columns).forEach(
        ([name, columnSchema]: [string, ColumnSchema]) => {
          const qualified = `${join.table}.${name}`;

          if (!seen.has(qualified)) {
            seen.add(qualified);
            columns.push({
              name: qualified,
              label: qualified,
              type: columnSchema.type,
            });
          }
        },
      );
    });

    return columns;
  };

  const getAllColumns = () => {
    return getAllColumnsWithMeta().map(({ name, label, type }) => ({
      name,
      label,
      type,
      group: getColumnGroupLabel(name),
    }));
  };

  const getColumnGroupLabel = (value: string) => {
    if (value.startsWith("DATE(")) {
      return "Expressions";
    }

    if (value.includes(".")) {
      return value.split(".")[0];
    }

    return table || "Base Table";
  };

  const groupColumnsByTable = (columns: ColumnOption[]) => {
    const groups = new Map<string, ColumnOption[]>();

    columns.forEach((column) => {
      const existing = groups.get(column.group);

      if (existing) {
        existing.push(column);
        return;
      }

      groups.set(column.group, [column]);
    });

    return Array.from(groups.entries()).map(([group, items]) => ({
      group,
      items,
    }));
  };

  const renderGroupedSelectItems = (columns: ColumnOption[]) =>
    groupColumnsByTable(columns).map(({ group, items }, groupIndex) => (
      <div key={group}>
        {groupIndex > 0 ? <SelectSeparator /> : null}
        <SelectGroup>
          <SelectLabel>{group}</SelectLabel>
          {items.map((column) => (
            <SelectItem key={column.name} value={column.name}>
              {column.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </div>
    ));

  // 🔥 Fetch schema from backend
  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/v1/query/schemas`)
      .then((res) => {
        handleUnauthorizedStatus(res.status);
        return res.json();
      })
      .then((typedData: GetSchemasResponse) => {
        setSchema(typedData.data);
        const firstTable = Object.keys(typedData.data.tables)[0];
        setTable(firstTable);
      });
  }, []);

  useEffect(() => {
    setSelectedColumns((prev) =>
      prev.filter(
        (col) =>
          !col.name.includes(".") ||
          joins.some((j) => col.name.startsWith(j.table + ".")),
      ),
    );
  }, [joins]);

  const refreshSavedQueries = async () => {
    try {
      const queries = await fetchSavedQueries();
      setSavedQueries(queries);
      setHasLoadedSavedQueries(true);
      return queries;
    } catch (err) {
      setHasLoadedSavedQueries(true);
      console.error("Failed to fetch saved queries:", err);
      throw err;
    }
  };

  // FETCH SAVED QUERIES
  useEffect(() => {
    void refreshSavedQueries();
  }, []);

  // LOAD QUERY INTO BUILDER
  const loadQuery = (query: Query) => {
    const nextQueryType = query.query_type || "visual";
    setQueryType(nextQueryType);

    if (nextQueryType === "sql") {
      applySqlConfig(getSqlFromQuery(query));
    } else {
      const config = parseVisualConfig(query.visual_config);

      if (config) {
        applyVisualConfig(config);
      }
    }

    setQueryName(query.name || "");
    setQueryDescription(query.description || "");

    setResults([]);
    setTestSuccess(false);
  };

  // DESELECT QUERY
  const deselectQuery = () => {
    setSelectedQueryId(null);
    setQueryType("visual");
    setSqlQuery("");
    setQueryName("");
    setQueryDescription("");
    setGroupByDateField("");
    setAggregationFunc("");
    setAggregationField("");
    setAggregationAliasInput("");
    setPivotEnabled(false);
    setPivotField("");
    setPivotValueField("");
    setPivotFunc("");
    setPivotValues([]);
    setPivotValueType("string");
    setPivotValueInput("");
    setPivotAliasInput("");
    setFillMissingDates(false);
    setLimit("");
    setResults([]);
    setTestSuccess(false);
  };

  const resetBuilder = () => {
    setSelectedQueryId(null);
    setQueryType("visual");
    setQueryName("");
    setQueryDescription("");
    setSqlQuery("");
    setResults([]);
    setTestSuccess(false);
    setShowDeleteModal(false);
    resetVisualBuilderState();

    if (schema) {
      const firstTable = Object.keys(schema.tables)[0] || "";
      setTable(firstTable);
    } else {
      setTable("");
    }

    setSkipNextUrlSync(true);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  useEffect(() => {
    if (!schema || !hasLoadedSavedQueries || hasInitializedFromUrl) {
      return;
    }

    const queryTypeParam = searchParams.get(QUERY_TYPE_SEARCH_PARAM);
    const configParam = searchParams.get(QUERY_CONFIG_SEARCH_PARAM);
    const savedQueryIdParam = searchParams.get(SAVED_QUERY_ID_SEARCH_PARAM);
    const queryNameParam = searchParams.get(QUERY_NAME_SEARCH_PARAM) || "";
    const queryDescriptionParam =
      searchParams.get(QUERY_DESCRIPTION_SEARCH_PARAM) || "";

    const nextQueryType: QueryType =
      queryTypeParam === "sql" ? "sql" : "visual";
    const hasUrlState =
      Boolean(queryTypeParam) ||
      Boolean(configParam) ||
      Boolean(savedQueryIdParam) ||
      Boolean(queryNameParam) ||
      Boolean(queryDescriptionParam);

    if (!hasUrlState) {
      setHasInitializedFromUrl(true);
      return;
    }

    const matchedSavedQuery = savedQueryIdParam
      ? savedQueries.find((item) => item.id === savedQueryIdParam) || null
      : null;

    setSkipNextUrlSync(true);
    setSelectedQueryId(matchedSavedQuery?.id || null);
    setQueryName(queryNameParam);
    setQueryDescription(queryDescriptionParam);
    setResults([]);
    setTestSuccess(false);

    if (configParam) {
      try {
        const parsedConfig = JSON.parse(configParam) as unknown;
        setQueryType(nextQueryType);

        if (nextQueryType === "sql") {
          const sql =
            typeof parsedConfig === "string"
              ? parsedConfig
              : isSharedSqlConfig(parsedConfig)
                ? parsedConfig.sql
                : "";
          applySqlConfig(sql);
        } else if (isVisualQueryRequest(parsedConfig)) {
          applyVisualConfig(parsedConfig);
        } else {
          throw new Error("Invalid visual query config.");
        }
      } catch (error) {
        toast.error("Unable to load query builder config from URL.", {
          description:
            error instanceof Error
              ? error.message
              : "The shared link is invalid.",
        });
      }
    } else if (matchedSavedQuery) {
      loadQuery(matchedSavedQuery);
    } else {
      setQueryType(nextQueryType);

      if (nextQueryType === "sql") {
        applySqlConfig("");
      } else {
        resetVisualBuilderState();
        const firstTable = Object.keys(schema.tables)[0] || "";
        setTable(firstTable);
      }
    }

    setHasInitializedFromUrl(true);
  }, [
    hasInitializedFromUrl,
    hasLoadedSavedQueries,
    savedQueries,
    schema,
    searchParams,
  ]);

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setShowDeleteModal(false);
  };

  const closeSaveBlockedModal = () => {
    if (isRunningQuery) return;
    setShowSaveBlockedModal(false);
  };

  const tableSchema = schema?.tables[table];

  const fields: QueryBuilderField[] = getAllColumnsWithMeta().map(
    ({ name, label, type }) => {
      const isDateField = isDateLikeColumn(type, name);

      return {
        group: getColumnGroupLabel(name),
        name,
        label,
        type,
        inputType: "text",
        ...(isDateField
          ? {
              placeholder: DATETIME_INPUT_PLACEHOLDER,
              validator: (rule: RuleType) =>
                isValidDateTimeRuleValue(rule.value),
            }
          : {}),
      };
    },
  );

  const groupedQueryBuilderFields = groupColumnsByTable(
    fields.map((field) => ({
      group: field.group || "Fields",
      label: field.label,
      name: field.name,
      type: field.type,
    })),
  ).map(({ group, items }) => ({
    label: group,
    options: items,
  }));

  const toggleColumn = (column: string) => {
    setSelectedColumns((prev) => {
      const updated = prev.some((item) => item.name === column)
        ? prev.filter((item) => item.name !== column)
        : [...prev, { name: column }];

      // Auto-add join if selecting a joined field.
      const joinTable = getJoinTableFromField(column);
      if (joinTable) {
        setJoins((prevJoins) => {
          if (prevJoins.some((j) => j.table === joinTable)) return prevJoins;
          return [...prevJoins, { table: joinTable }];
        });
      }

      return updated;
    });
  };

  const updateSelectedColumnAlias = (column: string, alias: string) => {
    setSelectedColumns((prev) =>
      prev.map((item) => {
        if (item.name !== column) return item;
        if (!alias.trim()) return { name: item.name };
        return { ...item, alias };
      }),
    );
  };

  const toggleGroupBy = (column: string) => {
    setGroupBy((prev) => {
      const updated = prev.includes(column)
        ? prev.filter((c) => c !== column)
        : [...prev, column];

      const joinTable = getJoinTableFromField(column);
      if (joinTable) {
        setJoins((prevJoins) => {
          if (prevJoins.some((j) => j.table === joinTable)) return prevJoins;
          return [...prevJoins, { table: joinTable }];
        });
      }

      return updated;
    });
  };

  const toggleJoin = (joinTable: string) => {
    setJoins((prev) => {
      const exists = prev.some((j) => j.table === joinTable);

      if (exists) {
        return prev.filter((j) => j.table !== joinTable);
      }

      return [...prev, { table: joinTable }];
    });
  };

  useEffect(() => {
    const getFieldJoinTable = (value: string | null | undefined) => {
      if (!value) return null;
      if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(value)) return null;
      return value.split(".")[0];
    };

    const isFieldStillAvailable = (value: string | null | undefined) => {
      if (!hasSelectValue(value)) return false;

      const joinTable = getFieldJoinTable(value);
      if (!joinTable) return true;

      return joins.some((join) => join.table === joinTable);
    };

    setSelectedColumns((prev) =>
      prev.filter((col) => {
        const tbl = getFieldJoinTable(col.name);
        if (!tbl) return true;
        return joins.some((j) => j.table === tbl);
      }),
    );

    setGroupBy((prev) =>
      prev.filter((col) => {
        const tbl = getFieldJoinTable(col);
        if (!tbl) return true;
        return joins.some((j) => j.table === tbl);
      }),
    );

    setOrderBy((prev) =>
      prev.filter((o) => {
        const tbl = getFieldJoinTable(o.field);
        if (!tbl) return true;
        return joins.some((j) => j.table === tbl);
      }),
    );

    setPivotField((prev) => (isFieldStillAvailable(prev) ? prev : ""));
    setPivotValueField((prev) => (isFieldStillAvailable(prev) ? prev : ""));
  }, [joins]);

  const aggregationAliases = aggregations.map(getAggregationAlias);

  const effectiveSelectColumns: SelectedColumn[] = [
    ...selectedColumns,
    ...groupBy
      .filter(
        (groupField) =>
          !selectedColumns.some((column) => column.name === groupField),
      )
      .map((groupField) => ({ name: groupField })),
  ].map((column: SelectedColumn) => {
    const alias = column.alias?.trim();
    return alias ? { ...column, alias } : { name: column.name };
  });

  const havingFields = aggregationAliases.map((alias) => ({
    name: alias,
    label: alias,
  }));

  const buildPivotOptions = (): PivotOptions | undefined => {
    if (!pivotEnabled) return undefined;

    return {
      enabled: true,
      pivot_field: pivotField,
      value_field: pivotValueField,
      func: pivotFunc,
      values: pivotValues,
    };
  };

  const validatePivotOptions = () => {
    if (!pivotEnabled) return true;

    if (!pivotField || !pivotValueField || !pivotFunc) {
      toast.error("Pivot is incomplete.", {
        description:
          "Select pivot field, value field, and function before running or saving.",
      });
      return false;
    }

    if (pivotValues.length === 0) {
      toast.error("Pivot needs at least one value.", {
        description:
          "Add one or more pivot values with aliases before running or saving.",
      });
      return false;
    }

    return true;
  };

  const findInvalidDateTimeRule = (
    ruleGroup: RuleGroupType,
  ): { field: string; value: string } | null => {
    for (const rule of ruleGroup.rules) {
      if ("rules" in rule) {
        const invalidNestedRule = findInvalidDateTimeRule(rule);
        if (invalidNestedRule) return invalidNestedRule;
        continue;
      }

      const matchingField = fields.find((field) => field.name === rule.field);
      if (!matchingField || !isDateLikeColumn(matchingField.type, rule.field)) {
        continue;
      }

      const rawValue = Array.isArray(rule.value)
        ? rule.value.join(", ")
        : String(rule.value ?? "").trim();

      if (rawValue && !isValidDateTimeRuleValue(rule.value)) {
        return {
          field: rule.field,
          value: rawValue,
        };
      }
    }

    return null;
  };

  const validateDateTimeFilters = () => {
    const invalidRule = findInvalidDateTimeRule(query);

    if (!invalidRule) return true;

    toast.error("Invalid datetime filter value.", {
      description: `${invalidRule.field} must use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`,
    });

    return false;
  };

  const runQuery = async () => {
    if (queryType === "visual" && !validatePivotOptions()) return;
    if (queryType === "visual" && !validateDateTimeFilters()) return;
    if (queryType === "sql" && !sqlQuery.trim()) {
      toast.error("SQL query is required before testing.");
      return;
    }

    const payload =
      queryType === "visual" ? getVisualPayload() : { sql: sqlQuery.trim() };

    console.log("Payload:", payload);

    try {
      setIsRunningQuery(true);
      setTestSuccess(false);
      const res = await authFetch(
        `${API_BASE_URL}/api/v1/query/test/${queryType}`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      handleUnauthorizedStatus(res.status);

      const data = (await res.json()) as ResponseApiBase<QueryRow[], unknown>;

      if (res.ok) {
        setTestSuccess(true);
        toast.success("Query test successful.");
        setResults(data.data || []);
      } else {
        setTestSuccess(false);
        toast.error("Query test failed. Please check your configuration.", {
          description: (
            <span className="text-muted-foreground">
              Status:{" "}
              <span className="text-red-500 font-semibold">
                {res.status} {res.statusText}
              </span>
              <br />
              Description: {String(data?.error || "Unknown error")}
            </span>
          ),
        });
        setResults([]);
      }
    } catch (error) {
      setTestSuccess(false);
      setResults([]);
      toast.error("Unable to run query.", {
        description:
          error instanceof Error ? error.message : "Unexpected error.",
      });
    } finally {
      setIsRunningQuery(false);
    }
  };

  const exportResultsToCsv = () => {
    const csv = buildCsvContent(results);

    if (!csv) {
      toast.error("No results available to export.");
      return;
    }

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName =
      queryName
        .trim()
        .replace(/[^a-z0-9-_]+/gi, "_")
        .replace(/^_+|_+$/g, "") || "query-results-" + new Date().getTime();

    link.href = url;
    link.download = `${safeName}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success("Results exported to CSV.");
  };

  useEffect(() => {
    setTestSuccess(false);
  }, [
    queryType,
    sqlQuery,
    table,
    joins,
    selectedColumns,
    aggregations,
    groupBy,
    query,
    having,
    orderBy,
    pivotEnabled,
    pivotField,
    pivotValueField,
    pivotFunc,
    pivotValues,
    limit,
    fillMissingDates,
  ]);

  useEffect(() => {
    if (!schema || !hasInitializedFromUrl) return;

    if (skipNextUrlSync) {
      setSkipNextUrlSync(false);
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    const serializedConfig =
      queryType === "visual"
        ? JSON.stringify(getVisualPayload())
        : JSON.stringify({ sql: sqlQuery });

    nextSearchParams.set(QUERY_TYPE_SEARCH_PARAM, queryType);
    nextSearchParams.set(QUERY_CONFIG_SEARCH_PARAM, serializedConfig);

    if (selectedQueryId) {
      nextSearchParams.set(SAVED_QUERY_ID_SEARCH_PARAM, selectedQueryId);
    } else {
      nextSearchParams.delete(SAVED_QUERY_ID_SEARCH_PARAM);
    }

    if (queryName.trim()) {
      nextSearchParams.set(QUERY_NAME_SEARCH_PARAM, queryName);
    } else {
      nextSearchParams.delete(QUERY_NAME_SEARCH_PARAM);
    }

    if (queryDescription.trim()) {
      nextSearchParams.set(QUERY_DESCRIPTION_SEARCH_PARAM, queryDescription);
    } else {
      nextSearchParams.delete(QUERY_DESCRIPTION_SEARCH_PARAM);
    }

    const nextSearch = nextSearchParams.toString();
    const currentSearch = searchParams.toString();

    if (nextSearch !== currentSearch) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [
    aggregations,
    fillMissingDates,
    groupBy,
    hasInitializedFromUrl,
    having,
    joins,
    limit,
    orderBy,
    pivotEnabled,
    pivotField,
    pivotFunc,
    pivotValueField,
    pivotValues,
    query,
    queryDescription,
    queryName,
    queryType,
    schema,
    searchParams,
    selectedColumns,
    selectedQueryId,
    setSearchParams,
    skipNextUrlSync,
    sqlQuery,
    table,
  ]);

  const saveQuery = async () => {
    if (queryType === "visual" && !validatePivotOptions()) return;
    if (queryType === "visual" && !validateDateTimeFilters()) return;
    if (queryType === "sql" && !sqlQuery.trim()) {
      toast.error("SQL query is required before saving.");
      return;
    }

    const config =
      queryType === "visual" ? getVisualPayload() : { sql: sqlQuery.trim() };

    const payload = {
      name: queryName,
      description: queryDescription,
      query_type: queryType,
      config,
    };

    const url = selectedQueryId
      ? `${API_BASE_URL}/api/v1/query/${selectedQueryId}`
      : `${API_BASE_URL}/api/v1/query`;

    const method = selectedQueryId ? "PUT" : "POST";

    const res = await authFetch(url, {
      method: method,
      body: JSON.stringify(payload),
    });

    handleUnauthorizedStatus(res.status);

    if (res.ok) {
      const data = (await res.json()) as ResponseApiBase<Query>;
      const savedQuery = data?.data as Query | undefined;

      if (savedQuery?.id) {
        setSelectedQueryId(savedQuery.id);
      }

      await refreshSavedQueries();
      toast.success("Query saved successfully.");
    } else {
      const data = (await res.json()) as ResponseApiBase<unknown, unknown>;
      toast.error("Failed to save query.", {
        description: (
          <span className="text-muted-foreground">
            Status:{" "}
            <span className="text-red-500 font-semibold">
              {res.status} {res.statusText}
            </span>
            <br />
            Description: {String(data?.error || "Unknown error")}
          </span>
        ),
      });
    }
  };

  const handleSaveButtonClick = () => {
    if (!testSuccess) {
      setShowSaveBlockedModal(true);
      return;
    }

    void saveQuery();
  };

  const handleDeleteQuery = async () => {
    if (!selectedQueryId) return;

    try {
      setIsDeleting(true);
      await deleteSavedQuery(selectedQueryId);
      await refreshSavedQueries();
      setSelectedQueryId(null);
      setShowDeleteModal(false);
      toast.success("Query deleted successfully.");
    } catch (err) {
      toast.error("Failed to delete query.", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const orderFields = [
    ...getAllColumns(),
    ...groupBy
      .filter(
        (groupField) => !getAllColumns().some((c) => c.name === groupField),
      )
      .map((groupField) => ({
        name: groupField,
        label: groupField,
        group: getColumnGroupLabel(groupField),
      })),
    ...aggregationAliases.map((alias) => ({
      name: alias,
      label: alias,
      group: "Aggregations",
    })),
  ].filter((field) => hasSelectValue(field.name));

  const groupedSelectableColumns = groupColumnsByTable(getAllColumns());

  const dateColumns = getAllColumns().filter(
    (col) => hasSelectValue(col.name) && isDateLikeColumn(col.type, col.name),
  );

  if (!schema || !tableSchema) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading schema...
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-4">
          <Button
            variant="outline"
            className="flex items-center gap-2 cursor-pointer hover:bg-muted transition"
            onClick={() => navigate("/dashboard")}
          >
            <IoArrowBack /> Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Advanced Report Builder</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Build, test, and save analytics queries.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            to="/graphql-playground"
            className="inline-flex items-center rounded-md border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-500/20"
          >
            GraphQL Playground
          </Link>
          <CurrentUserBadge className="bg-slate-950" />
        </div>
      </div>

      {/* SAVED QUERY SELECT */}
      <Card>
        <CardHeader>
          <CardTitle>Load Saved Query</CardTitle>
        </CardHeader>

        <CardContent className="flex gap-3">
          <Select
            value={selectedQueryId || ""}
            onValueChange={(value: string) => {
              setSelectedQueryId(value);
              const selected = savedQueries.find((q) => q.id === value);
              if (selected) loadQuery(selected);
            }}
          >
            <SelectTrigger className="cursor-pointer hover:border-primary/40 transition w-80">
              <SelectValue placeholder="Select saved query" />
            </SelectTrigger>

            <SelectContent>
              {savedQueries
                .filter((q) => hasSelectValue(q.id))
                .map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {selectedQueryId && (
            <>
              <Button
                variant="outline"
                onClick={deselectQuery}
                className="cursor-pointer"
              >
                Deselect
              </Button>

              <Button
                variant="destructive"
                onClick={() => setShowDeleteModal(true)}
                className="cursor-pointer"
              >
                Delete Query
              </Button>
            </>
          )}

          <Button
            variant="outline"
            onClick={resetBuilder}
            className="cursor-pointer"
          >
            Reset All
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          variant={queryType === "visual" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setQueryType("visual")}
        >
          Visual Query Builder
        </Button>
        <Button
          variant={queryType === "sql" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setQueryType("sql")}
        >
          Raw SQL
        </Button>
      </div>

      {queryType === "visual" ? (
        <>
          {/* TABLE SELECT */}
          <Card>
            <CardHeader>
              <CardTitle>Select Table</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={table}
                onValueChange={(value: string) => {
                  setTable(value);
                  resetVisualBuilderState();
                }}
              >
                <SelectTrigger className="min-h-14 cursor-pointer p-3 hover:border-primary/40 transition **:data-[slot=select-value]:items-start">
                  <SelectValue placeholder="Select table" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(schema.tables)
                    .filter(([name]) => hasSelectValue(name))
                    .map(([name, details]) => (
                      <SelectItem key={name} value={name}>
                        <div className="flex flex-col items-start">
                          <span>{name}</span>
                          {details.description ? (
                            <span className="text-xs text-muted-foreground whitespace-normal">
                              {details.description}
                            </span>
                          ) : null}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* JOINS */}
          {tableSchema.relations && (
            <Card>
              <CardHeader>
                <CardTitle>Join Tables</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {Object.keys(tableSchema.relations).map((jt) => {
                  const active = joins.some((j) => j.table === jt);

                  return (
                    <Button
                      key={jt}
                      variant="secondary"
                      onClick={() => toggleJoin(jt)}
                      className={`
                    cursor-pointer transition-all
                    hover:scale-105
                    active:scale-95
                    ${
                      active
                        ? "bg-gray-600 hover:bg-gray-700 text-white border-gray-700"
                        : "hover:bg-muted"
                    }
                  `}
                    >
                      {active ? "Unjoin" : "Join"} {jt}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* SELECT COLUMNS */}
          <Card>
            <CardHeader>
              <CardTitle>Select Columns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {groupedSelectableColumns.map(({ group, items }, groupIndex) => (
                <div key={group} className="space-y-4">
                  {groupIndex > 0 ? <Separator /> : null}
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{group}</p>
                    <p className="text-xs text-muted-foreground">
                      {items.length} column{items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((col) => {
                      const selectedColumn = selectedColumns.find(
                        (item) => item.name === col.name,
                      );
                      const active = Boolean(selectedColumn);
                      return (
                        <div
                          key={col.name}
                          className={`
                        space-y-3 rounded-lg border p-3
                        cursor-pointer transition-all
                        hover:shadow-sm hover:border-primary/40
                        ${active ? "bg-primary/5 border-primary/40" : "bg-background"}
                      `}
                          onClick={() => toggleColumn(col.name)}
                        >
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              checked={active}
                              onCheckedChange={() => toggleColumn(col.name)}
                              onClick={(e: MouseEvent) => e.stopPropagation()}
                            />
                            <label className="text-sm truncate cursor-pointer">
                              {col.label}
                            </label>
                          </div>
                          {active && (
                            <input
                              type="text"
                              value={selectedColumn?.alias || ""}
                              onChange={(e) =>
                                updateSelectedColumnAlias(
                                  col.name,
                                  e.target.value,
                                )
                              }
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Alias (optional)"
                              className="w-full rounded border px-3 py-2 text-sm"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* GROUP BY */}
          <Card>
            <CardHeader>
              <CardTitle>Group By</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-6">
                {groupedSelectableColumns.map(
                  ({ group, items }, groupIndex) => (
                    <div key={group} className="space-y-4">
                      {groupIndex > 0 ? <Separator /> : null}
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{group}</p>
                        <p className="text-xs text-muted-foreground">
                          {items.length} column{items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {items.map((col) => {
                          const active = groupBy.includes(col.name);
                          return (
                            <div
                              key={col.name}
                              className={`
                          flex items-center space-x-2 rounded-lg border p-3
                          cursor-pointer transition-all
                          hover:shadow-sm hover:border-primary/40
                          ${
                            active
                              ? "bg-primary/5 border-primary/40"
                              : "bg-background"
                          }
                        `}
                              onClick={() => toggleGroupBy(col.name)}
                            >
                              <Checkbox
                                checked={active}
                                onCheckedChange={() => toggleGroupBy(col.name)}
                                onClick={(e: MouseEvent) => e.stopPropagation()}
                              />
                              <label className="text-sm truncate cursor-pointer">
                                {col.label}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <Select
                  value={groupByDateField}
                  onValueChange={setGroupByDateField}
                >
                  <SelectTrigger className="w-72 cursor-pointer hover:border-primary/40 transition">
                    <SelectValue placeholder="Datetime field for DATE(...)" />
                  </SelectTrigger>
                  <SelectContent>
                    {renderGroupedSelectItems(dateColumns)}
                  </SelectContent>
                </Select>

                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!groupByDateField) return;

                    const expression = `DATE(${groupByDateField})`;
                    setGroupBy((prev) =>
                      prev.includes(expression) ? prev : [...prev, expression],
                    );

                    const joinTable = getJoinTableFromField(groupByDateField);
                    if (joinTable) {
                      setJoins((prevJoins) => {
                        if (prevJoins.some((j) => j.table === joinTable)) {
                          return prevJoins;
                        }
                        return [...prevJoins, { table: joinTable }];
                      });
                    }
                  }}
                  disabled={!groupByDateField || dateColumns.length === 0}
                >
                  Add Date Group
                </Button>
              </div>

              {groupBy.length > 0 && (
                <div className="space-y-2">
                  {groupBy.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between border rounded p-3 transition hover:bg-muted/40"
                    >
                      <span>{item}</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setGroupBy((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AGGREGATIONS */}
          <Card>
            <CardHeader>
              <CardTitle>Aggregations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <select
                  value={aggregationFunc}
                  onChange={(e) => setAggregationFunc(e.target.value)}
                  className="border rounded px-3 py-2 cursor-pointer hover:border-primary/40 transition"
                >
                  <option value="">Function</option>
                  <option value="SUM">SUM</option>
                  <option value="COUNT">COUNT</option>
                  <option value="AVG">AVG</option>
                  <option value="MIN">MIN</option>
                  <option value="MAX">MAX</option>
                </select>

                <Select
                  value={aggregationField}
                  onValueChange={setAggregationField}
                >
                  <SelectTrigger className="min-w-52 cursor-pointer hover:border-primary/40 transition">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {renderGroupedSelectItems(getAllColumns())}
                  </SelectContent>
                </Select>

                <input
                  type="text"
                  value={aggregationAliasInput}
                  onChange={(e) => setAggregationAliasInput(e.target.value)}
                  className="border rounded px-3 py-2"
                  placeholder={
                    aggregationFunc && aggregationField
                      ? `Alias (default: ${getDefaultAggregationAlias({
                          func: aggregationFunc,
                          field: aggregationField,
                        })})`
                      : "Alias"
                  }
                />

                <Button
                  onClick={() => {
                    const func = aggregationFunc;
                    const field = aggregationField;
                    if (!func || !field) return;
                    setAggregations((prev) => [
                      ...prev,
                      {
                        func,
                        field,
                        alias: aggregationAliasInput.trim(),
                      },
                    ]);
                    setAggregationFunc("");
                    setAggregationField("");
                    setAggregationAliasInput("");
                  }}
                >
                  Add
                </Button>
              </div>

              {aggregations.map((agg, index) => {
                const alias = getAggregationAlias(agg);
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 border rounded p-3 transition hover:bg-muted/40"
                  >
                    <span className="min-w-0 shrink-0 text-sm">
                      {agg.func}({agg.field}) AS
                    </span>
                    <input
                      type="text"
                      value={agg.alias || ""}
                      onChange={(e) =>
                        setAggregations((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, alias: e.target.value }
                              : item,
                          ),
                        )
                      }
                      className="flex-1 border rounded px-3 py-2"
                      placeholder={getDefaultAggregationAlias(agg)}
                    />
                    <span className="text-xs text-muted-foreground shrink-0">
                      Result: {alias}
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setAggregations((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* PIVOT */}
          <Card>
            <CardHeader>
              <CardTitle>Pivot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={pivotEnabled}
                  onCheckedChange={(checked: boolean | "indeterminate") =>
                    setPivotEnabled(Boolean(checked))
                  }
                />
                <label className="text-sm font-medium cursor-pointer">
                  Enable pivot output
                </label>
              </div>

              {pivotEnabled && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Pivot field</p>
                      <Select value={pivotField} onValueChange={setPivotField}>
                        <SelectTrigger className="cursor-pointer hover:border-primary/40 transition">
                          <SelectValue placeholder="Select pivot field" />
                        </SelectTrigger>
                        <SelectContent>
                          {renderGroupedSelectItems(getAllColumns())}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Value field</p>
                      <Select
                        value={pivotValueField}
                        onValueChange={setPivotValueField}
                      >
                        <SelectTrigger className="cursor-pointer hover:border-primary/40 transition">
                          <SelectValue placeholder="Select value field" />
                        </SelectTrigger>
                        <SelectContent>
                          {renderGroupedSelectItems(getAllColumns())}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Function</p>
                      <Select value={pivotFunc} onValueChange={setPivotFunc}>
                        <SelectTrigger className="cursor-pointer hover:border-primary/40 transition">
                          <SelectValue placeholder="Select function" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SUM">SUM</SelectItem>
                          <SelectItem value="COUNT">COUNT</SelectItem>
                          <SelectItem value="AVG">AVG</SelectItem>
                          <SelectItem value="MIN">MIN</SelectItem>
                          <SelectItem value="MAX">MAX</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <Select
                        value={pivotValueType}
                        onValueChange={setPivotValueType}
                      >
                        <SelectTrigger className="cursor-pointer hover:border-primary/40 transition">
                          <SelectValue placeholder="Value type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                          <SelectItem value="null">Null</SelectItem>
                        </SelectContent>
                      </Select>

                      <input
                        type="text"
                        value={pivotValueInput}
                        onChange={(e) => setPivotValueInput(e.target.value)}
                        disabled={pivotValueType === "null"}
                        placeholder={
                          pivotValueType === "boolean"
                            ? "true or false"
                            : pivotValueType === "number"
                              ? "Pivot value"
                              : pivotValueType === "null"
                                ? "No input needed for null"
                                : "Pivot value"
                        }
                        className="border rounded px-3 py-2 md:col-span-2 disabled:bg-muted disabled:text-muted-foreground"
                      />

                      <input
                        type="text"
                        value={pivotAliasInput}
                        onChange={(e) => setPivotAliasInput(e.target.value)}
                        placeholder="Alias"
                        className="border rounded px-3 py-2"
                      />
                    </div>

                    <Button
                      onClick={() => {
                        const parsedValue = parsePivotValue();
                        const alias = pivotAliasInput.trim();

                        if (parsedValue === undefined || !alias) {
                          toast.error("Invalid pivot value.", {
                            description:
                              "Provide a valid pivot value and alias before adding it.",
                          });
                          return;
                        }

                        setPivotValues((prev) => [
                          ...prev,
                          {
                            value: parsedValue,
                            alias,
                          },
                        ]);
                        setPivotValueType("string");
                        setPivotValueInput("");
                        setPivotAliasInput("");
                      }}
                      variant="secondary"
                    >
                      Add Pivot Value
                    </Button>

                    {pivotValues.length > 0 && (
                      <div className="space-y-2">
                        {pivotValues.map((item, index) => (
                          <div
                            key={`${item.alias}-${index}`}
                            className="flex items-center justify-between gap-3 rounded border p-3 transition hover:bg-muted/40"
                          >
                            <span className="text-sm">
                              Value: {stringifyPivotValue(item.value)} | Alias:{" "}
                              {item.alias}
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setPivotValues((prev) =>
                                  prev.filter((_, i) => i !== index),
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* FILTERS */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="query-builder-theme rounded-lg border bg-muted/30 p-4">
                <QueryBuilder
                  fields={groupedQueryBuilderFields}
                  query={query}
                  onQueryChange={setQuery}
                  controlElements={{
                    fieldSelector: GroupedFieldSelector,
                    operatorSelector: ThemedOperatorSelector,
                    valueEditor: DateTimeValueEditor,
                  }}
                  controlClassnames={{
                    queryBuilder: "space-y-4",
                    ruleGroup:
                      "border-l-4 border-primary/40 pl-4 space-y-4 bg-muted/20 rounded-lg p-4",
                    combinators: "border rounded-md px-2 py-1 cursor-pointer",
                    addRule:
                      "bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 cursor-pointer transition",
                    addGroup:
                      "border border-gray-700/80 bg-background text-cyan-900 hover:border-gray-800 hover:bg-cyan-50 rounded-md px-3 py-1 cursor-pointer transition",
                    removeRule:
                      "text-destructive hover:underline cursor-pointer",
                    removeGroup:
                      "text-destructive hover:underline cursor-pointer",
                    fields:
                      "border rounded-md px-2 py-1 cursor-pointer hover:border-primary/40 transition",
                    operators:
                      "border rounded-md px-2 py-1 cursor-pointer hover:border-primary/40 transition",
                    value: "border rounded-md px-2 py-1",
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* HAVING */}
          {aggregations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Having</CardTitle>
              </CardHeader>

              <CardContent>
                <div className="query-builder-theme rounded-lg border bg-muted/30 p-4">
                  <QueryBuilder
                    fields={havingFields}
                    query={having}
                    onQueryChange={setHaving}
                    controlElements={{
                      fieldSelector: GroupedFieldSelector,
                      operatorSelector: ThemedOperatorSelector,
                    }}
                    controlClassnames={{
                      queryBuilder: "space-y-4",
                      ruleGroup:
                        "border-l-4 border-primary/40 pl-4 space-y-4 bg-muted/20 rounded-lg p-4",
                      combinators: "border rounded-md px-2 py-1 cursor-pointer",
                      addRule:
                        "bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 cursor-pointer transition",
                      addGroup:
                        "border border-gray-700/80 bg-background text-cyan-900 hover:border-gray-800 hover:bg-cyan-50 rounded-md px-3 py-1 cursor-pointer transition",
                      removeRule:
                        "text-destructive hover:underline cursor-pointer",
                      removeGroup:
                        "text-destructive hover:underline cursor-pointer",
                      fields:
                        "border rounded-md px-2 py-1 cursor-pointer hover:border-primary/40 transition",
                      operators:
                        "border rounded-md px-2 py-1 cursor-pointer hover:border-primary/40 transition",
                      value: "border rounded-md px-2 py-1",
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ORDER BY */}
          <Card>
            <CardHeader>
              <CardTitle>Order By</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Select
                  onValueChange={(value: string) => {
                    if (!value) return;

                    setOrderBy((prev) => {
                      if (prev.some((o) => o.field === value)) return prev;
                      return [...prev, { field: value, direction: "ASC" }];
                    });

                    if (value.includes(".")) {
                      const [joinTable] = value.split(".");
                      setJoins((prev) => {
                        if (prev.some((j) => j.table === joinTable))
                          return prev;
                        return [...prev, { table: joinTable }];
                      });
                    }
                  }}
                >
                  <SelectTrigger className="w-55 cursor-pointer hover:border-primary/40 transition">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>

                  <SelectContent>
                    {renderGroupedSelectItems(orderFields)}
                  </SelectContent>
                </Select>
              </div>

              {orderBy.map((o, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border rounded p-3 transition hover:bg-muted/40"
                >
                  <span>{o.field}</span>

                  <div className="flex gap-2">
                    <Select
                      value={o.direction}
                      onValueChange={(dir: string) => {
                        setOrderBy((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, direction: dir } : item,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger className="w-25 cursor-pointer hover:border-primary/40 transition">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="ASC">ASC</SelectItem>
                        <SelectItem value="DESC">DESC</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setOrderBy((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* LIMIT */}
          <Card>
            <CardHeader>
              <CardTitle>Limit</CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              <input
                type="number"
                min="1"
                step="1"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="Optional row limit"
                className="w-full max-w-xs border rounded px-3 py-2"
              />
              <p className="text-sm text-muted-foreground">
                Leave empty to fetch without a limit.
              </p>
              <label className="flex items-center gap-3 pt-2">
                <Checkbox
                  checked={fillMissingDates}
                  onCheckedChange={(checked: boolean | "indeterminate") =>
                    setFillMissingDates(Boolean(checked))
                  }
                />
                <div>
                  <p className="text-sm font-medium">Fill Missing Dates</p>
                  <p className="text-sm text-muted-foreground">
                    Include empty dates with no data in test results.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Raw SQL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleFormatSql}
                className="cursor-pointer"
              >
                Format
              </Button>
            </div>
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM your_table LIMIT 100;"
              className="min-h-80 w-full rounded-md border px-3 py-2 font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Testing uses `POST /query/test/sql` with an `sql` payload, and
              saving uses `query_type = sql` with `config.sql`.
            </p>
          </CardContent>
        </Card>
      )}

      {/* RUN QUERY */}
      <div className="flex items-center gap-3">
        <Button
          size="lg"
          onClick={runQuery}
          disabled={isRunningQuery}
          className="cursor-pointer hover:scale-105 active:scale-95 transition disabled:hover:scale-100"
        >
          {isRunningQuery ? (
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              {queryType === "visual"
                ? "Running Visual Query..."
                : "Running SQL..."}
            </span>
          ) : queryType === "visual" ? (
            "Run Visual Query"
          ) : (
            "Run SQL"
          )}
        </Button>

        {testSuccess && (
          <div className="flex items-center text-green-600 gap-2">
            <FaCheckCircle />
            <span className="text-sm font-medium">Query test successful</span>
          </div>
        )}
      </div>

      {/* SAVE QUERY */}
      <Card>
        <CardHeader>
          <CardTitle>Save Query</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <input
            type="text"
            placeholder="Query Name"
            value={queryName}
            onChange={(e) => setQueryName(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />

          <textarea
            placeholder="Description"
            value={queryDescription}
            onChange={(e) => setQueryDescription(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />

          <Button
            onClick={handleSaveButtonClick}
            aria-disabled={!testSuccess}
            className={`transition ${
              testSuccess
                ? "cursor-pointer hover:scale-105 active:scale-95"
                : "cursor-not-allowed opacity-50"
            }`}
          >
            {selectedQueryId ? "Update Query" : "Save Query"}
          </Button>
        </CardContent>
      </Card>

      {/* RESULTS */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Results</CardTitle>
            <Button
              type="button"
              variant="outline"
              onClick={exportResultsToCsv}
              className="cursor-pointer"
            >
              Export to CSV
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.keys(results[0]).map((k) => (
                    <TableHead key={k} className="cursor-default">
                      {k}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row, i) => (
                  <TableRow key={i} className="hover:bg-muted/40 transition">
                    {Object.values(row).map((v, j) => (
                      <TableCell key={j}>{formatResultValue(v)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showDeleteModal && selectedQueryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Delete saved query?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will send `DELETE /query/{selectedQueryId}` and remove
              <span className="font-medium text-foreground">
                {" "}
                {queryName || "the selected query"}
              </span>
              .
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteQuery}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={showSaveBlockedModal && !testSuccess}
        onOpenChange={(open) => {
          if (open) {
            setShowSaveBlockedModal(true);
            return;
          }

          closeSaveBlockedModal();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run the query before saving</DialogTitle>
            <DialogDescription>
              {queryType === "visual"
                ? "Run Visual Query first."
                : "Run SQL first."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeSaveBlockedModal}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
