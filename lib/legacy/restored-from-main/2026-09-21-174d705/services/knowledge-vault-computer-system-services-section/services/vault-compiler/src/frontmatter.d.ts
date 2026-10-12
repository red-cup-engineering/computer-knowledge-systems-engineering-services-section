export interface ParsedMarkdown {
  data: Record<string, string | string[]>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedMarkdown;
export function asList(value: string | string[] | undefined): string[];
