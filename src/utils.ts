import { TableClause } from "./types"

export const isTableClause = (clause: any):clause is TableClause => {
  return typeof clause==='object' && typeof clause.table === 'string';
}
