export type Dialect = 'mariadb' | 'mysql' | 'postgres';

export type AggregationOperator = 
  | "$count"
  | "$sum"
  | "$avg"
  | "$min"
  | "$max"
  | "$group_concat";

export interface Query {
  dialect?: Dialect;
  type?: 'select' | 'insert' | 'update' | 'delete';
  options?: {
    distinct?: boolean;
  },
  select?: SelectField[];
  from?: FromClause;
  join?: JoinClause[];
  where?: Condition;
  group_by?: (string | RawExpression)[];
  having?: Condition;
  order_by?: OrderByClause[];
  limit?: number;
  offset?: number;
  union?: Query[];
  parameters?: Record<string, any>;
}

export type SelectField = string | FieldAlias | JsonValue | Aggregation | SubqueryClause;

export interface FieldAlias {
  field: string | RawExpression | JsonValue;
  as: string;
}

export interface JsonValue {
  $json_value: JSONValueField;
  as?: string;
}

export interface RawExpression {
  $raw: string;
}

export type Condition = 
  | { [field: string]: any }
  | { $and: Condition[] }
  | { $or: Condition[] }
  | { $not: Condition }
  | { $json_value: JSONValueField; [operator: string]: any }
  | { $json_contains: JSONContainsClause };

export interface Aggregation {
  [operator: string]: {
    field: AggregationField;
    as?: string; // 可选别名
    // 特殊选项（如 DISTINCT）
    options?: {
      distinct?: boolean;
    };
  };
}

// 聚合字段可以是：
// 1. 普通字段名 (string)
// 2. JSON 字段表达式
// 3. 子查询
// 4. 原始表达式
export type AggregationField = 
  | string 
  | JsonValue 
  | SubqueryClause 
  | RawExpression;

export type FromClause = string | TableClause | SubqueryClause;

export interface TableClause {
  table: string;
  as?: string;
}

export interface SubqueryClause {
  $subquery: Query;
  as: string;
}

export interface JoinClause {
  type?: 'INNER' | 'LEFT' | 'RIGHT';
  table: FromClause;
  as?: string;
  on: Condition;
}

export interface OrderByClause {
  field: string | RawExpression;
  direction?: 'ASC' | 'DESC';
}

export interface JSONValueField {
  field: string;
  path: string;
}

export interface JSONContainsClause {
  field: string;
  path: string;
  value: any;
}
