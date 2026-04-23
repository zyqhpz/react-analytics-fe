`/api/v1/query/test/{type}` now supports variables and stays backward compatible.

What changed:
- `POST /api/v1/query/test/sql` still accepts the old payloads:
```json
{ "sql": "SELECT 1 AS total" }
```
or
```json
{ "stmt": "SELECT 1 AS total" }
```
- It now also accepts a wrapper payload:
```json
{
  "config": {
    "sql": "SELECT * FROM payin WHERE account_id = :merchant_id AND status IN (:statuses)"
  },
  "variables": {
    "merchant_id": "m_001",
    "statuses": ["SUCCESS", "FAILED"]
  }
}
```

For visual queries:
- old payload still works unchanged as a plain `VisualQueryRequest`
- new wrapper payload is supported:
```json
{
  "config": {
    "table": "payin",
    "select": [
      { "name": "account_id" },
      { "name": "status" }
    ],
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
    "having": {
      "combinator": "and",
      "rules": []
    },
    "order_by": [],
    "limit": 100
  },
  "variables": {
    "merchant_id": "m_001",
    "statuses": ["SUCCESS", "FAILED"]
  }
}
```

Behavior:
- SQL test now compiles named variables before execution.
- Visual test now resolves `valueSource: "variable"` before builder conversion.
- Old non-variable payloads still go through the original code path.

Implementation notes:
- Added arg-aware SQL test execution support in the service layer.
- Added parsing for `{ config, variables }` test payloads.
- Kept plain bodies working exactly as before.
- Added tests for both new wrapper forms and reran the full suite.