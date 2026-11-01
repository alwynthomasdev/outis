# Recipes and JSON paths

A recipe is the set of rules for one file layout, saved as JSON so it can be reused.

```json
{
  "version": 1,
  "name": "customers",
  "format": "csv",
  "rules": [
    { "field": "first_name", "action": "fake", "type": "FIRST_NAME" },
    { "field": "last_name", "action": "fake", "type": "LAST_NAME" },
    { "field": "email", "action": "fake", "type": "EMAIL" },
    { "field": "card_number", "action": "mask", "type": "CARD", "maskKeep": 4 },
    { "field": "customer_id", "action": "hash", "type": "GENERIC" },
    { "field": "notes", "action": "scan", "type": "GENERIC" }
  ]
}
```

| Field      | Meaning                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `field`    | CSV column name, or JSON path / path pattern                                       |
| `action`   | `fake`, `mask`, `hash`, `redact`, `constant`, `clear`, `scan`, `keep`              |
| `type`     | The PII type, used for `fake` and `redact`. See [detectors.md](detectors.md#types) |
| `constant` | Value for `action: "constant"`                                                     |
| `maskKeep` | Characters left visible for `action: "mask"` (default 4)                           |

Fields not listed in a recipe are kept unchanged.

## JSON paths

Outis lists every leaf property (string or number) by its _generalised path_, where any array index is written `[*]`:

```json
{ "orders": [{ "customer": { "email": "a@b.com" } }] }
```

has the path `orders[*].customer.email`.

- Keys that aren't simple identifiers are quoted: `["first name"]`.
- A top-level array starts with `[*]`: `[*].email`.
- JSON Lines files are treated as a top-level array.

### Patterns

| Pattern                    | Matches                                    |
| -------------------------- | ------------------------------------------ |
| `orders[*].customer.email` | exactly that path                          |
| `**.email`                 | `email` at any depth                       |
| `orders[*].*.phone`        | `phone` one level below any order property |
| `customer.**`              | everything under `customer`                |

`*` matches one key; `**` matches any number of levels. Exact path rules take priority over patterns. When several patterns match, the first one wins.

## Processing order

For each file, Outis applies names first (`PERSON`, `FIRST_NAME`, `LAST_NAME`), then all other fields, then free-text scans. This lets email addresses and usernames reuse the name mapping, so the fake email matches the fake name.
