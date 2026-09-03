import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apps, chats } from "@/db/schema";
import * as settingsModule from "@/main/settings";

interface MockApp {
  id: number;
  name: string;
  path: string;
  installCommand?: string | null;
  startCommand?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let mockApps: MockApp[] = [];
let mockChats: Array<{ id: number; appId: number; chatMode: string | null }> =
  [];
let nextAppId = 1;
let nextChatId = 1;

vi.mock("@/db", () => ({
  db: {
    query: {
      apps: {
        findMany: vi.fn(async () => [...mockApps]),
        findFirst: vi.fn(async () => mockApps[0]),
      },
      chats: {
        findMany: vi.fn(async () => [...mockChats]),
      },
    },
    insert: (table: unknown) => ({
      values: (val: Record<string, unknown>) => {
        let executed = false;
        let result: unknown[] = [];
        const doExecute = () => {
          if (!executed) {
            executed = true;
            if (
              table === apps ||
              (table as { name?: string })?.name === "apps"
            ) {
              const app: MockApp = {
                id: nextAppId++,
                name: String(val.name),
                path: String(val.path),
                installCommand: (val.installCommand as string) ?? null,
                startCommand: (val.startCommand as string) ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              mockApps.push(app);
              result = [app];
            } else if (
              table === chats ||
              (table as { name?: string })?.name === "chats"
            ) {
              const chat = {
                id: nextChatId++,
                appId: Number(val.appId),
                chatMode: (val.chatMode as string) ?? null,
              };
              mockChats.push(chat);
              result = [chat];
            }
          }
          return result;
        };

        const promise = Promise.resolve().then(() => doExecute());
        return Object.assign(promise, {
          returning: async () => doExecute(),
        });
      },
    }),
  },
}));

vi.mock("@/window_infrastructure/main/query_invalidation_bus", () => ({
  queryInvalidationBus: {
    publish: vi.fn(),
  },
}));

vi.mock("@/ipc/handlers/chat_mode_resolution", () => ({
  getInitialChatModeForNewChat: vi.fn(async () => "build"),
}));

import {
  deriveAppDisplayName,
  discoverAndRegisterMonorepoApps,
  formatFolderNameAsDisplayName,
  isAppInMonorepoWorkspace,
  isCandidateAppDirectoryName,
  isPathMatchingApp,
  isValidApplicationDirectory,
  listMonorepoWorkspaceApps,
  monorepoAppDiscoveryService,
  registerMonorepoApp,
} from "./monorepo_app_discovery_service";

describe("monorepo_app_discovery_service", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(
      path.join(os.tmpdir(), "dyad-test-monorepo-discovery-"),
    );
    mockApps = [];
    mockChats = [];
    nextAppId = 1;
    nextChatId = 1;
  });

  afterEach(() => {
    fs.rmSync(tempBase, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("formatFolderNameAsDisplayName", () => {
    it("capitalizes standard lowercase folder names", () => {
      expect(formatFolderNameAsDisplayName("finance")).toBe("Finance");
      expect(formatFolderNameAsDisplayName("contracts")).toBe("Contracts");
      expect(formatFolderNameAsDisplayName("billing")).toBe("Billing");
    });

    it("uppercases common technical acronyms", () => {
      expect(formatFolderNameAsDisplayName("hr")).toBe("HR");
      expect(formatFolderNameAsDisplayName("api")).toBe("API");
      expect(formatFolderNameAsDisplayName("ui")).toBe("UI");
      expect(formatFolderNameAsDisplayName("cli")).toBe("CLI");
      expect(formatFolderNameAsDisplayName("sdk")).toBe("SDK");
      expect(formatFolderNameAsDisplayName("db")).toBe("DB");
      expect(formatFolderNameAsDisplayName("ai")).toBe("AI");
    });

    it("formats hyphenated and underscored folder names", () => {
      expect(formatFolderNameAsDisplayName("customer-management")).toBe(
        "Customer Management",
      );
      expect(formatFolderNameAsDisplayName("api-gateway")).toBe("API Gateway");
      expect(formatFolderNameAsDisplayName("admin_ui")).toBe("Admin UI");
      expect(formatFolderNameAsDisplayName("my-cool-app")).toBe("My Cool App");
    });

    it("preserves expressive casing if already camelCase or PascalCase", () => {
      expect(formatFolderNameAsDisplayName("Finance")).toBe("Finance");
      expect(formatFolderNameAsDisplayName("HR")).toBe("HR");
      expect(formatFolderNameAsDisplayName("MyAwesomeApp")).toBe(
        "MyAwesomeApp",
      );
    });
  });

  describe("deriveAppDisplayName", () => {
    it("prefers package.json displayName when present", async () => {
      const appDir = path.join(tempBase, "finance-app");
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify({ displayName: "Finance Portal" }),
      );

      const name = await deriveAppDisplayName(appDir);
      expect(name).toBe("Finance Portal");
    });

    it("formats package.json name when displayName is absent", async () => {
      const appDir = path.join(tempBase, "custom-pkg");
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify({ name: "@myorg/customer-service" }),
      );

      const name = await deriveAppDisplayName(appDir);
      expect(name).toBe("Customer Service");
    });

    it("falls back to directory name when package.json is missing or corrupted", async () => {
      const appDir = path.join(tempBase, "contracts");
      fs.mkdirSync(appDir, { recursive: true });

      expect(await deriveAppDisplayName(appDir)).toBe("Contracts");

      fs.writeFileSync(path.join(appDir, "package.json"), "{ invalid json");
      expect(await deriveAppDisplayName(appDir)).toBe("Contracts");
    });
  });

  describe("directory candidate validation", () => {
    it("identifies valid and invalid directory names", () => {
      expect(isCandidateAppDirectoryName("finance")).toBe(true);
      expect(isCandidateAppDirectoryName("contracts")).toBe(true);
      expect(isCandidateAppDirectoryName("hr")).toBe(true);

      // Hidden
      expect(isCandidateAppDirectoryName(".git")).toBe(false);
      expect(isCandidateAppDirectoryName(".turbo")).toBe(false);
      expect(isCandidateAppDirectoryName(".cache")).toBe(false);

      // Ignored build / dependency folders
      expect(isCandidateAppDirectoryName("node_modules")).toBe(false);
      expect(isCandidateAppDirectoryName("dist")).toBe(false);
      expect(isCandidateAppDirectoryName("build")).toBe(false);
      expect(isCandidateAppDirectoryName("out")).toBe(false);
      expect(isCandidateAppDirectoryName("temp")).toBe(false);
    });

    it("rejects files and validates real directories", async () => {
      const testDir = path.join(tempBase, "valid-app");
      const testFile = path.join(tempBase, "README.md");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, "hello");

      expect(await isValidApplicationDirectory(testDir)).toBe(true);
      expect(await isValidApplicationDirectory(testFile)).toBe(false);
      expect(
        await isValidApplicationDirectory(path.join(tempBase, "nonexistent")),
      ).toBe(false);
    });

    it("rejects symlinked app directories that escape monorepo root", async () => {
      const repoDir = path.join(tempBase, "repo");
      const appsDir = path.join(repoDir, "apps");
      const outsideDir = path.join(tempBase, "outside-app");

      fs.mkdirSync(appsDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });

      const symlinkPath = path.join(appsDir, "escaped-app");
      fs.symlinkSync(outsideDir, symlinkPath, "dir");

      expect(
        await isValidApplicationDirectory(symlinkPath, {
          monorepoRoot: repoDir,
        }),
      ).toBe(false);
    });

    it("allows symlinks within monorepo root", async () => {
      const repoDir = path.join(tempBase, "repo");
      const appsDir = path.join(repoDir, "apps");
      const internalPkgDir = path.join(repoDir, "packages", "service-a");

      fs.mkdirSync(appsDir, { recursive: true });
      fs.mkdirSync(internalPkgDir, { recursive: true });

      const symlinkPath = path.join(appsDir, "service-a");
      fs.symlinkSync(internalPkgDir, symlinkPath, "dir");

      expect(
        await isValidApplicationDirectory(symlinkPath, {
          monorepoRoot: repoDir,
        }),
      ).toBe(true);
    });
  });

  describe("isPathMatchingApp", () => {
    it("matches identical paths and handles case-insensitivity", () => {
      const p1 = "/workspace/repo/apps/finance";
      const p2 = "/workspace/repo/apps/finance";
      expect(isPathMatchingApp(p1, p2)).toBe(true);

      const pLower = "/workspace/repo/apps/finance";
      const pUpper = "/workspace/repo/apps/FINANCE";
      expect(isPathMatchingApp(pLower, pUpper)).toBe(true);
    });

    it("distinguishes different directories", () => {
      const p1 = "/workspace/repo/apps/finance";
      const p2 = "/workspace/repo/apps/contracts";
      expect(isPathMatchingApp(p1, p2)).toBe(false);
    });
  });

  describe("registerMonorepoApp", () => {
    it("registers a new app in-place with absolute path and initial chat", async () => {
      const appDir = path.join(tempBase, "finance");
      fs.mkdirSync(appDir, { recursive: true });

      const { app, alreadyExisted } = await registerMonorepoApp({
        path: appDir,
        name: "Finance",
      });

      expect(alreadyExisted).toBe(false);
      expect(app.name).toBe("Finance");
      expect(app.path).toBe(appDir);
      expect(path.isAbsolute(app.path)).toBe(true);

      // Verify no git repo was created
      expect(fs.existsSync(path.join(appDir, ".git"))).toBe(false);

      // Verify db row
      expect(mockApps).toHaveLength(1);
      expect(mockApps[0].id).toBe(app.id);

      // Verify initial chat created
      expect(mockChats).toHaveLength(1);
      expect(mockChats[0].appId).toBe(app.id);
    });

    it("is idempotent when called with the same directory", async () => {
      const appDir = path.join(tempBase, "contracts");
      fs.mkdirSync(appDir, { recursive: true });

      const res1 = await registerMonorepoApp({ path: appDir });
      expect(res1.alreadyExisted).toBe(false);

      const res2 = await registerMonorepoApp({ path: appDir });
      expect(res2.alreadyExisted).toBe(true);
      expect(res2.app.id).toBe(res1.app.id);

      expect(mockApps).toHaveLength(1);
      expect(mockChats).toHaveLength(1);
    });

    it("resolves name collisions with existing apps from other folders", async () => {
      // Seed an existing app with name "Finance" at an outside location
      mockApps.push({
        id: nextAppId++,
        name: "Finance",
        path: "/somewhere/else",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const appDir = path.join(tempBase, "finance");
      fs.mkdirSync(appDir, { recursive: true });

      const { app } = await registerMonorepoApp({
        path: appDir,
        name: "Finance",
      });

      expect(app.name).toBe("Finance 2");
      expect(app.path).toBe(appDir);
    });
  });

  describe("discoverAndRegisterMonorepoApps", () => {
    it("meets acceptance criteria: discovers and registers finance and contracts in-place without duplicates", async () => {
      const repoDir = path.join(tempBase, "repo");
      const appsDir = path.join(repoDir, "apps");
      const financeDir = path.join(appsDir, "finance");
      const contractsDir = path.join(appsDir, "contracts");

      fs.mkdirSync(financeDir, { recursive: true });
      fs.mkdirSync(contractsDir, { recursive: true });

      // Run 1: discovery
      const result1 = await discoverAndRegisterMonorepoApps({
        appsDirectory: appsDir,
      });

      expect(result1.apps).toHaveLength(2);
      expect(result1.registered).toHaveLength(2);
      expect(result1.skipped).toHaveLength(0);

      const registeredPaths = result1.apps.map((a) => a.path).sort();
      expect(registeredPaths).toEqual([contractsDir, financeDir].sort());

      const registeredNames = result1.apps.map((a) => a.name).sort();
      expect(registeredNames).toEqual(["Contracts", "Finance"]);

      // Verify no .git initialized in either directory
      expect(fs.existsSync(path.join(financeDir, ".git"))).toBe(false);
      expect(fs.existsSync(path.join(contractsDir, ".git"))).toBe(false);

      // Verify DB rows and chats
      expect(mockApps).toHaveLength(2);
      expect(mockChats).toHaveLength(2);

      // Run 2: idempotent discovery
      const result2 = await discoverAndRegisterMonorepoApps({
        appsDirectory: appsDir,
      });

      expect(result2.apps).toHaveLength(2);
      expect(result2.registered).toHaveLength(0);
      expect(result2.skipped).toHaveLength(2);

      // Still exactly 2 apps and 2 chats
      expect(mockApps).toHaveLength(2);
      expect(mockChats).toHaveLength(2);

      // Run 3: third idempotent call
      const result3 = await monorepoAppDiscoveryService.discover({
        appsDirectory: appsDir,
      });
      expect(result3.apps).toHaveLength(2);
      expect(result3.registered).toHaveLength(0);
      expect(result3.skipped).toHaveLength(2);
    });

    it("discovers finance, contracts, and hr, deriving expected names and absolute paths", async () => {
      const repoDir = path.join(tempBase, "repo");
      const appsDir = path.join(repoDir, "apps");
      const financeDir = path.join(appsDir, "finance");
      const contractsDir = path.join(appsDir, "contracts");
      const hrDir = path.join(appsDir, "hr");

      fs.mkdirSync(financeDir, { recursive: true });
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.mkdirSync(hrDir, { recursive: true });

      const result = await discoverAndRegisterMonorepoApps({
        appsDirectory: appsDir,
      });

      expect(result.apps).toHaveLength(3);
      const names = result.apps.map((a) => a.name).sort();
      expect(names).toEqual(["Contracts", "Finance", "HR"]);
    });

    it("ignores files and non-application folders inside the apps directory", async () => {
      const repoDir = path.join(tempBase, "repo");
      const appsDir = path.join(repoDir, "apps");
      const financeDir = path.join(appsDir, "finance");

      fs.mkdirSync(financeDir, { recursive: true });
      fs.mkdirSync(path.join(appsDir, "node_modules"), { recursive: true });
      fs.mkdirSync(path.join(appsDir, ".turbo"), { recursive: true });
      fs.mkdirSync(path.join(appsDir, "dist"), { recursive: true });
      fs.writeFileSync(path.join(appsDir, "README.md"), "# Apps");
      fs.writeFileSync(path.join(appsDir, ".DS_Store"), "binary");

      const result = await discoverAndRegisterMonorepoApps({
        appsDirectory: appsDir,
      });

      expect(result.apps).toHaveLength(1);
      expect(result.apps[0].name).toBe("Finance");
    });

    it("reads apps directory from stored settings when not explicitly provided", async () => {
      const repoDir = path.join(tempBase, "repo");
      const appsDir = path.join(repoDir, "apps");
      const app1 = path.join(appsDir, "finance");
      fs.mkdirSync(app1, { recursive: true });

      vi.spyOn(settingsModule, "readSettings").mockReturnValue({
        monorepoRoot: repoDir,
        appsDirectory: "apps",
      } as any);

      const result = await monorepoAppDiscoveryService.discover();

      expect(result.apps).toHaveLength(1);
      expect(result.apps[0].path).toBe(app1);
      expect(result.apps[0].name).toBe("Finance");
    });

    it("gracefully returns empty result when managed monorepo is unconfigured", async () => {
      vi.spyOn(settingsModule, "readSettings").mockReturnValue({} as any);

      const result = await monorepoAppDiscoveryService.discover();
      expect(result.apps).toEqual([]);
      expect(result.registered).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it("gracefully returns empty result when configured apps directory does not exist", async () => {
      vi.spyOn(settingsModule, "readSettings").mockReturnValue({
        monorepoRoot: tempBase,
        appsDirectory: "nonexistent-apps",
      } as any);

      const result = await monorepoAppDiscoveryService.discover();
      expect(result.apps).toEqual([]);
      expect(result.registered).toEqual([]);
      expect(result.skipped).toEqual([]);
    });
  });

  describe("isAppInMonorepoWorkspace", () => {
    it("returns true for a direct child directory of appsDirectory", () => {
      const appsDir = path.join(tempBase, "apps");
      const financeDir = path.join(appsDir, "finance");
      fs.mkdirSync(financeDir, { recursive: true });

      expect(isAppInMonorepoWorkspace(financeDir, appsDir)).toBe(true);
    });

    it("returns false for apps outside appsDirectory", () => {
      const appsDir = path.join(tempBase, "apps");
      const outsideDir = path.join(tempBase, "other", "finance");
      fs.mkdirSync(outsideDir, { recursive: true });

      expect(isAppInMonorepoWorkspace(outsideDir, appsDir)).toBe(false);
    });

    it("returns false for the appsDirectory itself", () => {
      const appsDir = path.join(tempBase, "apps");
      fs.mkdirSync(appsDir, { recursive: true });

      expect(isAppInMonorepoWorkspace(appsDir, appsDir)).toBe(false);
    });

    it("returns false for nested subdirectories under an app", () => {
      const appsDir = path.join(tempBase, "apps");
      const nestedDir = path.join(appsDir, "finance", "nested-pkg");
      fs.mkdirSync(nestedDir, { recursive: true });

      expect(isAppInMonorepoWorkspace(nestedDir, appsDir)).toBe(false);
    });

    it("returns false for ignored directories like node_modules", () => {
      const appsDir = path.join(tempBase, "apps");
      const nodeModulesDir = path.join(appsDir, "node_modules");
      fs.mkdirSync(nodeModulesDir, { recursive: true });

      expect(isAppInMonorepoWorkspace(nodeModulesDir, appsDir)).toBe(false);
    });
  });

  describe("listMonorepoWorkspaceApps", () => {
    it("returns isConfigured: false and empty list when unconfigured", async () => {
      vi.spyOn(settingsModule, "readSettings").mockReturnValue({} as any);

      const result = await listMonorepoWorkspaceApps();
      expect(result.isConfigured).toBe(false);
      expect(result.apps).toEqual([]);
    });

    it("returns only apps belonging to the configured monorepo workspace sorted by name", async () => {
      const repoDir = path.join(tempBase, "repo");
      const appsDir = path.join(repoDir, "apps");
      const financeDir = path.join(appsDir, "finance");
      const contractsDir = path.join(appsDir, "contracts");
      const hrDir = path.join(appsDir, "hr");
      const outsideDir = path.join(tempBase, "standalone-app");

      fs.mkdirSync(financeDir, { recursive: true });
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.mkdirSync(hrDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });

      vi.spyOn(settingsModule, "readSettings").mockReturnValue({
        monorepoRoot: repoDir,
        appsDirectory: "apps",
      } as any);

      await registerMonorepoApp({ path: financeDir, name: "Finance" });
      await registerMonorepoApp({ path: hrDir, name: "HR" });
      await registerMonorepoApp({ path: contractsDir, name: "Contracts" });
      await registerMonorepoApp({ path: outsideDir, name: "Standalone App" });

      const result = await monorepoAppDiscoveryService.listWorkspaceApps();
      expect(result.isConfigured).toBe(true);
      expect(result.apps).toHaveLength(3);
      expect(result.apps.map((a) => a.name)).toEqual([
        "Contracts",
        "Finance",
        "HR",
      ]);
      expect(result.apps.map((a) => a.name)).not.toContain("Standalone App");
    });
  });
});
