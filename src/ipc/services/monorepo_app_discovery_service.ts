import fs from "node:fs/promises";
import path from "node:path";
import log from "electron-log";

import { db } from "@/db";
import { apps, chats } from "@/db/schema";
import { sanitizeAppDisplayName } from "@/shared/app_names";
import { resolveUniqueAppName } from "@/ipc/utils/app_name_resolution";
import { getDyadAppPath, getManagedMonorepoAppsDirectory } from "@/paths/paths";
import {
  parseManagedMonorepoWorkspaceConfig,
  resolveManagedMonorepoAppsDirectory,
  safeRealpath,
} from "@/paths/managed_monorepo_workspace";
import { readSettings } from "@/main/settings";
import { getInitialChatModeForNewChat } from "@/ipc/handlers/chat_mode_resolution";
import { queryInvalidationBus } from "@/window_infrastructure/main/query_invalidation_bus";
import { withLock } from "@/ipc/utils/lock_utils";

const logger = log.scope("monorepo-app-discovery");

const IGNORED_DIRECTORY_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".git",
  "temp",
  "tmp",
]);

const COMMON_UPPERCASE_ACRONYMS = new Set([
  "hr",
  "api",
  "ui",
  "ux",
  "sdk",
  "cli",
  "db",
  "ai",
  "id",
  "io",
  "os",
  "pr",
  "qa",
]);

export function isCandidateAppDirectoryName(dirName: string): boolean {
  if (dirName.startsWith(".")) {
    return false;
  }
  if (IGNORED_DIRECTORY_NAMES.has(dirName.toLowerCase())) {
    return false;
  }
  return true;
}

export function formatFolderNameAsDisplayName(folderName: string): string {
  // If the folder name already contains uppercase characters and no dashes/underscores,
  // preserve its expressive casing.
  if (/[A-Z]/.test(folderName) && !/[-_]/.test(folderName)) {
    return sanitizeAppDisplayName(folderName);
  }

  const parts = folderName.split(/[-_\s]+/);
  const formattedParts = parts.map((part) => {
    if (!part) return "";
    const lower = part.toLowerCase();
    if (COMMON_UPPERCASE_ACRONYMS.has(lower)) {
      return lower.toUpperCase();
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  const result = formattedParts.filter(Boolean).join(" ");
  return sanitizeAppDisplayName(result || folderName);
}

export async function deriveAppDisplayName(appPath: string): Promise<string> {
  const baseName = path.basename(appPath);

  try {
    const packageJsonPath = path.join(appPath, "package.json");
    const rawContent = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(rawContent);

    if (typeof parsed.displayName === "string" && parsed.displayName.trim()) {
      return sanitizeAppDisplayName(parsed.displayName);
    }

    if (typeof parsed.name === "string" && parsed.name.trim()) {
      let candidateName = parsed.name.trim();
      if (candidateName.startsWith("@") && candidateName.includes("/")) {
        candidateName = candidateName.split("/")[1] ?? candidateName;
      }
      return formatFolderNameAsDisplayName(candidateName);
    }
  } catch {
    // package.json missing or invalid JSON; fallback to formatting the directory name.
  }

  return formatFolderNameAsDisplayName(baseName);
}

export async function isValidApplicationDirectory(
  fullPath: string,
  options?: { monorepoRoot?: string },
): Promise<boolean> {
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) {
      return false;
    }

    const baseName = path.basename(fullPath);
    if (!isCandidateAppDirectoryName(baseName)) {
      return false;
    }

    if (options?.monorepoRoot) {
      const realRoot = safeRealpath(options.monorepoRoot);
      const realTarget = safeRealpath(fullPath);
      const relative = path.relative(realRoot, realTarget);
      if (
        relative === "" ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function isPathMatchingApp(
  appPathOnRow: string,
  targetPath: string,
): boolean {
  const fullRowPath = getDyadAppPath(appPathOnRow);
  const normalizedRow = path.resolve(fullRowPath).toLowerCase();
  const normalizedTarget = path.resolve(targetPath).toLowerCase();
  if (normalizedRow === normalizedTarget) {
    return true;
  }

  const realRow = safeRealpath(fullRowPath).toLowerCase();
  const realTarget = safeRealpath(targetPath).toLowerCase();
  return realRow === realTarget;
}

export interface RegisterMonorepoAppParams {
  path: string;
  name?: string;
  installCommand?: string | null;
  startCommand?: string | null;
}

export async function registerMonorepoApp(
  params: RegisterMonorepoAppParams,
): Promise<{ app: typeof apps.$inferSelect; alreadyExisted: boolean }> {
  const absoluteAppPath = path.resolve(params.path);

  const existingApps = await db.query.apps.findMany();
  const alreadyExisting = existingApps.find((app) =>
    isPathMatchingApp(app.path, absoluteAppPath),
  );
  if (alreadyExisting) {
    return { app: alreadyExisting, alreadyExisted: true };
  }

  const desiredName =
    params.name?.trim() || (await deriveAppDisplayName(absoluteAppPath));
  const uniqueName = await resolveUniqueAppName(desiredName);

  const [newApp] = await db
    .insert(apps)
    .values({
      name: uniqueName,
      path: absoluteAppPath,
      installCommand: params.installCommand ?? null,
      startCommand: params.startCommand ?? null,
    })
    .returning();

  const initialChatMode = await getInitialChatModeForNewChat();

  await db.insert(chats).values({
    appId: newApp.id,
    chatMode: initialChatMode,
  });

  queryInvalidationBus.publish([{ family: "apps" }, { family: "chats" }]);

  return { app: newApp, alreadyExisted: false };
}

export interface MonorepoDiscoveryOptions {
  appsDirectory?: string;
  settings?: unknown;
}

export interface MonorepoDiscoveryResult {
  apps: (typeof apps.$inferSelect)[];
  registered: (typeof apps.$inferSelect)[];
  skipped: (typeof apps.$inferSelect)[];
}

export async function discoverAndRegisterMonorepoApps(
  options?: MonorepoDiscoveryOptions,
): Promise<MonorepoDiscoveryResult> {
  return withLock("monorepo-app-discovery", async () => {
    let resolvedAppsDir: string | null = null;
    let monorepoRoot: string | undefined;

    if (options?.appsDirectory) {
      resolvedAppsDir = path.resolve(options.appsDirectory);
    } else {
      const settings = options?.settings ?? readSettings();
      const config = parseManagedMonorepoWorkspaceConfig(settings);
      if (config) {
        resolvedAppsDir = resolveManagedMonorepoAppsDirectory(settings);
        monorepoRoot = config.monorepoRoot;
      } else {
        resolvedAppsDir = getManagedMonorepoAppsDirectory();
      }
    }

    if (!resolvedAppsDir) {
      logger.debug(
        "Monorepo apps directory is not configured; discovery skipped",
      );
      return { apps: [], registered: [], skipped: [] };
    }

    try {
      const stat = await fs.stat(resolvedAppsDir);
      if (!stat.isDirectory()) {
        logger.debug(
          `Configured monorepo apps path "${resolvedAppsDir}" is not a directory`,
        );
        return { apps: [], registered: [], skipped: [] };
      }
    } catch {
      logger.debug(
        `Configured monorepo apps directory "${resolvedAppsDir}" does not exist`,
      );
      return { apps: [], registered: [], skipped: [] };
    }

    const dirents = await fs.readdir(resolvedAppsDir, { withFileTypes: true });
    dirents.sort((a, b) => a.name.localeCompare(b.name));

    const existingApps = await db.query.apps.findMany();
    const resultApps: (typeof apps.$inferSelect)[] = [];
    const registered: (typeof apps.$inferSelect)[] = [];
    const skipped: (typeof apps.$inferSelect)[] = [];

    let hasNewRegistrations = false;

    for (const dirent of dirents) {
      const candidatePath = path.join(resolvedAppsDir, dirent.name);
      const isValid = await isValidApplicationDirectory(candidatePath, {
        monorepoRoot,
      });
      if (!isValid) {
        continue;
      }

      const alreadyRegistered = existingApps.find((app) =>
        isPathMatchingApp(app.path, candidatePath),
      );

      if (alreadyRegistered) {
        resultApps.push(alreadyRegistered);
        skipped.push(alreadyRegistered);
      } else {
        const appName = await deriveAppDisplayName(candidatePath);
        const uniqueName = await resolveUniqueAppName(appName);

        const [newApp] = await db
          .insert(apps)
          .values({
            name: uniqueName,
            path: candidatePath,
            installCommand: null,
            startCommand: null,
          })
          .returning();

        const initialChatMode = await getInitialChatModeForNewChat();

        await db.insert(chats).values({
          appId: newApp.id,
          chatMode: initialChatMode,
        });

        existingApps.push(newApp);
        resultApps.push(newApp);
        registered.push(newApp);
        hasNewRegistrations = true;
      }
    }

    if (hasNewRegistrations) {
      queryInvalidationBus.publish([{ family: "apps" }, { family: "chats" }]);
    }

    return {
      apps: resultApps,
      registered,
      skipped,
    };
  });
}

export class MonorepoAppDiscoveryService {
  async discover(
    options?: MonorepoDiscoveryOptions,
  ): Promise<MonorepoDiscoveryResult> {
    return discoverAndRegisterMonorepoApps(options);
  }
}

export const monorepoAppDiscoveryService = new MonorepoAppDiscoveryService();
