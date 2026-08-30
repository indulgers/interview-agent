import { z } from 'zod';

export const DIMENSION_IDS = ['project_ownership', 'node_backend', 'frontend_delivery', 'ai_agent', 'system_design', 'communication'] as const;

const text = z.string().trim().min(1).max(2_000);
const turnIds = z.array(z.string().trim().min(1)).max(12);
const assessment = {
  score: z.number().int().min(1).max(5), insufficientEvidence: z.literal(false), evidenceTurnIds: turnIds.min(1), assessment: text, nextStep: text,
};
const insufficient = {
  score: z.null(), insufficientEvidence: z.literal(true), evidenceTurnIds: turnIds.max(0), assessment: z.literal('本场未充分验证'), nextStep: text,
};
const dimension = <T extends typeof DIMENSION_IDS[number]>(id: T) => z.discriminatedUnion('insufficientEvidence', [
  z.object({ id: z.literal(id), ...assessment }), z.object({ id: z.literal(id), ...insufficient }),
]);

export const FeedbackResultSchema = z.object({
  dimensions: z.tuple(DIMENSION_IDS.map(dimension) as [ReturnType<typeof dimension>, ReturnType<typeof dimension>, ReturnType<typeof dimension>, ReturnType<typeof dimension>, ReturnType<typeof dimension>, ReturnType<typeof dimension>]),
  strengths: z.array(z.object({ turnId: z.string().min(1), title: text, reason: text })).length(3),
  weakMoments: z.array(z.object({ turnId: z.string().min(1), title: text, missing: text, betterOutline: text })).length(3),
  priorities: z.array(z.object({ title: text, action: text })).length(3),
  missingTranscriptWarning: z.string().min(1).nullable(),
}).strict().superRefine((value, context) => {
  if (/(?:建议录用|不建议录用|hiring recommendation|hire\b)/i.test(JSON.stringify(value))) {
    context.addIssue({ code: 'custom', message: '反馈不得包含录用结论' });
  }
});

export type FeedbackResult = z.infer<typeof FeedbackResultSchema>;

export interface FeedbackModel {
  generate(prompt: string): Promise<unknown>;
}
