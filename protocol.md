# JSON SQL Query

## 1. 概述

本规范定义了一种通过 **JSON 结构生成 SQL 查询**的语法，支持：

- 基础 SQL 操作（`SELECT`、`JOIN`、`WHERE`、`GROUP BY` 等）
- JSON 字段查询（路径提取、包含检查等）
- 复杂条件、子查询、联合查询（`UNION`）
- 参数化查询（防 SQL 注入）

## 2. 基础结构

```json
{
  "type": "select",          // 操作类型：select/insert/update/delete
  "options": {
    "distinct": true         // 可选配置（如 DISTINCT）
  },
  "select": [],              // SELECT 字段（支持普通列和 JSON 列）
  "from": {},                // 主表或子查询
  "join": [],                // JOIN 表
  "where": {},               // WHERE 条件（支持 JSON 操作符）
  "group_by": [],            // GROUP BY 字段
  "having": {},              // HAVING 条件
  "order_by": [],            // ORDER BY 字段
  "limit": 10,               // LIMIT
  "offset": 0,               // OFFSET
  "union": [],               // UNION 其他查询
  "parameters": {}
}
```

## 3. 字段定义

### 3.1. `select` 字段

- **普通字段**：`"column_name"` 或 `{ "field": "column", "as": "alias" }`
- **JSON 字段**：
    
    ```json
    {
      "$json_value": { 
        "field": "json_column",  // JSON 列名
        "path": "$.key.path"     // JSON 路径（如 $.user.name）
      },
      "as": "alias"              // 可选别名
    }
    ```
    
- **聚合函数**：
    
    ```json
    { "$count": "column" }, 
    { "$sum": { "$json_value": { "field": "data", "path": "$.price" } } }
    ```
    
- **子查询**：
    
    ```json
    {
      "$subquery": { 
        "select": ["id"], 
        "from": "orders",
        "where": { "user_id": { "$eq": { "$field": "u.id" } } }
      },
      "as": "order_count"
    }
    ```
    

### 3.2. `from` 字段

- **表或子查询**：
    
    ```json
    // 表名
    "tableName"
    
    {
      "table": "users",
      "as": "u"  // 别名
    }
    // 或子查询
    {
      "$subquery": { 
        "select": ["id", "name"], 
        "from": "users",
        "where": { "age": { "$gt": 18 } }
      },
      "as": "adults"
    }
    ```
    

### 3.3. `join` 字段

- 支持多种 JOIN 类型（`INNER`, `LEFT`, `RIGHT`）和复杂 `ON` 条件：
- **JOIN 表结构**：
    
    ```json
    {
      "type": "INNER",           // INNER/LEFT/RIGHT
      "table": "orders",         // 表名或子查询
      "as": "o",                // 别名
      "on": {                   // ON 条件
        "$and": [
          { "u.id": { "$eq": "o.user_id" } },
          { "o.status": { "$neq": "canceled" } }
        ]
      }
    }
    ```
    

### 3.4. `order_by` 字段

- 支持排序方向和表达式：

```json
"order_by": [
  { "field": "salary", "direction": "DESC" },
  { "field": { "$raw": "RAND()" }, "direction": "ASC" }  // 随机排序
]
```

### 3.5. 其他字段

- `group_by`: 支持多字段和表达式：
    
    ```json
    "group_by": ["country", { "$raw": "YEAR(created_at)" }]
    ```
    
- `limit`/`offset`: 分页查询。
- `union`: 支持多个 UNION 查询
    
    ```json
    "union": [
      { "select": ["id"], "from": "table1" },
      { "select": ["id"], "from": "table2" }
    ]
    ```
    

## 4. 条件操作符 (`WHERE`/`HAVING`)

### 4.1 逻辑操作符

| **操作符** | **示例** |
| --- | --- |
| `$and` | `{ "$and": [ { "a": 1 }, { "b": 2 } ] }` |
| `$or` | `{ "$or": [ { "age": { "$lt": 18 } }, { "status": "active" } ] }` |
| `$not` | `{ "$not": { "name": { "$like": "%test%" } } }` |

### 4.2 比较操作符

| **操作符** | **示例** |
| --- | --- |
| `$eq` | `{ "age": { "$eq": 25 } }` |
| `$gt` | `{ "price": { "$gt": 100 } }` |
| `$in` | `{ "id": { "$in": [1, 2, 3] } }` |
| `$like` | `{ "name": { "$like": "John%" } }` |

### 4.3 JSON 操作符 (MariaDB）

| **操作符** | **示例** |
| --- | --- |
| `$json_path` | `{ "data->'$.name'": { "$eq": "Alice" } }` |
| `$json_value` | `{ "$json_value": { "field": "data", "path": "$.age" }, "$gt": 18 }` |
| `$json_contains` | `{ "$json_contains": { "field": "data", "path": "$.tags", "value": "VIP" } }` |
| `$json_search` | `{ "$json_search": { "field": "data", "query": "New York", "mode": "one" } }` |

## 5. 完整示例

### 5.1 查询 JSON 列中的嵌套数据

```json
{
  "dialect": "mariadb",
  "type": "select",
  "select": [
    "id",
    { 
      "$json_value": { 
        "field": "profile", 
        "path": "$.contact.email" 
      }, 
      "as": "email" 
    },
    { "$count": "*", "as": "total_orders" }
  ],
  "from": {
    "table": "users",
    "as": "u"
  },
  "join": [
    {
      "type": "LEFT",
      "table": "orders",
      "as": "o",
      "on": { "u.id": { "$eq": "o.user_id" } }
    }
  ],
  "where": {
    "$and": [
      { 
        "$json_value": { 
          "field": "profile", 
          "path": "$.age" 
        }, 
        "$gte": 18 
      },
      { 
        "$json_contains": {
          "field": "profile",
          "path": "$.skills",
          "value": { "$param": "skill" }  // 参数化值
        }
      }
    ]
  },
  "group_by": ["u.id"],
  "order_by": [
    { "field": "total_orders", "direction": "DESC" }
  ],
  "limit": 10
}
```

**生成 SQL**:

```sql
SELECT
  u.id,
  JSON_UNQUOTE(JSON_EXTRACT(profile, '$.contact.email')) AS email,
  COUNT(*) AS total_orders
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE 
  JSON_EXTRACT(profile, '$.age') >= 18
  AND JSON_CONTAINS(JSON_EXTRACT(profile, '$.skills'), ?)  -- 参数化值
GROUP BY u.id
ORDER BY total_orders DESC
LIMIT 10;
```

## 6. 安全性规则

### 6.1. 参数化查询

- 所有动态值需用 `{ "$param": "key" }` 标记，避免 SQL 注入。
- 示例：
    
    ```json
    {
      "where": { 
        "name": { "$eq": { "$param": "userName" } } 
      }
    }
    ```
    
    生成 SQL：
    
    ```sql
    WHERE name = ?  -- 使用 Prepared Statement 替换
    ```
    

### 6.2. JSON 路径白名单

- 限制允许的 JSON 路径（如 `$.user.*`），防止路径注入攻击。

### 6.3. 输入校验

- 校验 JSON 路径格式（必须以 `$` 开头）。
- 禁止未经验证的 `$raw` 表达式。

## 7. 高级功能

### 7.1. 类型转换

```json
{
  "where": {
    "$cast": {
      "value": { "$json_value": { "field": "data", "path": "$.age" } },
      "as": "INTEGER",
      "$gt": 18
    }
  }
}
```

生成 SQL：

```sql
WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.age')) AS SIGNED) > 18;
```

## 7.2 窗口函数

```json
{
  "select": [
    "id",
    {
      "$row_number": {
        "over": {
          "partition_by": ["department"],
          "order_by": [{ "field": "salary", "direction": "DESC" }]
        }
      },
      "as": "rank"
    }
  ]
}
```

生成 SQL：

```sql
SELECT
  id,
  ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS rank;
```

## 8. 规范附录

### 支持的操作符全集

| **类型** | **操作符** | **示例** |
| --- | --- | --- |
| **逻辑** | `$and`, `$or`, `$not` | `{ "$or": [ { "a": 1 }, { "b": 2 } ] }` |
| **比较** | `$eq`, `$neq`, `$gt`, `$gte`, `$lt`, `$lte` | `{ "age": { "$gt": 18 } }` |
| **集合** | `$in`, `$nin`, `$between` | `{ "id": { "$in": [1, 2, 3] } }` |
| **模糊匹配** | `$like`, `$ilike` | `{ "name": { "$like": "%john%" } }` |
| **JSON** | `$json_path`, `$json_contains` | `{ "$json_contains": { "field": "data", "path": "$.tags", "value": "VIP" } }` |
| **空值检查** | `$is_null,` `$is_not_null` | `{ "email": { "$is_null": true } }` |
| **聚合** | `$count`, `$sum`, `$avg` | `{ "$avg": "price" }` |
| **子查询** | `$subquery` | `{ "$subquery": { "select": ["id"], "from": "table" } }` |
| **原始表达式** | `$raw` | `{ "field": { "$raw": "CONCAT(first_name, ' ', last_name)" } }` |
