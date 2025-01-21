import { Condition, FromClause, Query, SelectField } from './types';
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
          (u) => `UNION ${new SqlGenerator(u).generate().sql}`,
        ),
      );
    }

    return parts.join(' ');
  }

  parseSelectField(field: SelectField): string {
    if (typeof field === 'string') return field;
    if ('$json_value' in field) {
      return `JSON_UNQUOTE(JSON_EXTRACT(${field.$json_value.field}, '${field.$json_value.path}'))` + 
        (field.as ? ` AS ${field.as}` : '');
    }
    // 处理其他字段类型...
  }

  parseCondition(cond: Condition): string {
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
      // 处理其他操作符...
    }).join(' ');
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
}
