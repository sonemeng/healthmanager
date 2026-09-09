import { z } from 'zod';

export const pluginCapabilitySchema = z.enum(['parser', 'view', 'analyzer']);
export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).min(3).max(100),
  name: z.string().min(1).max(255),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  capabilities: z.array(pluginCapabilitySchema).min(1),
  permissions: z.object({
    readCategories: z.array(z.string()).optional(),
    writeCategories: z.array(z.string()).optional(),
    requiresAI: z.boolean().optional(),
  }).optional(),
  config: z.record(z.string(), z.object({
    type: z.enum(['string', 'number', 'boolean']),
    description: z.string().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    required: z.boolean().optional(),
  })).optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export function validateManifest(manifest: unknown): { valid: boolean; errors?: string[] } {
  const result = pluginManifestSchema.safeParse(manifest);
  if (result.success) return { valid: true };
  return {
    valid: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}
