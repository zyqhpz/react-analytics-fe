import { getAuthHeaders } from "@/api/client";
import { fetchSavedQueries } from "@/api/queries";
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
import { type Query } from "@/types/query";
import { useEffect, useMemo, useState } from "react";
import { FaCheckCircle } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";
import { QueryBuilder, type RuleGroupType } from "react-querybuilder";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import type { GetSchemasResponse } from "@/api/queries";
import type { Aggregation, FullSchema, Join, OrderBy } from "@/types/query";

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
    const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
    const [results, setResults] = useState<any[]>([]);

    const [savedQueries, setSavedQueries] = useState<Query[]>([]);
    const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);

    const [queryName, setQueryName] = useState("");
    const [queryDescription, setQueryDescription] = useState("");

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

    const getAllColumnsWithMeta = () => {
        if (!schema || !tableSchema) return [];

        const seen = new Set<string>();
        const columns: { name: string; label: string; type?: string }[] = [];

        Object.entries(tableSchema.columns).forEach(([name, columnSchema]) => {
            if (!seen.has(name)) {
                seen.add(name);
                columns.push({
                    name,
                    label: name,
                    type: columnSchema.type,
                });
            }
        });

        joins.forEach((join) => {
            const joinSchema = schema.tables[join.table];
            if (!joinSchema) return;

            Object.entries(joinSchema.columns).forEach(([name, columnSchema]) => {
                const qualified = `${join.table}.${name}`;

                if (!seen.has(qualified)) {
                    seen.add(qualified);
                    columns.push({
                        name: qualified,
                        label: qualified,
                        type: columnSchema.type,
                    });
                }
            });
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

    // FETCH SAVED QUERIES
    useEffect(() => {
        (async () => {
            try {
                const queries = await fetchSavedQueries();
                setSavedQueries(queries);
            } catch (err) {
                console.error("Failed to fetch saved queries:", err);
            }
        })();
    }, []);

    // LOAD QUERY INTO BUILDER
    const loadQuery = (query: Query) => {
        // const config = JSON.parse(query.visual_config);
        const config =
            typeof query.visual_config === "string"
                ? JSON.parse(query.visual_config)
                : query.visual_config;

        setTable(config.table || "");
        setJoins(config.joins || []);
        setSelectedColumns(config.select || []);
        setAggregations(config.aggregations || []);
        setGroupBy(config.group_by || []);
        setGroupByDateField("");
        setOrderBy(config.order_by || []);
        setQuery(config.where || { combinator: "and", rules: [] });
        setHaving(config.having || { combinator: "and", rules: [] });
        setQueryName(query.name || "");
        setQueryDescription(query.description || "");

        setResults([]);
        setTestSuccess(false);
    };

    // DESELECT QUERY
    const deselectQuery = () => {
        setSelectedQueryId(null);
        setQueryName("");
        setQueryDescription("");
        setGroupByDateField("");
    };

    const tableSchema = schema?.tables[table];

    const fields = useMemo(() => {
        return getAllColumns();
    }, [schema, table, joins]);

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
        setSelectedColumns((prev) =>
            prev.filter((col) => {
                const tbl = getJoinTableFromField(col);
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
    }, [joins]);

    const aggregationAliases = aggregations.map(
        (agg) => `${agg.func.toLowerCase()}_${agg.field}`,
    );

    const effectiveSelectColumns = Array.from(
        new Set([...selectedColumns, ...groupBy]),
    );

    const havingFields = aggregationAliases.map((alias) => ({
        name: alias,
        label: alias,
    }));

    const runQuery = async () => {
        const payload = {
            table,
            joins,
            select: effectiveSelectColumns,
            aggregations,
            group_by: groupBy,
            where: query,
            having,
            order_by: orderBy,
        };

        console.log("Payload:", payload);

        const res = await fetch("http://localhost:8080/api/v1/query/test", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload),
        });

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
        table,
        joins,
        selectedColumns,
        aggregations,
        groupBy,
        query,
        having,
        orderBy,
    ]);

    const saveQuery = async () => {
        const config = {
            table,
            joins,
            select: effectiveSelectColumns,
            aggregations,
            group_by: groupBy,
            where: query,
            having,
            order_by: orderBy,
        };

        const payload = {
            name: queryName,
            description: queryDescription,
            query_type: "visual",
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
    ];

    const dateColumns = getAllColumnsWithMeta().filter((col) =>
        isDateLikeColumn(col.type, col.name),
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
            <Button
                variant="outline"
                className="flex items-center gap-2 cursor-pointer hover:bg-muted transition"
                onClick={() => navigate("/dashboard")}
            >
                <IoArrowBack /> Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold">Advanced Report Builder</h1>

            {/* SAVED QUERY SELECT */}
            <Card>
                <CardHeader>
                    <CardTitle>Load Saved Query</CardTitle>
                </CardHeader>

                <CardContent className="flex gap-3">
                    <Select
                        value={selectedQueryId || ""}
                        onValueChange={(value) => {
                            setSelectedQueryId(value);
                            const selected = savedQueries.find((q) => q.id === value);
                            if (selected) loadQuery(selected);
                        }}
                    >
                        <SelectTrigger className="cursor-pointer hover:border-primary/40 transition w-80">
                            <SelectValue placeholder="Select saved query" />
                        </SelectTrigger>

                        <SelectContent>
                            {savedQueries.map((q) => (
                                <SelectItem key={q.id} value={q.id}>
                                    {q.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {selectedQueryId && (
                        <Button
                            variant="outline"
                            onClick={deselectQuery}
                            className="cursor-pointer"
                        >
                            Deselect
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* TABLE SELECT */}
            <Card>
                <CardHeader>
                    <CardTitle>Select Table</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select
                        value={table}
                        onValueChange={(value) => {
                            setTable(value);
                            setJoins([]);
                            setSelectedColumns([]);
                            setAggregations([]);
                            setGroupBy([]);
                            setGroupByDateField("");
                            setOrderBy([]);
                            setQuery({ combinator: "and", rules: [] });
                            setHaving({ combinator: "and", rules: [] });
                        }}
                    >
                        <SelectTrigger className="cursor-pointer hover:border-primary/40 transition">
                            <SelectValue placeholder="Select table" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(schema.tables).map((t) => (
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
                                        onClick={(e) => e.stopPropagation()}
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
                                        onClick={(e) => e.stopPropagation()}
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
                                    key={`${item}-${index}`}
                                    className="flex items-center justify-between border rounded p-3 transition hover:bg-muted/40"
                                >
                                    <span>{item}</span>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() =>
                                            setGroupBy((prev) => prev.filter((_, i) => i !== index))
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
                            id="aggFunc"
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
                            id="aggField"
                            className="border rounded px-3 py-2 cursor-pointer hover:border-primary/40 transition"
                        >
                            <option value="">Field</option>
                            {getAllColumns().map((col) => (
                                <option key={col.name} value={col.name}>
                                    {col.label}
                                </option>
                            ))}
                        </select>

                        <Button
                            onClick={() => {
                                const func = (
                                    document.getElementById("aggFunc") as HTMLSelectElement
                                ).value;
                                const field = (
                                    document.getElementById("aggField") as HTMLSelectElement
                                ).value;
                                if (!func || !field) return;
                                setAggregations((prev) => [...prev, { func, field }]);
                            }}
                        >
                            Add
                        </Button>
                    </div>

                    {aggregations.map((agg, index) => {
                        const alias = `${agg.func.toLowerCase()}_${agg.field}`;
                        return (
                            <div
                                key={index}
                                className="flex items-center justify-between border rounded p-3 transition hover:bg-muted/40"
                            >
                                <span>
                                    {agg.func}({agg.field}) AS {alias}
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
                                removeRule: "text-destructive hover:underline cursor-pointer",
                                removeGroup: "text-destructive hover:underline cursor-pointer",
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
                                    removeRule: "text-destructive hover:underline cursor-pointer",
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
                            onValueChange={(value) => {
                                if (!value) return;

                                setOrderBy((prev) => {
                                    if (prev.some((o) => o.field === value)) return prev;
                                    return [...prev, { field: value, direction: "ASC" }];
                                });

                                if (value.includes(".")) {
                                    const [joinTable] = value.split(".");
                                    setJoins((prev) => {
                                        if (prev.some((j) => j.table === joinTable)) return prev;
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
                                    onValueChange={(dir) => {
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

            {/* RUN QUERY */}
            <div className="flex items-center gap-3">
                <Button
                    size="lg"
                    onClick={runQuery}
                    className="cursor-pointer hover:scale-105 active:scale-95 transition"
                >
                    Run Query
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
        </div>
    );
}
