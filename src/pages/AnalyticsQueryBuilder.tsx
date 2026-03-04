import { useEffect, useMemo, useState } from "react";
import { IoArrowBack } from "react-icons/io5";
import { QueryBuilder, type RuleGroupType } from "react-querybuilder";

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
import { useNavigate } from "react-router-dom";

type Aggregation = {
    func: string;
    field: string;
};

type OrderBy = {
    field: string;
    direction: string;
};

type Join = {
    table: string;
};

type ColumnSchema = {
    type: string;
    selectable?: boolean;
    filterable?: boolean;
    groupable?: boolean;
    aggregatable?: boolean;
    values?: string[];
};

type TableSchema = {
    columns: Record<string, ColumnSchema>;
    relations?: Record<string, any>;
};

type FullSchema = {
    tables: Record<string, TableSchema>;
};

type GetSchemasResponse = {
    responseCode: number;
    description: string;
    data: FullSchema;
    token: string;
};

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
    const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
    const [results, setResults] = useState<any[]>([]);

    const navigate = useNavigate();

    const getAllColumns = () => {
        if (!schema || !tableSchema) return [];

        const seen = new Set<string>();
        const columns: { name: string; label: string }[] = [];

        // Base table columns
        Object.entries(tableSchema.columns).forEach(([name]) => {
            if (!seen.has(name)) {
                seen.add(name);
                columns.push({
                    name,
                    label: name,
                });
            }
        });

        // Joined table columns
        joins.forEach((join) => {
            const joinSchema = schema.tables[join.table];
            if (!joinSchema) return;

            Object.entries(joinSchema.columns).forEach(([name]) => {
                const qualified = `${join.table}.${name}`;

                if (!seen.has(qualified)) {
                    seen.add(qualified);
                    columns.push({
                        name: qualified,
                        label: qualified,
                    });
                }
            });
        });

        return columns;
    };

    // 🔥 Fetch schema from backend
    useEffect(() => {
        fetch("http://localhost:8080/api/v1/query/schemas")
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
            if (column.includes(".")) {
                const [joinTable] = column.split(".");

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

            if (column.includes(".")) {
                const [joinTable] = column.split(".");

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
                if (!col.includes(".")) return true;
                const [tbl] = col.split(".");
                return joins.some((j) => j.table === tbl);
            }),
        );

        setGroupBy((prev) =>
            prev.filter((col) => {
                if (!col.includes(".")) return true;
                const [tbl] = col.split(".");
                return joins.some((j) => j.table === tbl);
            }),
        );

        setOrderBy((prev) =>
            prev.filter((o) => {
                if (!o.field.includes(".")) return true;
                const [tbl] = o.field.split(".");
                return joins.some((j) => j.table === tbl);
            }),
        );
    }, [joins]);

    const addOrder = (field: string) => {
        setOrderBy([...orderBy, { field, direction: "ASC" }]);
    };
    const aggregationAliases = aggregations.map(
        (agg) => `${agg.func.toLowerCase()}_${agg.field}`,
    );

    const havingFields = aggregationAliases.map((alias) => ({
        name: alias,
        label: alias,
    }));

    const runQuery = async () => {
        const payload = {
            table,
            joins,
            select: selectedColumns,
            aggregations,
            group_by: groupBy,
            where: query,
            having,
            order_by: orderBy,
            limit: 100,
        };

        console.log("Payload:", payload);

        const res = await fetch("http://localhost:8080/api/v1/query/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json();
        setResults(data.data || []);
    };

    const orderFields = [
        ...getAllColumns(),
        ...aggregationAliases.map((alias) => ({
            name: alias,
            label: alias,
        })),
    ];

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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
            <div>
                <Button
                    size="lg"
                    onClick={runQuery}
                    className="cursor-pointer hover:scale-105 active:scale-95 transition"
                >
                    Run Query
                </Button>
            </div>

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
