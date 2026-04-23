Here’s the FE contract as it works now.

**How To Define Variables In Query Builder**

For visual/query-builder queries, you define variables in the top-level `variables` array when creating or updating the query, then reference them inside `config.where` or `config.having`.

Use this pattern in a rule:
```json
{
  "field": "account_id",
  "operator": "=",
  "valueSource": "variable",
  "value": "merchant_id"
}
```

Meaning:
- `valueSource: "variable"` says this rule should read from a runtime variable
- `value: "merchant_id"` is the variable key

For raw SQL queries, use named placeholders:
```sql
SELECT *
FROM payin
WHERE account_id = :merchant_id
  AND status IN (:statuses)
```

**Query Endpoints**

1. `GET /api/v1/query/schemas`
Use this to get the allowed tables/fields for the visual builder.

2. `POST /api/v1/query`
Create a query.

Visual query example:
```json
{
  "name": "Payin By Merchant",
  "description": "Visual query with runtime filters",
  "query_type": "visual",
  "department": "finance",
  "variables": [
    {
      "key": "merchant_id",
      "label": "Merchant",
      "type": "select",
      "required": false,
      "source": {
        "kind": "sql",
        "sql": "SELECT id AS value, name AS label FROM merchants ORDER BY name",
        "value_field": "value",
        "label_field": "label"
      }
    },
    {
      "key": "statuses",
      "label": "Status",
      "type": "select",
      "multiple": true,
      "options": [
        { "label": "Success", "value": "SUCCESS" },
        { "label": "Failed", "value": "FAILED" },
        { "label": "Pending", "value": "PENDING" }
      ]
    }
  ],
  "config": {
    "table": "payin",
    "select": [
      { "name": "account_id", "alias": "merchant_id" },
      { "name": "status" }
    ],
    "aggregations": [
      { "field": "id", "func": "COUNT", "alias": "total_count" }
    ],
    "group_by": ["account_id", "status"],
    "where": {
      "combinator": "and",
      "rules": [
        {
          "field": "account_id",
          "operator": "=",
          "valueSource": "variable",
          "value": "merchant_id"
        },
        {
          "field": "status",
          "operator": "in",
          "valueSource": "variable",
          "value": "statuses"
        }
      ]
    },
    "having": { "combinator": "and", "rules": [] },
    "order_by": [
      { "field": "account_id", "direction": "ASC" }
    ],
    "limit": 100
  }
}
```

Raw SQL query example:
```json
{
  "name": "Payin Raw SQL",
  "description": "SQL query with named variables",
  "query_type": "sql",
  "department": "finance",
  "variables": [
    {
      "key": "merchant_id",
      "label": "Merchant",
      "type": "string",
      "required": true
    },
    {
      "key": "statuses",
      "label": "Statuses",
      "type": "select",
      "multiple": true,
      "required": false
    }
  ],
  "config": {
    "sql": "SELECT account_id, status, COUNT(*) AS total_count FROM payin WHERE account_id = :merchant_id AND status IN (:statuses) GROUP BY account_id, status"
  }
}
```

3. `PUT /api/v1/query/{id}`
Same payload as create. Use this to update query definition, builder config, and variables.

4. `GET /api/v1/query/{id}/filters`
Fetch variable definitions plus option data for FE.
Use query params for runtime context.

Example:
```http
GET /api/v1/query/{id}/filters?dashboard_id=dash_1&widget_id=wid_1&merchant_id=m_001
```

Response shape:
```json
{
  "variables": [...],
  "applied_variables": {
    "merchant_id": "m_001"
  },
  "filter_data": {
    "merchant_id": [
      { "label": "Merchant A", "value": "m_001" }
    ],
    "statuses": [
      { "label": "Success", "value": "SUCCESS" }
    ]
  }
}
```

5. `POST /api/v1/query/{id}/run`
Recommended execution endpoint for FE.

Example:
```json
{
  "dashboard_id": "dash_1",
  "widget_id": "wid_1",
  "variables": {
    "merchant_id": "m_001",
    "statuses": ["SUCCESS", "FAILED"]
  }
}
```

Response shape:
```json
{
  "id": "query_1",
  "name": "Payin By Merchant",
  "query_type": "visual",
  "data": [
    {
      "merchant_id": "m_001",
      "status": "SUCCESS",
      "total_count": 120
    }
  ],
  "applied_variables": {
    "merchant_id": "m_001",
    "statuses": ["SUCCESS", "FAILED"]
  },
  "variable_definitions": [...],
  "filter_data": {
    "merchant_id": [
      { "label": "Merchant A", "value": "m_001" }
    ]
  }
}
```

There is also:
- `GET /api/v1/query/{id}/run?dashboard_id=dash_1&widget_id=wid_1&merchant_id=m_001`
But for FE, `POST` is cleaner.

**Dashboard Endpoints**

1. `POST /api/v1/dashboards`
Create dashboard with saved dashboard-level variables.

Example:
```json
{
  "name": "Finance Overview",
  "department": "finance",
  "description": "Main dashboard",
  "variables": {
    "merchant_id": "m_001",
    "statuses": ["SUCCESS"]
  }
}
```

2. `PUT /api/v1/dashboards/{id}`
Update dashboard metadata and saved variables.

Example:
```json
{
  "name": "Finance Overview",
  "description": "Main dashboard updated",
  "variables": {
    "merchant_id": "m_002",
    "statuses": ["FAILED", "PENDING"]
  }
}
```

3. `GET /api/v1/dashboards/{id}`
Get dashboard metadata.

4. `GET /api/v1/dashboards/{id}?include_data=true`
This is the dashboard execution endpoint for FE.
It executes each widget query using:
- dashboard saved `variables`
- widget `config.variables`
- widget `config.variable_mapping`

Response shape per widget is roughly:
```json
{
  "id": "dash_1",
  "name": "Finance Overview",
  "description": "Main dashboard",
  "variables": {
    "merchant_id": "m_001"
  },
  "widgets": [
    {
      "id": "wid_1",
      "widget_type": "table",
      "config": {
        "variables": {
          "statuses": ["SUCCESS"]
        },
        "variable_mapping": {
          "merchant_id": "merchant_id"
        }
      },
      "position": { "x": 0, "y": 0, "w": 6, "h": 4 },
      "query": {
        "id": "query_1",
        "name": "Payin By Merchant",
        "query_type": "visual",
        "variables": [...],
        "data": [...],
        "applied_variables": {
          "merchant_id": "m_001",
          "statuses": ["SUCCESS"]
        },
        "filter_data": {...}
      }
    }
  ]
}
```

**Widget Endpoints**

1. `POST /api/v1/dashboards/{id}/widgets`
Attach a widget to a dashboard.

Example:
```json
{
  "query_id": "query_1",
  "widget_type": "table",
  "position": {
    "x": 0,
    "y": 0,
    "w": 6,
    "h": 4
  },
  "config": {
    "variables": {
      "statuses": ["SUCCESS"]
    },
    "variable_mapping": {
      "merchant_id": "merchant_id"
    }
  }
}
```

2. `PUT /api/v1/widgets/{id}`
Update widget query/type/position/config.

Example:
```json
{
  "query_id": "query_1",
  "type": "chart",
  "position": {
    "x": 0,
    "y": 4,
    "w": 12,
    "h": 5
  },
  "config": {
    "variables": {
      "statuses": ["FAILED"]
    },
    "variable_mapping": {
      "merchant_id": "merchant_id"
    }
  }
}
```

3. `POST /api/v1/widgets`
Bulk widget upsert for a dashboard.

Example:
```json
{
  "dashboard_id": "dash_1",
  "widgets": [
    {
      "id": "wid_1",
      "type": "table",
      "query_id": "query_1",
      "position": {
        "x": 0,
        "y": 0,
        "w": 6,
        "h": 4
      },
      "config": {
        "variable_mapping": {
          "merchant_id": "merchant_id"
        }
      }
    }
  ]
}
```

4. `GET /api/v1/dashboards/{id}/widgets`
List widgets for a dashboard.

**Recommended FE Flow**

1. Call `GET /api/v1/query/schemas` to build the visual-query editor.
2. Create or update query with:
- `variables`
- visual `config` using `valueSource: "variable"`
3. Create or update dashboard with saved `variables`.
4. Create or update widgets with:
- `config.variables` for widget-specific overrides
- `config.variable_mapping` for mapping dashboard var names into query var names
5. Call `GET /api/v1/query/{id}/filters` to render filter controls and options.
6. Call `POST /api/v1/query/{id}/run` for single-widget preview or ad hoc execution.
7. Call `GET /api/v1/dashboards/{id}?include_data=true` to load the whole dashboard with executed widget data.