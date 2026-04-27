import { API_BASE_URL, type ResponseApiBase } from "@/api/base";
import { authFetch } from "@/api/client";
import { fetchDepartments } from "@/api/departments";
import { deleteSavedQuery, fetchSavedQueries } from "@/api/queries";
import { isSuperUserRole } from "@/api/users";
import { handleUnauthorizedStatus } from "@/api/utils";
import { CurrentUserBadge } from "@/components/CurrentUserBadge";
import { DataTable, type ResolvedDataTableModel } from "@/components/DataTable";
import { VariableDatePicker } from "@/components/VariableDatePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";
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
import {
  coercePrimitiveValue,
  formatVariableValueForText,
  parseVariableValueFromText,
  stringifyVariableOptionValue,
} from "@/lib/variables";
import {
  type Query,
  type QueryType,
  type QueryVariableDefinition,
  type QueryVariableMap,
  type QueryVariableOption,
} from "@/types/query";
import type { UserDepartment } from "@/types/user";
import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
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
  type ValueSourceSelectorProps,
} from "react-querybuilder";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { format as formatSqlString } from "sql-formatter";

import type { GetSchemasResponse } from "@/api/queries";
import { safeRandomUUID } from "@/lib/utils";
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

const buildCsvContent = (
  data: QueryRow[] = [],
  columns: string[] = getResultColumns(data),
): string => {
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
const DATE_GROUP_TYPE_OPTIONS = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

type DateGroupType = (typeof DATE_GROUP_TYPE_OPTIONS)[number]["value"];

type QueryBuilderField = Field & {
  group?: string;
  type?: string;
  enumValues?: string[];
};

type QueryBuilderValueEditorContext = {
  variableKeyOptions?: string[];
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

type QueryVariableDraft = QueryVariableDefinition & {
  draftId: string;
  sourceKind?: "none" | "options" | "sql";
  optionsText?: string;
};

type FilterReferenceSection = {
  title: string;
  description: string;
  rows: Array<{
    value: string;
    indicator: string;
  }>;
};

const QUERY_TYPE_SEARCH_PARAM = "queryType";
const QUERY_CONFIG_SEARCH_PARAM = "config";
const QUERY_NAME_SEARCH_PARAM = "queryName";
const QUERY_DESCRIPTION_SEARCH_PARAM = "queryDescription";
const SAVED_QUERY_ID_SEARCH_PARAM = "savedQueryId";

const FILTER_REFERENCE_SECTIONS: FilterReferenceSection[] = [
  {
    title: "source_id",
    description:
      "Multi-source analytics data can come from different underlying databases.",
    rows: [
      { value: "1", indicator: "leanx" },
      { value: "2", indicator: "payright" },
    ],
  },
];

const VARIABLE_TYPE_OPTIONS = [
  "string",
  "number",
  "boolean",
  "select",
  "date",
  "datetime",
];
const EMPTY_TEST_VARIABLE_VALUE = "__none__";

const createEmptyVariableDraft = (
  forceRequired = false,
): QueryVariableDraft => ({
  draftId: safeRandomUUID(),
  key: "",
  label: "",
  type: "string",
  required: forceRequired,
  multiple: false,
  options: [],
  sourceKind: "none",
  optionsText: "",
});

const createStatusesPresetVariableDraft = (
  forceRequired = false,
): QueryVariableDraft => ({
  draftId: safeRandomUUID(),
  key: "statuses",
  label: "Status",
  type: "string",
  required: forceRequired,
  multiple: false,
  options: [
    { label: "Success", value: "SUCCESS" },
    { label: "Failed", value: "FAILED" },
  ],
  sourceKind: "options",
  optionsText: "Success=SUCCESS\nFailed=FAILED",
});

const formatVariableOptionsText = (options?: QueryVariableOption[]) =>
  (options ?? [])
    .map((option) =>
      option.label === String(option.value ?? "")
        ? String(option.value ?? "")
        : `${option.label}=${String(option.value ?? "")}`,
    )
    .join("\n");

const parseVariableOptionsText = (
  value: string,
  type: string,
): QueryVariableOption[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawLabel, ...rest] = line.split("=");
      const label = rawLabel.trim();
      const rawValue = rest.length ? rest.join("=").trim() : label;

      return {
        label,
        value: coercePrimitiveValue(rawValue, { type }),
      };
    });

const getTestVariableOptions = (
  variable: QueryVariableDefinition,
): QueryVariableOption[] => {
  if (variable.options?.length) {
    return variable.options;
  }

  if (variable.type === "boolean") {
    return [
      { label: "True", value: true },
      { label: "False", value: false },
    ];
  }

  return [];
};

const toVariableDraft = (
  variable?: QueryVariableDefinition,
  forceRequired = false,
): QueryVariableDraft =>
  variable
    ? {
        ...variable,
        required: forceRequired || Boolean(variable.required),
        draftId: safeRandomUUID(),
        sourceKind:
          variable.source?.kind === "sql"
            ? "sql"
            : variable.options?.length
              ? "options"
              : "none",
        optionsText: formatVariableOptionsText(variable.options),
      }
    : createEmptyVariableDraft(forceRequired);

const normalizeVariableDraft = (
  draft: QueryVariableDraft,
  forceRequired = false,
): QueryVariableDefinition | null => {
  const key = draft.key.trim();
  const label = draft.label.trim();

  if (!key || !label) {
    return null;
  }

  const normalized: QueryVariableDefinition = {
    key,
    label,
    type: draft.type,
    required: forceRequired || Boolean(draft.required),
    multiple: Boolean(draft.multiple),
  };

  if (draft.sourceKind === "sql") {
    const sql = draft.source?.sql?.trim();
    if (sql) {
      normalized.source = {
        kind: "sql",
        sql,
        value_field: draft.source?.value_field?.trim() || "value",
        label_field: draft.source?.label_field?.trim() || "label",
      };
    }
  }

  if (draft.sourceKind === "options") {
    const options = parseVariableOptionsText(
      draft.optionsText ?? "",
      draft.type,
    );
    if (options.length) {
      normalized.options = options;
    }
  }

  return normalized;
};

const transformRuleGroupValueSource = (
  value: unknown,
  mode: "editor" | "api",
): unknown => {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => transformRuleGroupValueSource(item, mode));
  }

  if ("rules" in value && Array.isArray(value.rules)) {
    return {
      ...value,
      rules: value.rules.map((rule) =>
        transformRuleGroupValueSource(rule, mode),
      ),
    };
  }

  if ("field" in value && "operator" in value) {
    const rule = value as RuleType & { valueSource?: string };
    const currentValueSource = rule.valueSource as string | undefined;
    return {
      ...rule,
      valueSource:
        mode === "editor"
          ? currentValueSource === "variable"
            ? "field"
            : currentValueSource
          : currentValueSource === "field"
            ? "variable"
            : currentValueSource,
    };
  }

  return value;
};

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

const EMPTY_VARIABLE_KEY_OPTIONS: string[] = [];

const getVariableKeyOptionsFromContext = (context: unknown): string[] => {
  if (!context || typeof context !== "object") {
    return EMPTY_VARIABLE_KEY_OPTIONS;
  }

  const variableKeyOptions = (context as QueryBuilderValueEditorContext)
    .variableKeyOptions;

  return Array.isArray(variableKeyOptions)
    ? variableKeyOptions
    : EMPTY_VARIABLE_KEY_OPTIONS;
};

const VariableAwareValueEditor = (props: ValueEditorProps) => {
  const { context, handleOnChange, value, valueSource } = props;
  const variableKeyOptions = getVariableKeyOptionsFromContext(context);
  const currentValue = String(value ?? "");
  const selectedValue =
    valueSource === "field" && variableKeyOptions.includes(currentValue)
      ? currentValue
      : undefined;

  useEffect(() => {
    if (valueSource !== "field") {
      return;
    }

    if (currentValue && !variableKeyOptions.includes(currentValue)) {
      handleOnChange("");
    }
  }, [currentValue, handleOnChange, valueSource, variableKeyOptions]);

  if (valueSource === "field") {
    return (
      <Select
        value={selectedValue}
        onValueChange={(value) =>
          handleOnChange(value === "__empty__" ? "" : value)
        }
      >
        <SelectTrigger className="min-w-40 cursor-pointer hover:border-primary/40 transition">
          <SelectValue placeholder="Select variable" />
        </SelectTrigger>
        <SelectContent>
          {variableKeyOptions.map((variableKey) => (
            <SelectItem key={variableKey} value={variableKey}>
              {variableKey}
            </SelectItem>
          ))}
          {!variableKeyOptions.length ? (
            <SelectItem value="__empty__" disabled>
              No variables defined
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    );
  }

  return <DateTimeValueEditor {...props} />;
};

const VariableValueSourceSelector = (props: ValueSourceSelectorProps) => (
  <Select value={props.value} onValueChange={props.handleOnChange}>
    <SelectTrigger className="min-w-32 cursor-pointer hover:border-primary/40 transition">
      <SelectValue placeholder="Value source" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="value">Value</SelectItem>
      <SelectItem value="field">Variable</SelectItem>
    </SelectContent>
  </Select>
);

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
  const currentRoleName = currentUser?.role?.name;
  const isViewer = currentRoleName?.trim().toUpperCase() === "VIEWER";
  const isSuperAdmin = isSuperUserRole(currentRoleName);
  const currentDepartmentValue =
    currentUser?.department?.slug || currentUser?.department?.name || "";
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
  const [groupByDateType, setGroupByDateType] =
    useState<DateGroupType>("daily");
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
  const [resultsPageSize, setResultsPageSize] = useState("25");
  const [resolvedResultsTable, setResolvedResultsTable] =
    useState<ResolvedDataTableModel>({
      columns: [],
      rows: [],
    });

  const [savedQueries, setSavedQueries] = useState<Query[]>([]);
  const [hasLoadedSavedQueries, setHasLoadedSavedQueries] = useState(false);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  const [savedQuerySearch, setSavedQuerySearch] = useState("");
  const [departments, setDepartments] = useState<UserDepartment[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [queryType, setQueryType] = useState<QueryType>("visual");
  const [sqlQuery, setSqlQuery] = useState("");
  const [variables, setVariables] = useState<QueryVariableDraft[]>([]);
  const [testVariableInputs, setTestVariableInputs] = useState<
    Record<string, string>
  >({});

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

  const variableKeyOptions = useMemo(
    () => variables.map((variable) => variable.key.trim()).filter(Boolean),
    [variables],
  );

  const queryBuilderValueEditorContext = useMemo(
    () => ({ variableKeyOptions }),
    [variableKeyOptions],
  );

  if (isViewer) {
    return <Navigate to="/dashboard" replace />;
  }

  const isRawQualifiedColumn = (value: string) =>
    /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(value);

  const getDateGroupExpression = (
    field: string,
    groupType: DateGroupType,
  ): string => {
    switch (groupType) {
      case "hourly":
        return `HOURLY(${field})`;
      case "weekly":
        return `WEEKLY(${field})`;
      case "monthly":
        return `MONTHLY(${field})`;
      case "daily":
      default:
        return `DATE(${field})`;
    }
  };

  const getExpressionField = (value: string): string | null => {
    const match = value.match(/^(?:DATE|HOURLY|WEEKLY|MONTHLY)\((.+)\)$/);
    return match?.[1]?.trim() || null;
  };

  const isDateGroupExpression = (value: string) =>
    /^(?:DATE|HOURLY|WEEKLY|MONTHLY)\(.+\)$/.test(value);

  const getJoinTableFromField = (value: string): string | null => {
    if (isRawQualifiedColumn(value)) {
      return value.split(".")[0];
    }

    const expressionField = getExpressionField(value);
    if (!expressionField || !isRawQualifiedColumn(expressionField)) {
      return null;
    }

    return expressionField.split(".")[0];
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
          language: "mysql",
          tabWidth: 2,
          keywordCase: "upper",
          linesBetweenQueries: 1,
          paramTypes: {
            named: [":"],
          },
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

  const normalizedVariables = useMemo(
    () =>
      variables
        .map((variable) =>
          normalizeVariableDraft(variable, queryType === "sql"),
        )
        .filter((variable): variable is QueryVariableDefinition =>
          Boolean(variable),
        ),
    [queryType, variables],
  );

  const testVariablesPayload = useMemo(
    () =>
      normalizedVariables.reduce<QueryVariableMap>((acc, variable) => {
        const rawInput = testVariableInputs[variable.key] ?? "";
        const parsedValue = parseVariableValueFromText(rawInput, variable);

        if (Array.isArray(parsedValue)) {
          if (parsedValue.length) {
            acc[variable.key] = parsedValue;
          }
          return acc;
        }

        if (
          parsedValue !== null &&
          parsedValue !== undefined &&
          String(parsedValue).trim() !== ""
        ) {
          acc[variable.key] = parsedValue;
        }

        return acc;
      }, {}),
    [normalizedVariables, testVariableInputs],
  );
  const normalizedVariablesByKey = useMemo(
    () =>
      Object.fromEntries(
        normalizedVariables.map((variable) => [variable.key, variable]),
      ),
    [normalizedVariables],
  );

  const resetVisualBuilderState = () => {
    setJoins([]);
    setSelectedColumns([]);
    setAggregations([]);
    setGroupBy([]);
    setGroupByDateField("");
    setGroupByDateType("daily");
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
    setTestVariableInputs({});
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
    setGroupByDateType("daily");
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
    setQuery(
      transformRuleGroupValueSource(
        toRuleGroup(config.where),
        "editor",
      ) as RuleGroupType,
    );
    setHaving(
      transformRuleGroupValueSource(
        toRuleGroup(config.having),
        "editor",
      ) as RuleGroupType,
    );
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
      where: transformRuleGroupValueSource(query, "api"),
      having: transformRuleGroupValueSource(having, "api"),
      order_by: orderBy,
      ...(parsedLimit ? { limit: parsedLimit } : {}),
    };
  };

  const getAllColumnsWithMeta = () => {
    if (!schema || !tableSchema) return [];

    const seen = new Set<string>();
    const columns: {
      name: string;
      label: string;
      type?: string;
      values?: string[];
    }[] = [];

    Object.entries(tableSchema.columns).forEach(
      ([name, columnSchema]: [string, ColumnSchema]) => {
        if (!seen.has(name)) {
          seen.add(name);
          columns.push({
            name,
            label: name,
            type: columnSchema.type,
            values: columnSchema.values,
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
              values: columnSchema.values,
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
    if (/^(?:DATE|HOURLY|WEEKLY|MONTHLY)\(/.test(value)) {
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
      const queries = await fetchSavedQueries(currentRoleName);
      setSavedQueries(queries);
      setHasLoadedSavedQueries(true);
      return queries;
    } catch (err) {
      setHasLoadedSavedQueries(true);
      console.error("Failed to fetch saved queries:", err);
      throw err;
    }
  };

  const groupedSavedQueries = savedQueries.reduce<
    Array<{ departmentName: string; queries: Query[] }>
  >((groups, query) => {
    if (!hasSelectValue(query.id)) {
      return groups;
    }

    const departmentName = query.department?.name?.trim() || "No Department";
    const existingGroup = groups.find(
      (group) => group.departmentName === departmentName,
    );

    if (existingGroup) {
      existingGroup.queries.push(query);
      return groups;
    }

    groups.push({
      departmentName,
      queries: [query],
    });

    return groups;
  }, []);
  const selectableSavedQueries = savedQueries.filter((q) =>
    hasSelectValue(q.id),
  );
  const normalizedSavedQuerySearch = savedQuerySearch.trim().toLowerCase();
  const filteredSavedQueries = normalizedSavedQuerySearch
    ? selectableSavedQueries.filter((query) =>
        query.name.toLowerCase().includes(normalizedSavedQuerySearch),
      )
    : selectableSavedQueries;
  const filteredGroupedSavedQueries = groupedSavedQueries
    .map((group) => ({
      departmentName: group.departmentName,
      queries: group.queries.filter((query) =>
        normalizedSavedQuerySearch
          ? query.name.toLowerCase().includes(normalizedSavedQuerySearch)
          : true,
      ),
    }))
    .filter((group) => group.queries.length > 0);
  const selectedSavedQuery =
    selectableSavedQueries.find((query) => query.id === selectedQueryId) ??
    null;

  // FETCH SAVED QUERIES
  useEffect(() => {
    void refreshSavedQueries();
  }, [currentRoleName]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setDepartments([]);
      setSelectedDepartment("");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const nextDepartments = await fetchDepartments();
        if (cancelled) return;

        setDepartments(nextDepartments);
        setSelectedDepartment((prev) => {
          if (
            prev &&
            nextDepartments.some((department) => department.slug === prev)
          ) {
            return prev;
          }

          if (
            currentDepartmentValue &&
            nextDepartments.some(
              (department) => department.slug === currentDepartmentValue,
            )
          ) {
            return currentDepartmentValue;
          }

          return nextDepartments[0]?.slug || "";
        });
      } catch (error) {
        if (cancelled) return;

        toast.error("Failed to load departments.", {
          description:
            error instanceof Error ? error.message : "Unexpected error.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentDepartmentValue, isSuperAdmin]);

  // LOAD QUERY INTO BUILDER
  const loadQuery = (query: Query) => {
    const nextQueryType = query.query_type || "visual";
    setQueryType(nextQueryType);
    setVariables(
      (query.variables ?? []).map((variable) =>
        toVariableDraft(variable, nextQueryType === "sql"),
      ),
    );
    setTestVariableInputs(
      Object.fromEntries(
        (query.variables ?? []).map((variable) => [
          variable.key,
          formatVariableValueForText(query.applied_variables?.[variable.key]),
        ]),
      ),
    );

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
    if (isSuperAdmin) {
      setSelectedDepartment(query.department?.slug || currentDepartmentValue);
    }

    setResults([]);
    setTestSuccess(false);
  };

  // DESELECT QUERY
  const deselectQuery = () => {
    setSelectedQueryId(null);
    setSavedQuerySearch("");
    if (isSuperAdmin) {
      setSelectedDepartment(currentDepartmentValue);
    }
    setQueryType("visual");
    setSqlQuery("");
    setQueryName("");
    setQueryDescription("");
    setVariables([]);
    setTestVariableInputs({});
    setGroupByDateField("");
    setGroupByDateType("daily");
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
    setSavedQuerySearch("");
    if (isSuperAdmin) {
      setSelectedDepartment(currentDepartmentValue);
    }
    setQueryType("visual");
    setQueryName("");
    setQueryDescription("");
    setVariables([]);
    setTestVariableInputs({});
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

      if (isSuperAdmin) {
        setSelectedDepartment(currentDepartmentValue);
      }
    }

    setHasInitializedFromUrl(true);
  }, [
    currentDepartmentValue,
    hasInitializedFromUrl,
    hasLoadedSavedQueries,
    isSuperAdmin,
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
    ({ name, label, type, values }) => {
      const isDateField = isDateLikeColumn(type, name);

      return {
        group: getColumnGroupLabel(name),
        name,
        label,
        type,
        enumValues: values,
        ...(type?.toLowerCase() === "enum" && values?.length
          ? {
              valueEditorType: "select" as const,
              values: values.map((value) => ({
                name: value,
                label: value,
              })),
            }
          : {}),
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
      ...field,
      group: field.group || "Fields",
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

  const getGroupByAlias = (column: string) =>
    selectedColumns.find((item) => item.name === column)?.alias || "";

  const updateGroupByAlias = (column: string, alias: string) => {
    setSelectedColumns((prev) => {
      const trimmedAlias = alias.trim();
      const existingIndex = prev.findIndex((item) => item.name === column);

      if (existingIndex === -1) {
        if (!trimmedAlias) {
          return prev;
        }

        return [...prev, { name: column, alias: trimmedAlias }];
      }

      return prev.map((item, index) => {
        if (index !== existingIndex) return item;
        if (!trimmedAlias) return { name: item.name };
        return { ...item, alias: trimmedAlias };
      });
    });
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
    const isFieldStillAvailable = (value: string | null | undefined) => {
      const normalizedValue = typeof value === "string" ? value.trim() : "";
      if (!normalizedValue) return false;

      const joinTable = getJoinTableFromField(normalizedValue);
      if (!joinTable) return true;

      return joins.some((join) => join.table === joinTable);
    };

    setSelectedColumns((prev) =>
      prev.filter((col) => {
        const tbl = getJoinTableFromField(col.name);
        if (!tbl) return true;
        return joins.some((j) => j.table === tbl);
      }),
    );

    setGroupBy((prev) =>
      prev.filter((col) => {
        const tbl = getJoinTableFromField(col);
        if (!tbl) return true;
        return joins.some((j) => j.table === tbl);
      }),
    );

    setOrderBy((prev) =>
      prev.filter((o) => {
        const tbl = getJoinTableFromField(o.field);
        if (!tbl) return true;
        return joins.some((j) => j.table === tbl);
      }),
    );

    setPivotField((prev) => (isFieldStillAvailable(prev) ? prev : ""));
    setPivotValueField((prev) => (isFieldStillAvailable(prev) ? prev : ""));
  }, [joins]);

  useEffect(() => {
    setSelectedColumns((prev) =>
      prev.filter(
        (column) =>
          !isDateGroupExpression(column.name) || groupBy.includes(column.name),
      ),
    );
  }, [groupBy]);

  const aggregationAliases = aggregations.map(getAggregationAlias);
  const pivotAliases = Array.from(
    new Set(
      pivotValues
        .map((pivotValue) => pivotValue.alias.trim())
        .filter(hasSelectValue),
    ),
  );

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
  ): { field: string; value: string; variableKey?: string } | null => {
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

      const valueSource =
        "valueSource" in rule ? String(rule.valueSource ?? "") : "";

      if (valueSource === "field") {
        const variableKey = String(rule.value ?? "").trim();
        const variableDefinition = normalizedVariablesByKey[variableKey];
        const rawVariableValue = testVariableInputs[variableKey]?.trim() ?? "";

        if (!variableDefinition || !rawVariableValue) {
          continue;
        }

        if (!isValidDateTimeRuleValue(rawVariableValue)) {
          return {
            field: rule.field,
            value: rawVariableValue,
            variableKey,
          };
        }

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
      description: invalidRule.variableKey
        ? `${invalidRule.field} uses variable "${invalidRule.variableKey}", which must use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`
        : `${invalidRule.field} must use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`,
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

    const config =
      queryType === "visual" ? getVisualPayload() : { sql: sqlQuery.trim() };
    const shouldWrapWithVariables = normalizedVariables.length > 0;
    const payload = shouldWrapWithVariables
      ? {
          config,
          variables: testVariablesPayload,
        }
      : config;

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
    const csv = buildCsvContent(
      resolvedResultsTable.rows,
      resolvedResultsTable.columns,
    );

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
    testVariableInputs,
  ]);

  useEffect(() => {
    setTestVariableInputs((prev) =>
      Object.fromEntries(
        normalizedVariables.map((variable) => [
          variable.key,
          prev[variable.key] ?? "",
        ]),
      ),
    );
  }, [normalizedVariables]);

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
    if (isSuperAdmin && !selectedDepartment.trim()) {
      toast.error("Department is required.");
      return;
    }

    const config =
      queryType === "visual" ? getVisualPayload() : { sql: sqlQuery.trim() };

    const payload = {
      name: queryName,
      description: queryDescription,
      query_type: queryType,
      config,
      variables: normalizedVariables,
      ...(isSuperAdmin && selectedDepartment.trim()
        ? { department: selectedDepartment.trim() }
        : {}),
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
    ...pivotAliases.map((alias) => ({
      name: alias,
      label: alias,
      group: "Pivot Aliases",
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
          {/* <Link
            to="/graphql-playground"
            className="inline-flex items-center rounded-md border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-500/20"
          >
            GraphQL Playground
          </Link> */}
          <CurrentUserBadge className="bg-slate-950" />
        </div>
      </div>

      {/* SAVED QUERY SELECT */}
      <Card>
        <CardHeader>
          <CardTitle>Load Saved Query</CardTitle>
        </CardHeader>

        <CardContent className="flex gap-3">
          <Combobox<Query>
            items={
              isSuperAdmin
                ? filteredGroupedSavedQueries.map((group) => ({
                    departmentName: group.departmentName,
                    items: group.queries,
                  }))
                : filteredSavedQueries
            }
            value={selectedSavedQuery}
            onValueChange={(selectedQuery) => {
              setSelectedQueryId(selectedQuery?.id ?? null);
              if (selectedQuery) loadQuery(selectedQuery);
            }}
            inputValue={savedQuerySearch}
            onInputValueChange={setSavedQuerySearch}
            itemToStringLabel={(query) => query.name}
            itemToStringValue={(query) => query.id}
          >
            <ComboboxInput
              placeholder="Search saved query by name"
              className="w-80"
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>No saved queries found.</ComboboxEmpty>
              <ComboboxList>
                {isSuperAdmin ? (
                  filteredGroupedSavedQueries.map((group, groupIndex) => (
                    <ComboboxGroup
                      key={group.departmentName}
                      items={group.queries}
                    >
                      {groupIndex > 0 ? <ComboboxSeparator /> : null}
                      <ComboboxLabel>{group.departmentName}</ComboboxLabel>
                      <ComboboxCollection>
                        {(query: Query) => (
                          <ComboboxItem key={query.id} value={query}>
                            {query.name}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxGroup>
                  ))
                ) : (
                  <ComboboxCollection>
                    {(query: Query) => (
                      <ComboboxItem key={query.id} value={query}>
                        {query.name}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

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

      <Card className="overflow-hidden border-cyan-200/50 bg-linear-to-br from-cyan-50/80 via-white to-slate-50">
        <CardHeader className="border-cyan-100/80 bg-white/55">
          <CardTitle className="text-base tracking-tight">
            Filter Reference
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Quick lookup for hardcoded filter values used by the analytics
            layer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {FILTER_REFERENCE_SECTIONS.map((section) => (
            <div
              key={section.title}
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85"
            >
              <div className="border-b border-slate-100 bg-linear-to-r from-cyan-50/80 to-transparent px-4 py-3.5">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  {section.title}
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  {section.description}
                </p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableHead className="w-30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Value
                    </TableHead>
                    <TableHead className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Indicator
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.rows.map((row) => (
                    <TableRow
                      key={`${section.title}-${row.value}`}
                      className="border-slate-100 hover:bg-transparent"
                    >
                      <TableCell className="px-4 py-3.5 font-semibold text-slate-900">
                        {row.value}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 font-medium text-slate-700">
                        {row.indicator}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
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

      <Card>
        <CardHeader>
          <CardTitle>Runtime Variables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Define reusable variables for dashboard and widget filters. Visual
            filters can then reference them with the value source set to
            Variable.
          </p>

          {variables.length ? (
            <div className="space-y-4">
              {variables.map((variable, index) => (
                <div
                  key={variable.draftId}
                  className="space-y-4 rounded-lg border p-4"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <input
                      type="text"
                      value={variable.key}
                      onChange={(event) =>
                        setVariables((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, key: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Key"
                      className="w-full rounded border px-3 py-2"
                    />
                    <input
                      type="text"
                      value={variable.label}
                      onChange={(event) =>
                        setVariables((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Label"
                      className="w-full rounded border px-3 py-2"
                    />
                    <Select
                      value={variable.type}
                      onValueChange={(value) =>
                        setVariables((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, type: value }
                              : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIABLE_TYPE_OPTIONS.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={
                          queryType === "sql" || Boolean(variable.required)
                        }
                        disabled={queryType === "sql"}
                        onCheckedChange={(checked) =>
                          setVariables((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    required:
                                      queryType === "sql"
                                        ? true
                                        : Boolean(checked),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      {queryType === "sql"
                        ? "Required (always on for SQL)"
                        : "Required"}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={Boolean(variable.multiple)}
                        onCheckedChange={(checked) =>
                          setVariables((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, multiple: Boolean(checked) }
                                : item,
                            ),
                          )
                        }
                      />
                      Multiple
                    </label>
                    <Select
                      value={variable.sourceKind ?? "none"}
                      onValueChange={(value: "none" | "options" | "sql") =>
                        setVariables((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, sourceKind: value }
                              : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-48 cursor-pointer">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No source</SelectItem>
                        <SelectItem value="options">Static options</SelectItem>
                        <SelectItem value="sql">SQL options</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setVariables((prev) =>
                          prev.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>

                  {variable.sourceKind === "options" ? (
                    <textarea
                      value={variable.optionsText ?? ""}
                      onChange={(event) =>
                        setVariables((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, optionsText: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder={`One option per line\nSuccess=SUCCESS\nFailed=FAILED`}
                      className="min-h-32 w-full rounded border px-3 py-2 font-mono text-sm"
                    />
                  ) : null}

                  {variable.sourceKind === "sql" ? (
                    <div className="space-y-3">
                      <textarea
                        value={variable.source?.sql ?? ""}
                        onChange={(event) =>
                          setVariables((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    source: {
                                      ...item.source,
                                      kind: "sql",
                                      sql: event.target.value,
                                      value_field:
                                        item.source?.value_field || "value",
                                      label_field:
                                        item.source?.label_field || "label",
                                    },
                                  }
                                : item,
                            ),
                          )
                        }
                        placeholder="SELECT id AS value, name AS label FROM merchants ORDER BY name"
                        className="min-h-32 w-full rounded border px-3 py-2 font-mono text-sm"
                      />
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          type="text"
                          value={variable.source?.value_field ?? "value"}
                          onChange={(event) =>
                            setVariables((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      source: {
                                        ...item.source,
                                        kind: "sql",
                                        sql: item.source?.sql ?? "",
                                        value_field: event.target.value,
                                        label_field:
                                          item.source?.label_field || "label",
                                      },
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Value field"
                          className="w-full rounded border px-3 py-2"
                        />
                        <input
                          type="text"
                          value={variable.source?.label_field ?? "label"}
                          onChange={(event) =>
                            setVariables((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      source: {
                                        ...item.source,
                                        kind: "sql",
                                        sql: item.source?.sql ?? "",
                                        value_field:
                                          item.source?.value_field || "value",
                                        label_field: event.target.value,
                                      },
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Label field"
                          className="w-full rounded border px-3 py-2"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No runtime variables defined yet.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() =>
                setVariables((prev) => [
                  ...prev,
                  createEmptyVariableDraft(queryType === "sql"),
                ])
              }
              className="cursor-pointer"
            >
              Add Variable
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setVariables((prev) => {
                  const existingIndex = prev.findIndex(
                    (variable) => variable.key.trim() === "statuses",
                  );
                  const preset = createStatusesPresetVariableDraft(
                    queryType === "sql",
                  );

                  if (existingIndex >= 0) {
                    return prev.map((variable, index) =>
                      index === existingIndex
                        ? { ...preset, draftId: variable.draftId }
                        : variable,
                    );
                  }

                  return [...prev, preset];
                })
              }
              className="cursor-pointer"
            >
              Add `statuses` Preset
            </Button>
          </div>
        </CardContent>
      </Card>

      {normalizedVariables.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Test Variables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Provide runtime values for variable-based filters before running a
              test query.
            </p>

            <div className="space-y-4">
              {normalizedVariables.map((variable) => (
                <div key={variable.key} className="rounded-lg border p-4">
                  {(() => {
                    const variableOptions = getTestVariableOptions(variable);
                    return (
                      <>
                        <div className="mb-2">
                          <p className="text-sm font-medium">
                            {variable.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {variable.key}
                            {variable.required ? " • Required" : ""}
                            {variable.multiple ? " • Multiple" : ""}
                          </p>
                        </div>

                        {variableOptions.length ? (
                          variable.multiple ? (
                            <div className="space-y-2 rounded-md border p-3">
                              {variableOptions.map((option) => {
                                const optionValue =
                                  stringifyVariableOptionValue(option.value);
                                const selectedValues = Array.isArray(
                                  testVariablesPayload[variable.key],
                                )
                                  ? (
                                      testVariablesPayload[
                                        variable.key
                                      ] as Array<
                                        string | number | boolean | null
                                      >
                                    ).map((value) =>
                                      stringifyVariableOptionValue(value),
                                    )
                                  : [];
                                const checked =
                                  selectedValues.includes(optionValue);

                                return (
                                  <label
                                    key={`${variable.key}-${option.label}-${option.value}`}
                                    className="flex items-center gap-3 text-sm"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(
                                        nextChecked: boolean | "indeterminate",
                                      ) => {
                                        const nextValues = nextChecked
                                          ? [...selectedValues, optionValue]
                                          : selectedValues.filter(
                                              (value) => value !== optionValue,
                                            );

                                        setTestVariableInputs((prev) => ({
                                          ...prev,
                                          [variable.key]: nextValues.join(", "),
                                        }));
                                      }}
                                    />
                                    <span>{option.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <Select
                              value={
                                testVariableInputs[variable.key]?.trim() ||
                                EMPTY_TEST_VARIABLE_VALUE
                              }
                              onValueChange={(value) =>
                                setTestVariableInputs((prev) => ({
                                  ...prev,
                                  [variable.key]:
                                    value === EMPTY_TEST_VARIABLE_VALUE
                                      ? ""
                                      : value,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select value" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_TEST_VARIABLE_VALUE}>
                                  None
                                </SelectItem>
                                {variableOptions.map((option) => (
                                  <SelectItem
                                    key={`${variable.key}-${option.label}-${option.value}`}
                                    value={stringifyVariableOptionValue(
                                      option.value,
                                    )}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        ) : variable.type === "date" ||
                          variable.type === "datetime" ? (
                          <VariableDatePicker
                            definition={variable}
                            value={testVariablesPayload[variable.key]}
                            onChange={(nextValue) =>
                              setTestVariableInputs((prev) => ({
                                ...prev,
                                [variable.key]: String(nextValue ?? ""),
                              }))
                            }
                            className="w-full justify-start"
                          />
                        ) : (
                          <input
                            type="text"
                            value={testVariableInputs[variable.key] ?? ""}
                            onChange={(event) =>
                              setTestVariableInputs((prev) => ({
                                ...prev,
                                [variable.key]: event.target.value,
                              }))
                            }
                            placeholder={
                              variable.multiple
                                ? "Comma-separated values"
                                : "Enter variable value"
                            }
                            className="w-full rounded border px-3 py-2"
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
                    <SelectValue placeholder="Select date/datetime field" />
                  </SelectTrigger>
                  <SelectContent>
                    {renderGroupedSelectItems(dateColumns)}
                  </SelectContent>
                </Select>

                <Select
                  value={groupByDateType}
                  onValueChange={(value) =>
                    setGroupByDateType(value as DateGroupType)
                  }
                >
                  <SelectTrigger className="w-48 cursor-pointer hover:border-primary/40 transition">
                    <SelectValue placeholder="Date group type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_GROUP_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!groupByDateField) return;

                    const expression = getDateGroupExpression(
                      groupByDateField,
                      groupByDateType,
                    );
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
                      className="flex flex-col gap-3 border rounded p-3 transition hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex flex-row items-center gap-3">
                        <p className="text-sm font-medium">{item}</p>
                        <input
                          type="text"
                          value={getGroupByAlias(item)}
                          onChange={(event) =>
                            updateGroupByAlias(item, event.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Alias (optional)"
                          className="w-full rounded border px-3 py-2 text-sm"
                        />
                      </div>

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
                  getValueSources={() => ["value", "field"]}
                  context={queryBuilderValueEditorContext}
                  controlElements={{
                    fieldSelector: GroupedFieldSelector,
                    operatorSelector: ThemedOperatorSelector,
                    valueEditor: VariableAwareValueEditor,
                    valueSourceSelector: VariableValueSourceSelector,
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
                    getValueSources={() => ["value", "field"]}
                    context={queryBuilderValueEditorContext}
                    controlElements={{
                      fieldSelector: GroupedFieldSelector,
                      operatorSelector: ThemedOperatorSelector,
                      valueEditor: VariableAwareValueEditor,
                      valueSourceSelector: VariableValueSourceSelector,
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
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Raw SQL</CardTitle>
            <Button
              type="button"
              variant="outline"
              onClick={handleFormatSql}
              className="cursor-pointer"
            >
              Format
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM your_table LIMIT 100;"
              className="min-h-80 w-full rounded-md border px-3 py-2 font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Testing uses `POST /query/test/sql` with either a plain `sql`
              payload or <code>{`{ config, variables }`}</code> when runtime
              variables are defined. Saving uses `query_type = sql` with
              `config.sql`.
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
          {isSuperAdmin ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Department</p>
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
              >
                <SelectTrigger className="w-full cursor-pointer hover:border-primary/40 transition">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.slug}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Rows per page
                </span>
                <Select
                  value={resultsPageSize}
                  onValueChange={setResultsPageSize}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={exportResultsToCsv}
                className="cursor-pointer"
              >
                Export to CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              data={results}
              formatValue={formatResultValue}
              pageSize={Number(resultsPageSize)}
              paginationThreshold={50}
              classes={{
                row: "hover:bg-muted/40 transition",
                paginationContainer:
                  "mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
                paginationText: "text-sm text-muted-foreground",
              }}
              onResolvedModelChange={setResolvedResultsTable}
            />
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
