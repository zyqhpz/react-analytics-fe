import { getAuthHeaders } from "@/api/client";
import { deleteSavedQuery, fetchSavedQueries } from "@/api/queries";
import { CurrentUserBadge } from "@/components/CurrentUserBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { type Query, type QueryType } from "@/types/query";
import { useEffect, useState, type MouseEvent } from "react";
import { FaCheckCircle } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";
import { QueryBuilder, type RuleGroupType } from "react-querybuilder";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

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
    VisualQueryRequest,
} from "@/types/query";

export default function App() {
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
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
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
    const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
    const [queryType, setQueryType] = useState<QueryType>("visual");
    const [sqlQuery, setSqlQuery] = useState("");

    const [queryName, setQueryName] = useState("");
    const [queryDescription, setQueryDescription] = useState("");
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [testSuccess, setTestSuccess] = useState(false);

    const navigate = useNavigate();

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
        return getAllColumnsWithMeta().map(({ name, label }) => ({ name, label }));
    };

    // 🔥 Fetch schema from backend
    useEffect(() => {
        fetch("http://localhost:8080/api/v1/query/schemas", {
            headers: getAuthHeaders(),
        })
            .then((res) => res.json())
            .then((data) => {
                // map response to GetSchemasResponse type
                const typedData: GetSchemasResponse = {
                    responseCode: data.responseCode,
                    description: data.description,
                    data: data.data,
                    token: data.token,
                };

                setSchema(typedData.data);
                const firstTable = Object.keys(typedData.data.tables)[0];
                setTable(firstTable);
            });
    }, []);

    useEffect(() => {
        setSelectedColumns((prev) =>
            prev.filter(
                (col) =>
                    !col.includes(".") ||
                    joins.some((j) => col.startsWith(j.table + ".")),
            ),
        );
    }, [joins]);

    const refreshSavedQueries = async () => {
        try {
            const queries = await fetchSavedQueries();
            setSavedQueries(queries);
            return queries;
        } catch (err) {
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
            resetVisualBuilderState();
            setSqlQuery(getSqlFromQuery(query));
        } else {
            const config = parseVisualConfig(query.visual_config);

            if (config) {
                setTable(config.table || "");
                setJoins(config.joins || []);
                setSelectedColumns(config.select || []);
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
            }

            setSqlQuery("");
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
    };

    const closeDeleteModal = () => {
        if (isDeleting) return;
        setShowDeleteModal(false);
    };

    const tableSchema = schema?.tables[table];

    const fields = getAllColumns();

    const toggleColumn = (column: string) => {
        setSelectedColumns((prev) => {
            const updated = prev.includes(column)
                ? prev.filter((c) => c !== column)
                : [...prev, column];

            // 🔥 Auto-add join if selecting joined field
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
                const tbl = getFieldJoinTable(col);
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

    const effectiveSelectColumns = Array.from(
        new Set([...selectedColumns, ...groupBy]),
    );

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

    const runQuery = async () => {
        if (queryType === "visual" && !validatePivotOptions()) return;
        if (queryType === "sql" && !sqlQuery.trim()) {
            toast.error("SQL query is required before testing.");
            return;
        }

        const payload =
            queryType === "visual" ? getVisualPayload() : { sql: sqlQuery.trim() };

        console.log("Payload:", payload);

        const res = await fetch(
            `http://localhost:8080/api/v1/query/test/${queryType}`,
            {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload),
            },
        );

        const data = await res.json();

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
                        Description: {data?.error || "Unknown error"}
                    </span>
                ),
            });
            setResults([]);
        }
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

    const saveQuery = async () => {
        if (queryType === "visual" && !validatePivotOptions()) return;
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
            ? `http://localhost:8080/api/v1/query/${selectedQueryId}`
            : "http://localhost:8080/api/v1/query";

        const method = selectedQueryId ? "PUT" : "POST";

        const res = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(payload),
        });

        if (res.ok) {
            const data = await res.json();
            const savedQuery = data?.data as Query | undefined;

            if (savedQuery?.id) {
                setSelectedQueryId(savedQuery.id);
            }

            await refreshSavedQueries();
            toast.success("Query saved successfully.");
        } else {
            const data = await res.json();
            toast.error("Failed to save query.", {
                description: (
                    <span className="text-muted-foreground">
                        Status:{" "}
                        <span className="text-red-500 font-semibold">
                            {res.status} {res.statusText}
                        </span>
                        <br />
                        Description: {data?.error || "Unknown error"}
                    </span>
                ),
            });
        }
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
            })),
        ...aggregationAliases.map((alias) => ({
            name: alias,
            label: alias,
        })),
    ].filter((field) => hasSelectValue(field.name));

    const dateColumns = getAllColumnsWithMeta().filter(
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
                                <SelectTrigger className="cursor-pointer hover:border-primary/40 transition">
                                    <SelectValue placeholder="Select table" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.keys(schema.tables)
                                        .filter(hasSelectValue)
                                        .map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {t}
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
                    ${active
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
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {getAllColumns().map((col) => {
                                    const active = selectedColumns.includes(col.name);
                                    return (
                                        <div
                                            key={col.name}
                                            className={`
                    flex items-center space-x-2 rounded-lg border p-3
                    cursor-pointer transition-all
                    hover:shadow-sm hover:border-primary/40
                    ${active ? "bg-primary/5 border-primary/40" : "bg-background"}
                  `}
                                            onClick={() => toggleColumn(col.name)}
                                        >
                                            <Checkbox
                                                checked={active}
                                                onCheckedChange={() => toggleColumn(col.name)}
                                                onClick={(e: MouseEvent) => e.stopPropagation()}
                                            />
                                            <label className="text-sm truncate cursor-pointer">
                                                {col.label}
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* GROUP BY */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Group By</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                                {getAllColumns().map((col) => {
                                    const active = groupBy.includes(col.name);
                                    return (
                                        <div
                                            key={col.name}
                                            className={`
                    flex items-center space-x-2 rounded-lg border p-3
                    cursor-pointer transition-all
                    hover:shadow-sm hover:border-primary/40
                    ${active
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

                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <Select
                                    value={groupByDateField}
                                    onValueChange={setGroupByDateField}
                                >
                                    <SelectTrigger className="w-72 cursor-pointer hover:border-primary/40 transition">
                                        <SelectValue placeholder="Datetime field for DATE(...)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {dateColumns.map((col) => (
                                            <SelectItem key={col.name} value={col.name}>
                                                {col.label}
                                            </SelectItem>
                                        ))}
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

                                <select
                                    value={aggregationField}
                                    onChange={(e) => setAggregationField(e.target.value)}
                                    className="border rounded px-3 py-2 cursor-pointer hover:border-primary/40 transition"
                                >
                                    <option value="">Field</option>
                                    {getAllColumns().map((col) => (
                                        <option key={col.name} value={col.name}>
                                            {col.label}
                                        </option>
                                    ))}
                                </select>

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
                                                    {getAllColumns().map((col) => (
                                                        <SelectItem key={col.name} value={col.name}>
                                                            {col.label}
                                                        </SelectItem>
                                                    ))}
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
                                                    {getAllColumns().map((col) => (
                                                        <SelectItem key={col.name} value={col.name}>
                                                            {col.label}
                                                        </SelectItem>
                                                    ))}
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
                            <div className="rounded-lg border bg-muted/30 p-4">
                                <QueryBuilder
                                    fields={fields}
                                    query={query}
                                    onQueryChange={setQuery}
                                    controlClassnames={{
                                        queryBuilder: "space-y-4",
                                        ruleGroup:
                                            "border-l-4 border-primary/40 pl-4 space-y-4 bg-muted/20 rounded-lg p-4",
                                        combinators: "border rounded-md px-2 py-1 cursor-pointer",
                                        addRule:
                                            "bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 cursor-pointer transition",
                                        addGroup:
                                            "bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md px-3 py-1 cursor-pointer transition",
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
                                <div className="rounded-lg border bg-muted/30 p-4">
                                    <QueryBuilder
                                        fields={havingFields}
                                        query={having}
                                        onQueryChange={setHaving}
                                        controlClassnames={{
                                            queryBuilder: "space-y-4",
                                            ruleGroup:
                                                "border-l-4 border-primary/40 pl-4 space-y-4 bg-muted/20 rounded-lg p-4",
                                            combinators: "border rounded-md px-2 py-1 cursor-pointer",
                                            addRule:
                                                "bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 cursor-pointer transition",
                                            addGroup:
                                                "bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md px-3 py-1 cursor-pointer transition",
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
                                        {orderFields.map((col) => (
                                            <SelectItem key={col.name} value={col.name}>
                                                {col.label}
                                            </SelectItem>
                                        ))}
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
                        <textarea
                            value={sqlQuery}
                            onChange={(e) => setSqlQuery(e.target.value)}
                            placeholder="SELECT * FROM your_table LIMIT 100;"
                            className="min-h-[320px] w-full rounded-md border px-3 py-2 font-mono text-sm"
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
                    className="cursor-pointer hover:scale-105 active:scale-95 transition"
                >
                    {queryType === "visual" ? "Run Visual Query" : "Run SQL"}
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
                        onClick={saveQuery}
                        disabled={!testSuccess}
                        className="cursor-pointer hover:scale-105 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {selectedQueryId ? "Update Query" : "Save Query"}
                    </Button>
                </CardContent>
            </Card>

            {/* RESULTS */}
            {results.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Results</CardTitle>
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
                                            <TableCell key={j}>{String(v)}</TableCell>
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
        </div>
    );
}
