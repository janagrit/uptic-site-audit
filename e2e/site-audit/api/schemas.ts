import { z } from 'zod';

const rendered = z.object({ rendered: z.string() });

/** The subset of a `wp/v2/posts` item the suite relies on. Extra fields are allowed. */
export const postSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  status: z.literal('publish'),
  link: z.string().url(),
  date_gmt: z.string().min(1),
  title: rendered,
  excerpt: rendered,
});

export type Post = z.infer<typeof postSchema>;

export const postListSchema = z.array(postSchema);
