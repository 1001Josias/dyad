import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const NonEmptyPathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .refine((val) => val.trim().length > 0, {
    message: "Path cannot contain only whitespace",
  });

/**
 * Checks if target escapes root or resolves to root itself.
 */
function isEscapingRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

/**
 * Canonicalizes an absolute path by resolving symlinks on existing ancestors.
 * If the path or a subsegment does not exist yet, resolves symlinks for the
 * closest existing ancestor and appends the remaining relative path.
 */
export function safeRealpath(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      try {
        const lstat = fs.lstatSync(targetPath);
        if (lstat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(targetPath);
          const resolvedTarget = path.isAbsolute(linkTarget)
            ? linkTarget
            : path.resolve(path.dirname(targetPath), linkTarget);
          return safeRealpath(resolvedTarget);
        }
      } catch {
        // Not a symlink or cannot lstat; proceed to parent resolution
      }

      const parent = path.dirname(targetPath);
      if (parent !== targetPath) {
        const realParent = safeRealpath(parent);
        return path.join(realParent, path.basename(targetPath));
      }
    }
    return targetPath;
  }
}

export const ManagedMonorepoWorkspaceConfigSchema = z
  .object({
    monorepoRoot: NonEmptyPathSchema,
    appsDirectory: NonEmptyPathSchema,
  })
  .superRefine((config, ctx) => {
    if (!path.isAbsolute(config.monorepoRoot)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monorepoRoot"],
        message: "monorepoRoot must be an absolute path",
      });
      return;
    }

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

    // Lexical containment check
    if (isEscapingRoot(monorepoRoot, appsPath)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appsDirectory"],
        message: "appsDirectory must resolve to a directory under monorepoRoot",
      });
      return;
    }

    // Physical containment check (resolves symlinks to avoid directory traversal outside root)
    const realMonorepoRoot = safeRealpath(monorepoRoot);
    const realAppsPath = safeRealpath(appsPath);
    if (isEscapingRoot(realMonorepoRoot, realAppsPath)) {
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

  const isAbsent = (value: unknown) => value === undefined || value === null;

  if (isAbsent(monorepoRoot) && isAbsent(appsDirectory)) {
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
