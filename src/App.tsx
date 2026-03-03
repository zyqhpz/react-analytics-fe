import { useEffect, useMemo, useState } from "react";
import { QueryBuilder, type RuleGroupType } from "react-querybuilder";

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

  const addJoin = (joinTable: string) => {
    setJoins((prev) => {
      if (prev.some((j) => j.table === joinTable)) return prev;
      return [...prev, { table: joinTable }];
    });
  };

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

  if (!schema || !tableSchema) return <div>Loading schema...</div>;

  console.log("Joins:", joins);
  console.log("Schema tables:", schema?.tables);

  return (
    <div style={{ maxWidth: 1200, margin: "40px auto" }}>
      <h1>Advanced Report Builder</h1>

      {/* TABLE SELECT */}
      <div>
        <label>Table: </label>
        <select
          value={table}
          onChange={(e) => {
            setTable(e.target.value);
            setJoins([]); // reset joins when table changes
            setSelectedColumns([]); // reset selected columns
            setAggregations([]); // reset aggregation
            setGroupBy([]); // reset group by
            setOrderBy([]); // reset order by
            setQuery({ combinator: "and", rules: [] }); // reset where
            setHaving({ combinator: "and", rules: [] }); // reset having
          }}
        >
          {Object.keys(schema.tables).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* JOINS */}
      {tableSchema.relations && (
        <>
          <h3>Join Tables</h3>
          {Object.keys(tableSchema.relations).map((jt) => (
            <button key={jt} onClick={() => addJoin(jt)}>
              Join {jt}
            </button>
          ))}
        </>
      )}

      {/* SELECT */}
      <h3>Select Columns</h3>
      {getAllColumns().map((col) => (
        <label key={col.name} style={{ marginRight: 12 }}>
          <input
            type="checkbox"
            checked={selectedColumns.includes(col.name)}
            onChange={() => toggleColumn(col.name)}
          />
          {col.label}
        </label>
      ))}

      {/* AGGREGATION */}
      <h3>Aggregations</h3>

      <select id="aggFunc">
        <option value="">Select Function</option>
        <option value="SUM">SUM</option>
        <option value="COUNT">COUNT</option>
        <option value="AVG">AVG</option>
        <option value="MIN">MIN</option>
        <option value="MAX">MAX</option>
      </select>

      <select id="aggField">
        <option value="">Select Field</option>
        {getAllColumns()
          .filter((col) => {
            const [tbl, colName] = col.name.includes(".")
              ? col.name.split(".")
              : [table, col.name];

            const colSchema = schema?.tables[tbl]?.columns[colName];
            return colSchema?.aggregatable;
          })
          .map((col) => (
            <option key={col.name} value={col.name}>
              {col.label}
            </option>
          ))}
      </select>

      <button
        onClick={() => {
          const func = (document.getElementById("aggFunc") as HTMLSelectElement)
            .value;
          const field = (
            document.getElementById("aggField") as HTMLSelectElement
          ).value;
          if (!func || !field) return;

          setAggregations((prev) => [...prev, { func, field }]);
        }}
      >
        Add Aggregation
      </button>

      {/* Show Selected Aggregations */}
      {aggregations.map((agg, index) => {
        const alias = `${agg.func.toLowerCase()}_${agg.field}`;
        return (
          <div key={index}>
            {agg.func}({agg.field}) AS {alias}
            <button
              onClick={() =>
                setAggregations((prev) => prev.filter((_, i) => i !== index))
              }
            >
              Remove
            </button>
          </div>
        );
      })}

      {/* GROUP BY */}
      <h3>Group By</h3>
      {getAllColumns().map((col) => (
        <label key={col.name} style={{ marginRight: 12 }}>
          <input
            type="checkbox"
            checked={groupBy.includes(col.name)}
            onChange={() => toggleGroupBy(col.name)}
          />
          {col.label}
        </label>
      ))}

      {/* WHERE FILTERS */}
      <h3>Filters</h3>
      <QueryBuilder fields={fields} query={query} onQueryChange={setQuery} />

      {/* HAVING */}
      {aggregationAliases.length > 0 && (
        <>
          <h3>Having</h3>
          <QueryBuilder
            fields={havingFields}
            query={having}
            onQueryChange={setHaving}
          />
        </>
      )}

      {/* ORDER BY */}
      <h3>Order By</h3>
      <select
        onChange={(e) => {
          if (!e.target.value) return;
          addOrder(e.target.value);
        }}
      >
        <option value="">Select Field</option>

        {selectedColumns.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}

        {aggregationAliases.map((alias) => (
          <option key={alias} value={alias}>
            {alias}
          </option>
        ))}
      </select>

      {orderBy.map((o, idx) => (
        <div key={idx}>
          {o.field}
          <select
            value={o.direction}
            onChange={(e) => {
              const updated = [...orderBy];
              updated[idx].direction = e.target.value;
              setOrderBy(updated);
            }}
          >
            <option value="ASC">ASC</option>
            <option value="DESC">DESC</option>
          </select>
        </div>
      ))}

      <br />
      <button onClick={runQuery}>Run Query</button>

      {/* RESULTS */}
      {results.length > 0 && (
        <table border={1} cellPadding={6} style={{ marginTop: 30 }}>
          <thead>
            <tr>
              {Object.keys(results[0]).map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((v, j) => (
                  <td key={j}>{String(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
