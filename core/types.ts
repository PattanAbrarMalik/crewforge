export interface Statement {
  bind(...args: any[]): Statement;
  first<T = any>(column?: string): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<any>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<any[]>;
}
export interface Context {
  db: Database;
  user: { id: string; name?: string } | null;
  now?: () => number;
  debug?: boolean;
}
export const SKILLS = [
  "React",
  "TypeScript",
  "Node.js",
  "Python",
  "Design",
  "AI / ML",
  "Data",
  "DevOps",
  "Mobile",
  "Product",
] as const;
export const PERSONAS = ["alex", "maya", "noor", "leo"] as const;
export const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export const randomCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export function decodeRow(row: any) {
  return row ? { ...row, skills: JSON.parse(row.skills ?? "[]") } : null;
}
