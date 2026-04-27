import type { DashboardWidgetConfig } from "@/types/dashboard";
import type {
  Query,
  QueryVariableDefinition,
  QueryVariableMap,
  QueryVariableOption,
  QueryVariablePrimitive,
  QueryVariableValue,
} from "@/types/query";

export const EMPTY_VARIABLES: QueryVariableMap = {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePrimitive = (value: unknown): QueryVariablePrimitive => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return value == null ? null : String(value);
};

const normalizeValue = (value: unknown): QueryVariableValue => {
  if (Array.isArray(value)) {
    return value.map(normalizePrimitive);
  }

  return normalizePrimitive(value);
};

const parseJsonValue = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const normalizeVariableMap = (value: unknown): QueryVariableMap => {
  if (typeof value === "string") {
    return normalizeVariableMap(parseJsonValue(value));
  }

  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<QueryVariableMap>((acc, [key, item]) => {
    if (!key.trim()) {
      return acc;
    }

    acc[key] = normalizeValue(item);
    return acc;
  }, {});
};

const normalizeVariableOptions = (
  value: unknown,
): QueryVariableOption[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const options = value
    .map((option) => {
      if (isRecord(option)) {
        const rawValue = "value" in option ? option.value : option.label;
        const value = normalizePrimitive(rawValue);
        const labelSource =
          typeof option.label === "string" && option.label.trim()
            ? option.label
            : value;

        return {
          label: String(labelSource ?? ""),
          value,
        };
      }

      const primitive = normalizePrimitive(option);
      return {
        label: String(primitive ?? ""),
        value: primitive,
      };
    })
    .filter((option) => option.label.trim());

  return options.length ? options : undefined;
};

const normalizeVariableDefinition = (
  value: unknown,
  fallbackKey?: string,
): QueryVariableDefinition | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rawKey = typeof value.key === "string" ? value.key : fallbackKey;
  const key = rawKey?.trim();

  if (!key) {
    return null;
  }

  const rawType = typeof value.type === "string" ? value.type : "string";
  const rawLabel = typeof value.label === "string" ? value.label : key;
  const source = isRecord(value.source)
    ? {
        kind:
          typeof value.source.kind === "string" ? value.source.kind : "none",
        ...(typeof value.source.sql === "string"
          ? { sql: value.source.sql }
          : {}),
        ...(typeof value.source.value_field === "string"
          ? { value_field: value.source.value_field }
          : {}),
        ...(typeof value.source.label_field === "string"
          ? { label_field: value.source.label_field }
          : {}),
      }
    : undefined;

  return {
    key,
    label: rawLabel.trim() || key,
    type: rawType.trim() || "string",
    required: Boolean(value.required),
    multiple: Boolean(value.multiple),
    options: normalizeVariableOptions(value.options),
    ...(source ? { source } : {}),
  };
};

export const normalizeQueryVariableDefinitions = (
  value: unknown,
): QueryVariableDefinition[] => {
  if (typeof value === "string") {
    return normalizeQueryVariableDefinitions(parseJsonValue(value));
  }

  if (Array.isArray(value)) {
    return value
      .map((definition) => normalizeVariableDefinition(definition))
      .filter(
        (definition): definition is QueryVariableDefinition =>
          definition !== null,
      );
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, definition]) => normalizeVariableDefinition(definition, key))
      .filter(
        (definition): definition is QueryVariableDefinition =>
          definition !== null,
      );
  }

  return [];
};

export const normalizeWidgetConfig = (
  value: unknown,
): DashboardWidgetConfig => {
  if (!isRecord(value)) {
    return {};
  }

  const variableMapping = isRecord(value.variable_mapping)
    ? Object.entries(value.variable_mapping).reduce<Record<string, string>>(
        (acc, [key, item]) => {
          if (!key.trim() || typeof item !== "string" || !item.trim()) {
            return acc;
          }

          acc[key] = item.trim();
          return acc;
        },
        {},
      )
    : {};
  const rawTablePageSize = value.table_page_size;
  const normalizedTablePageSize =
    typeof rawTablePageSize === "number" &&
    Number.isFinite(rawTablePageSize) &&
    rawTablePageSize > 0
      ? Math.floor(rawTablePageSize)
      : undefined;

  return {
    table_page_size: normalizedTablePageSize,
    variables: normalizeVariableMap(value.variables),
    variable_mapping: variableMapping,
  };
};

export const getQueryVariableDefinitions = (
  query?: Query | null,
): QueryVariableDefinition[] => {
  const variableDefinitions = normalizeQueryVariableDefinitions(
    query?.variable_definitions,
  );

  if (variableDefinitions.length) {
    return variableDefinitions;
  }

  return normalizeQueryVariableDefinitions(query?.variables);
};

export const mergeVariableOptions = (
  ...collections: Array<QueryVariableOption[] | undefined>
): QueryVariableOption[] => {
  const seen = new Set<string>();
  const merged: QueryVariableOption[] = [];

  collections.forEach((collection) => {
    collection?.forEach((option) => {
      const key = `${String(option.value)}::${option.label}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      merged.push(option);
    });
  });

  return merged;
};

export const resolveWidgetVariables = (
  dashboardVariables: QueryVariableMap,
  config?: DashboardWidgetConfig,
): QueryVariableMap => {
  const resolved: QueryVariableMap = {};
  const mapping = config?.variable_mapping ?? {};

  Object.entries(dashboardVariables).forEach(([dashboardKey, value]) => {
    const targetKey = mapping[dashboardKey] || dashboardKey;
    resolved[targetKey] = value;
  });

  Object.entries(config?.variables ?? {}).forEach(([queryKey, value]) => {
    resolved[queryKey] = value;
  });

  return resolved;
};

export const filterVariablesForDefinitions = (
  variables: QueryVariableMap,
  definitions: Pick<QueryVariableDefinition, "key">[] = [],
): QueryVariableMap => {
  if (!definitions.length) {
    return {};
  }

  const allowedKeys = new Set(definitions.map((definition) => definition.key));

  return Object.entries(variables).reduce<QueryVariableMap>(
    (acc, [key, value]) => {
      if (allowedKeys.has(key)) {
        acc[key] = value;
      }

      return acc;
    },
    {},
  );
};

export const formatVariableValueForText = (
  value: QueryVariableValue | undefined,
): string => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "")).join(", ");
  }

  return value == null ? "" : String(value);
};

export const parseVariableValueFromText = (
  rawValue: string,
  definition?: Pick<
    QueryVariableDefinition,
    "key" | "label" | "type" | "multiple"
  >,
): QueryVariableValue => {
  const trimmed = rawValue.trim();

  if (definition?.multiple) {
    return trimmed
      ? trimmed
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => coercePrimitiveValue(item, definition))
      : [];
  }

  return coercePrimitiveValue(trimmed, definition);
};

export const coercePrimitiveValue = (
  rawValue: string,
  definition?: Pick<QueryVariableDefinition, "type">,
): QueryVariablePrimitive => {
  if (!rawValue) {
    return null;
  }

  switch (definition?.type) {
    case "number": {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? parsed : rawValue;
    }
    case "boolean":
      if (rawValue === "true") return true;
      if (rawValue === "false") return false;
      return rawValue;
    default:
      return rawValue;
  }
};

export const stringifyVariableOptionValue = (
  value: QueryVariablePrimitive,
): string => (value == null ? "" : String(value));

const VARIABLE_OPTION_SELECT_VALUE_PREFIX = "__variable_option__";

export type VariableSelectOption = QueryVariableOption & {
  selectValue: string;
};

export const toVariableSelectOptions = (
  options: QueryVariableOption[] = [],
): VariableSelectOption[] =>
  options.map((option, index) => ({
    ...option,
    selectValue: `${VARIABLE_OPTION_SELECT_VALUE_PREFIX}${index}`,
  }));

export const getVariableSelectValue = (
  options: VariableSelectOption[],
  value: QueryVariablePrimitive,
): string | undefined => {
  const stringValue = stringifyVariableOptionValue(value);
  return options.find(
    (option) => stringifyVariableOptionValue(option.value) === stringValue,
  )?.selectValue;
};

export const getVariableOptionFromSelectValue = (
  options: VariableSelectOption[],
  value: string,
): QueryVariableOption | undefined =>
  options.find((option) => option.selectValue === value);

export const isDateVariableType = (
  definition?: Pick<QueryVariableDefinition, "type" | "multiple">,
) => !definition?.multiple && definition?.type === "date";

export const isDateTimeVariableType = (
  definition?: Pick<QueryVariableDefinition, "type" | "multiple">,
) => !definition?.multiple && definition?.type === "datetime";

export const getVariablePickerInputType = (
  definition?: Pick<QueryVariableDefinition, "type" | "multiple">,
) => {
  if (isDateVariableType(definition)) {
    return "date";
  }

  if (isDateTimeVariableType(definition)) {
    return "datetime-local";
  }

  return null;
};

export const formatVariableValueForPicker = (
  value: QueryVariableValue | undefined,
  definition?: Pick<QueryVariableDefinition, "type" | "multiple">,
) => {
  if (Array.isArray(value)) {
    return "";
  }

  const stringValue = value == null ? "" : String(value);

  if (isDateVariableType(definition)) {
    const match = stringValue.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? "";
  }

  if (isDateTimeVariableType(definition)) {
    const normalized = stringValue.replace("T", " ");
    const match = normalized.match(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::\d{2})?$/,
    );

    return match ? `${match[1]}T${match[2]}:${match[3]}` : "";
  }

  return stringValue;
};

export const parseVariableValueFromPicker = (
  rawValue: string,
  definition?: Pick<
    QueryVariableDefinition,
    "key" | "label" | "type" | "multiple"
  >,
): QueryVariableValue => {
  if (!rawValue) {
    return null;
  }

  if (isDateVariableType(definition)) {
    return rawValue;
  }

  if (isDateTimeVariableType(definition)) {
    const normalized = rawValue.replace("T", " ");
    return normalized.length === 16 ? `${normalized}:00` : normalized;
  }

  return parseVariableValueFromText(rawValue, definition);
};
