import { Query } from "./types";

export class QueryValidator {
  // 默认安全规则（可配置扩展）
  private allowedRawPatterns: RegExp[] = [
    /^COALESCE\(.*\)$/i,          // 允许 COALESCE 函数
    /^CONCAT\(.*\)$/i,            // 允许字符串拼接
    /^DATE_FORMAT\(.*\)$/i,       // 允许日期格式化
    /^CAST\(.* AS .*\)$/i,        // 允许类型转换
    /^[a-z0-9_]+\(.*\)$/i         // 允许普通函数调用
  ];

  private dialect: Query['dialect'];

  private forbiddenKeywords = new Set([
    'DELETE', 'DROP', 'INSERT', 
    'UPDATE', 'TRUNCATE', ';', '--'
  ]);

  constructor(query: Query) {
    this.dialect = query.dialect || 'mariadb';
  }

  validateRawExpression(raw: string): void {
    // 规则1：检查黑名单关键字
    this.checkForbiddenKeywords(raw);

    // 规则2：验证表达式模式
    if (!this.isAllowedPattern(raw)) {
      throw new Error(`Unsafe raw expression: ${raw}`);
    }

    // 规则3：方言特定校验
    this.validateDialectSpecific(raw);
  }

  private checkForbiddenKeywords(raw: string): void {
    const upperRaw = raw.toUpperCase();
    
    for (const keyword of this.forbiddenKeywords) {
      if (upperRaw.includes(keyword.toUpperCase())) {
        throw new Error(`Forbidden keyword detected: ${keyword}`);
      }
    }
  }

  private isAllowedPattern(raw: string): boolean {
    return this.allowedRawPatterns.some(pattern => 
      pattern.test(raw.trim())
    );
  }

  private validateDialectSpecific(raw: string): void {
    switch (this.dialect) {
      case 'mariadb':
        this.validateMariaDBFunctions(raw);
        break;
      case 'postgres':
        this.validatePostgresFunctions(raw);
        break;
    }
  }

  // MariaDB 特定校验（示例）
  private validateMariaDBFunctions(raw: string): void {
    const allowedFunctions = [
      'JSON_VALUE', 'JSON_EXTRACT', 
      'GROUP_CONCAT', 'DATE_ADD'
    ];
    
    if (!allowedFunctions.some(fn => 
      new RegExp(`\\b${fn}\\(.*\\)`, 'i').test(raw)
    )) {
      throw new Error(`Unsupported MariaDB function in: ${raw}`);
    }
  }

  // PostgreSQL 特定校验（示例）
  private validatePostgresFunctions(raw: string): void {
    const allowedFunctions = [
      'TO_CHAR', 'COALESCE', 
      'ARRAY_AGG', 'DATE_TRUNC'
    ];
    
    if (!allowedFunctions.some(fn => 
      new RegExp(`\\b${fn}\\(.*\\)`, 'i').test(raw)
    )) {
      throw new Error(`Unsupported PostgreSQL function in: ${raw}`);
    }
  }

  // 扩展方法：允许动态添加规则
  addValidationRule(rule: {
    pattern?: RegExp;
    forbidden?: string[];
    allowedFunctions?: string[];
  }): void {
    if (rule.pattern) {
      this.allowedRawPatterns.push(rule.pattern);
    }
    if (rule.forbidden) {
      rule.forbidden.forEach(kw => this.forbiddenKeywords.add(kw));
    }
    if (rule.allowedFunctions) {
      this.allowedRawPatterns.push(
        new RegExp(`^(${rule.allowedFunctions.join('|')})\\(.*\\)$`, 'i')
      );
    }
  }
}