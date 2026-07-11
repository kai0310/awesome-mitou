import { z } from 'zod';

// candidates.json の 1 要素。open-candidate-prs.mjs が読む snake_case 契約を維持し、
// confidence / category / fiscal_year を追加する。
export const candidateSchema = z.object({
  full_name: z.string(),
  url: z.string(),
  description: z.string(),
  stars: z.number(),
  score: z.number(),
  reasons: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  category: z.enum(['it', 'junior', 'target', 'advanced']).nullable(),
  fiscal_year: z.number().nullable(),
});

export const candidatesSchema = z.array(candidateSchema);

export type CandidateOutputParsed = z.infer<typeof candidateSchema>;

// mitou-lists.json。壊れていても各キーは配列にフォールバックできるよう、
// パース失敗時は呼び出し側で既定値を使う。
export const rawListsSchema = z.object({
  blockedOwners: z.array(z.string()).catch([]),
  blockedRepos: z.array(z.string()).catch([]),
  acceptedRepos: z.array(z.string()).catch([]),
});

export type RawListsParsed = z.infer<typeof rawListsSchema>;
