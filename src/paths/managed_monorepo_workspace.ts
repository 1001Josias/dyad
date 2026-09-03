import path from "node:path";
import { z } from "zod";

export const ManagedMonorepoWorkspaceConfigSchema = z
  .object({
    monorepoRoot: z.string().trim().min(1),
    appsDirectory: z.string().trim().min(1),
  })
  .superRefine((config, ctx) => {
    if (path.isAbsolute(config.appsDirectory)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appsDirectory"],
        message: "appsDirectory must be a relative path",
      });
      return;
    }

    const monorepoRoot = path.resolve(config.monorepoRoot);
    const appsPath = path.resolve(monorepoRoot, config.appsDirectory);
    const relativePath = path.relative(monorepoRoot, appsPath);

    if (
      relativePath === "" ||
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appsDirectory"],
        message: "appsDirectory must resolve to a directory under monorepoRoot",
      });
    }
  });

export type ManagedMonorepoWorkspaceConfig = z.infer<
  typeof ManagedMonorepoWorkspaceConfigSchema
>;

/**
 * Reads the optional managed-monorepo fields from a settings-like object.
 *
 * Both fields must be absent for the feature to be considered unconfigured.
 * If either field is present, the pair is validated together so a partial or
 * unsafe configuration cannot be used accidentally.
 */
export function parseManagedMonorepoWorkspaceConfig(
  settings: unknown,
): ManagedMonorepoWorkspaceConfig | null {
  if (typeof settings !== "object" || settings === null) {
    return null;
  }

  const candidate = settings as Record<string, unknown>;
  const monorepoRoot = candidate.monorepoRoot;
  const appsDirectory = candidate.appsDirectory;

  if (monorepoRoot === undefined && appsDirectory === undefined) {
    return null;
  }

  return ManagedMonorepoWorkspaceConfigSchema.parse({
    monorepoRoot,
    appsDirectory,
  });
}

/**
 * Resolves the directory containing apps managed inside a monorepo.
 * Returns null when managed-monorepo configuration is not enabled.
 */
export function resolveManagedMonorepoAppsDirectory(
  settings: unknown,
): string | null {
  const config = parseManagedMonorepoWorkspaceConfig(settings);
  if (!config) {
    return null;
  }

  return path.resolve(config.monorepoRoot, config.appsDirectory);
}
