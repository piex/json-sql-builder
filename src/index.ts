import { Condition, FromClause, JSONValueField, Query, SelectField } from './types';
import { isTableClause } from './utils';

export class JsonSqlBuilder {
  private params: any[] = [];

  constructor(private query: Query) {}

  generate(): { sql: string; params: any[] } {
    this.params = [];
    let sql = '';

    switch (this.query.type) {
      case 'select':
        sql = this.generateSelect();
        break;
      // 其他类型处理...
    }

    return { sql, params: this.params };
  }

  private generateSelect(): string {
    const parts: string[] = [];
    parts.push('SELECT');

    if (this.query.options?.distinct) {
      parts.push('DISTINCT');
    }

    // 处理 SELECT 字段
    const fields =
      this.query.select?.map((f) => this.parseSelectField(f)).join(', ') || '*';
    parts.push(fields);

    // 处理 FROM
    if (this.query.from) {
      parts.push('FROM', this.parseFrom(this.query.from));
    }

    // 处理 JOIN
    if (this.query.join) {
      parts.push(...this.query.join.map((j) => this.parseJoin(j)));
    }

    // 处理 WHERE
    if (this.query.where) {
      parts.push('WHERE', this.parseCondition(this.query.where));
    }

    // 处理 GROUP BY
    if (this.query.group_by) {
      parts.push('GROUP BY', this.parseGroupBy());
    }

    // 处理 ORDER BY
    if (this.query.order_by) {
      parts.push('ORDER BY', this.parseOrderBy());
    }

    // 处理 LIMIT/OFFSET
    if (this.query.limit) {
      parts.push(`LIMIT ${this.query.limit}`);
    }
    this.query.offset;
    parts.push(`OFFSET ${this.query.offset}`);

    // 处理 UNION
    if (this.query.union) {
      parts.push(
        ...this.query.union.map(
          (u) => `UNION ${new JsonSqlBuilder(u).generate().sql}`,
        ),
      );
    }

    return parts.join(' ');
  }

  parseSelectField(field: SelectField): string {
    if (typeof field === 'string') return field;
    if ('$json_value' in field) {
      const jsonValueField = field as unknown as JSONValueField;
      return `JSON_UNQUOTE(JSON_EXTRACT(${jsonValueField.field}, '${jsonValueField.path}'))${field.as ? ` AS ${field.as}` : ''}`;
    }
    // 处理其他字段类型...
  }

  parseCondition(cond: Condition, parentOperator?: string): string {
    const entries = Object.entries(cond);

    return entries.map(([key, value]) => {
      if (key === '$and') {
        return `(${value.map(c => this.parseCondition(c)).join(' AND ')})`;
      }
      if (key === '$or') {
        return `(${value.map(c => this.parseCondition(c)).join(' OR ')})`;
      }
      if (key === '$not') {
        if (value===null || value===undefined) {
          return 'IS NOT NULL';
        }
        return `NOT (${this.parseCondition(value)})`;
      }

      // 处理比较操作符 ($eq, $gt, $in 等)
      if (this.isComparisonOperator(key)) {
        return this.handleComparisonOperator(key, value);
      }

      // 处理 JSON 操作符
      if (this.isJsonOperator(key)) {
        return this.handleJsonOperator(key, value);
      }

      // 处理字段直接比较 (如 { name: 'John' })
      if (typeof value !== 'object') {
        const paramKey = this.addParameter(value);
        return `${this.escapeIdentifier(key)} = ${paramKey}`;
      }

      // 递归处理嵌套条件
      return this.parseCondition(value, key);
    }).join(parentOperator === '$or' ? ' OR ' : ' AND ');
  }

  parseFrom(from: FromClause) {
    if (typeof from ==='string') {
      return from;
    }

    if (typeof from!=='object') {
      throw new Error('unknown form clause');
    }

    if (isTableClause(from)) {
      let sql = `from ${from.table}`;
      if (typeof from.as === 'string') {
        sql += `as ${from.as}`
      }
      return sql;
    }

    const { sql, params } = new JsonSqlBuilder(from.$subquery).generate();

    this.params = { ...params, ...this.params };

    return `from ${sql} as ${from.as}`;
  }

  private isComparisonOperator(op: string): boolean {
    const operators = [
      '$eq', '$neq', '$gt', '$gte', '$lt', '$lte',
      '$in', '$nin', '$between', '$like', '$ilike',
      '$is_null', '$is_not_null'
    ];
    return operators.includes(op);
  }

  private isJsonOperator(operator: string): boolean {
    // 定义支持的 JSON 操作符列表
    const jsonOperators = new Set([
      '$json_value',
      '$json_contains',
      '$json_search',
      '$json_path',
      '$json_extract',
      '$json_overlaps' // 特定方言支持
    ]);
  
    // 检查是否为已知 JSON 操作符
    return jsonOperators.has(operator);
  }

  private handleComparisonOperator(operator: string, value: any): string {
    const operatorMap: { [key: string]: string } = {
      '$eq': '=',
      '$neq': '<>',
      '$gt': '>',
      '$gte': '>=',
      '$lt': '<',
      '$lte': '<=',
      '$like': 'LIKE',
      '$ilike': 'ILIKE',
      '$is_null': 'IS NULL',
      '$is_not_null': 'IS NOT NULL'
    };

    // 处理特殊操作符
    if (operator === '$in' || operator === '$nin') {
      const values = Array.isArray(value) ? value : [value];
      const placeholders = values.map(v => this.addParameter(v)).join(', ');
      return `${operator === '$nin' ? 'NOT ' : ''}IN (${placeholders})`;
    }

    if (operator === '$between') {
      const [start, end] = value;
      return `BETWEEN ${this.addParameter(start)} AND ${this.addParameter(end)}`;
    }

    if (operator === '$is_null' || operator === '$is_not_null') {
      return operatorMap[operator];
    }

    // 处理普通比较操作符
    const sqlOperator = operatorMap[operator];
    const paramValue = this.resolveValue(value);
    return `${sqlOperator} ${paramValue}`;
  }

  private handleJsonOperator(operator: string, value: any): string {
    switch (operator) {
      case '$json_value':
        const { field, path } = value;
        this.validateJsonPath(path);
        return `JSON_UNQUOTE(JSON_EXTRACT(${this.escapeIdentifier(field)}, '${path}'))`;
  
      case '$json_contains':
        return this.buildJsonFunction('JSON_CONTAINS', value);
  
      case '$json_search':
        return this.buildJsonFunction('JSON_SEARCH', value, {
          one: 'one',
          all: 'all'
        }, 'mode');
  
      case '$json_path':
        return `JSON_EXISTS(${this.escapeIdentifier(value.field)}, '${value.path}')`;
  
      default:
        throw new Error(`Unsupported JSON operator: ${operator}`);
    }
  }

  private buildJsonFunction(
    funcName: string,
    value: any,
    optionMap?: Record<string, string>,
    optionKey?: string
  ): string {
    const { field, path, value: jsonValue, ...options } = value;
    const params: string[] = [];
    
    // 添加字段和路径
    params.push(`${this.escapeIdentifier(field)}, '${path}'`);

    // 添加值参数（可能包含嵌套参数）
    if (jsonValue !== undefined) {
      params.push(this.resolveValue(jsonValue));
    }

    // 处理选项（如 JSON_SEARCH 的 mode）
    if (optionKey && options[optionKey]) {
      const optionValue = optionMap?.[options[optionKey]] ?? options[optionKey];
      params.push(`'${optionValue}'`);
    }

    return `${funcName}(${params.join(', ')})`;
  }

  private resolveValue(value: any): string {
    if (typeof value === 'object' && value !== null) {
      // 处理参数化值
      if ('$param' in value) {
        return this.addParameter(this.query.parameters?.[value.$param]);
      }
      
      // 处理字段引用
      if ('$field' in value) {
        return this.escapeIdentifier(value.$field);
      }
  
      // 处理原始表达式
      if ('$raw' in value) {
        this.validateRawExpression(value.$raw);
        return value.$raw;
      }
  
      // 处理嵌套条件
      return this.parseCondition(value);
    }
  
    // 处理原始值
    return this.addParameter(value);
  }
  
  private addParameter(value: any): string {
    const paramKey = '?';
    this.params.push(value);
    return paramKey;
  }
  
  private escapeIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
}
