import { z } from 'zod';

const ATTACHMENT_PATH = /^\/api\/attachments\/[0-9a-f-]{36}\/content$/;

const linkHref = z.url({ protocol: /^(https?|mailto)$/ });
const imageSource = z.union([z.string().regex(ATTACHMENT_PATH), z.url({ protocol: /^https?$/ })]);

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['bold', 'italic', 'strike', 'code']) }),
  z.object({ type: z.literal('link'), href: linkHref }),
]);

const inlineSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string(), marks: z.array(markSchema).optional() }),
  z.object({ type: z.literal('hardBreak') }),
]);

export type PublicMark = z.infer<typeof markSchema>;
export type PublicInline = z.infer<typeof inlineSchema>;

export type PublicBlock =
  | { type: 'paragraph'; content: PublicInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; content: PublicInline[] }
  | { type: 'bulletList' | 'orderedList'; items: PublicBlock[][] }
  | { type: 'taskList'; items: { checked: boolean; content: PublicBlock[] }[] }
  | { type: 'codeBlock'; language: string | null; code: string }
  | { type: 'image'; src: string; alt: string | null };

const blockSchema: z.ZodType<PublicBlock> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), content: z.array(inlineSchema) }),
    z.object({
      type: z.literal('heading'),
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      content: z.array(inlineSchema),
    }),
    z.object({
      type: z.enum(['bulletList', 'orderedList']),
      items: z.array(z.array(blockSchema)),
    }),
    z.object({
      type: z.literal('taskList'),
      items: z.array(z.object({ checked: z.boolean(), content: z.array(blockSchema) })),
    }),
    z.object({
      type: z.literal('codeBlock'),
      language: z
        .string()
        .regex(/^[\w+#-]{1,32}$/)
        .nullable(),
      code: z.string(),
    }),
    z.object({ type: z.literal('image'), src: imageSource, alt: z.string().max(500).nullable() }),
  ]),
);

export const publicBlocksSchema = z.array(blockSchema);
