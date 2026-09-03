import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as settingsModule from "../main/settings";
import {
  parseManagedMonorepoWorkspaceConfig,
  resolveManagedMonorepoAppsDirectory,
} from "./managed_monorepo_workspace";
import { getManagedMonorepoAppsDirectory } from "./paths";

describe("managed monorepo workspace configuration", () => {
  it("is optional and leaves existing behavior unconfigured", () => {
    expect(parseManagedMonorepoWorkspaceConfig({})).toBeNull();
    expect(
      resolveManagedMonorepoAppsDirectory({ customAppsFolder: "/tmp" }),
    ).toBeNull();
    expect(
      parseManagedMonorepoWorkspaceConfig({
        monorepoRoot: null,
        appsDirectory: null,
      }),
    ).toBeNull();
  });

  it("resolves the managed applications directory from the configured root", () => {
    const monorepoRoot = path.resolve("workspace", "repo");

    expect(
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot,
        appsDirectory: "apps",
      }),
    ).toBe(path.resolve(monorepoRoot, "apps"));
  });

  it("allows nested relative application directories that stay under the root", () => {
    const monorepoRoot = path.resolve("workspace", "repo");

    expect(
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot,
        appsDirectory: path.join("workspace", "apps"),
      }),
    ).toBe(path.resolve(monorepoRoot, "workspace", "apps"));
  });

  it("rejects a relative monorepoRoot", () => {
    expect(() =>
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot: path.join("workspace", "repo"),
        appsDirectory: "apps",
      }),
    ).toThrow("monorepoRoot must be an absolute path");
  });

  it("rejects an absolute appsDirectory", () => {
    const monorepoRoot = path.resolve("workspace", "repo");

    expect(() =>
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot,
        appsDirectory: path.resolve("outside", "apps"),
      }),
    ).toThrow("appsDirectory must be a relative path");
  });

  it("rejects traversal outside monorepoRoot", () => {
    const monorepoRoot = path.resolve("workspace", "repo");

    expect(() =>
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot,
        appsDirectory: path.join("..", "apps"),
      }),
    ).toThrow("appsDirectory must resolve to a directory under monorepoRoot");
  });

  it("rejects a partial configuration", () => {
    expect(() =>
      resolveManagedMonorepoAppsDirectory({ monorepoRoot: "/workspace/repo" }),
    ).toThrow();

    expect(() =>
      resolveManagedMonorepoAppsDirectory({ appsDirectory: "apps" }),
    ).toThrow();

    expect(() =>
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot: "/workspace/repo",
        appsDirectory: null,
      }),
    ).toThrow();
  });

  it("does not allow appsDirectory to resolve to the monorepo root itself", () => {
    const monorepoRoot = path.resolve("workspace", "repo");

    expect(() =>
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot,
        appsDirectory: ".",
      }),
    ).toThrow("appsDirectory must resolve to a directory under monorepoRoot");
  });

  it("preserves whitespace in configured paths without mutating them", () => {
    const monorepoRoot = path.resolve("workspace with spaces", "repo ");
    const appsDirectory = " apps ";
    const config = parseManagedMonorepoWorkspaceConfig({
      monorepoRoot,
      appsDirectory,
    });

    expect(config?.monorepoRoot).toBe(monorepoRoot);
    expect(config?.appsDirectory).toBe(appsDirectory);
  });

  it("rejects whitespace-only paths", () => {
    const monorepoRoot = path.resolve("workspace", "repo");
    expect(() =>
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot,
        appsDirectory: "   ",
      }),
    ).toThrow();

    expect(() =>
      resolveManagedMonorepoAppsDirectory({
        monorepoRoot: "   ",
        appsDirectory: "apps",
      }),
    ).toThrow();
  });

  describe("symlink containment", () => {
    it("rejects appsDirectory that symlinks outside monorepoRoot", () => {
      const tempBase = fs.mkdtempSync(
        path.join(os.tmpdir(), "dyad-test-monorepo-"),
      );
      try {
        const repoDir = path.join(tempBase, "repo");
        const outsideDir = path.join(tempBase, "outside");
        fs.mkdirSync(repoDir, { recursive: true });
        fs.mkdirSync(outsideDir, { recursive: true });

        const symlinkPath = path.join(repoDir, "symlinked-apps");
        fs.symlinkSync(outsideDir, symlinkPath, "dir");

        expect(() =>
          resolveManagedMonorepoAppsDirectory({
            monorepoRoot: repoDir,
            appsDirectory: "symlinked-apps",
          }),
        ).toThrow(
          "appsDirectory must resolve to a directory under monorepoRoot",
        );
      } finally {
        fs.rmSync(tempBase, { recursive: true, force: true });
      }
    });

    it("allows appsDirectory that symlinks within monorepoRoot", () => {
      const tempBase = fs.mkdtempSync(
        path.join(os.tmpdir(), "dyad-test-monorepo-"),
      );
      try {
        const repoDir = path.join(tempBase, "repo");
        const realAppsDir = path.join(repoDir, "packages", "apps");
        fs.mkdirSync(realAppsDir, { recursive: true });

        const symlinkPath = path.join(repoDir, "apps-link");
        fs.symlinkSync(realAppsDir, symlinkPath, "dir");

        expect(
          resolveManagedMonorepoAppsDirectory({
            monorepoRoot: repoDir,
            appsDirectory: "apps-link",
          }),
        ).toBe(path.resolve(repoDir, "apps-link"));
      } finally {
        fs.rmSync(tempBase, { recursive: true, force: true });
      }
    });
  });

  it("safely handles getManagedMonorepoAppsDirectory with default unconfigured settings", () => {
    expect(getManagedMonorepoAppsDirectory()).toBeNull();
  });

  it("safely returns null from getManagedMonorepoAppsDirectory when stored settings are invalid", () => {
    const spy = vi.spyOn(settingsModule, "readSettings").mockReturnValue({
      monorepoRoot: "relative-path",
      appsDirectory: "apps",
    } as any);

    try {
      expect(getManagedMonorepoAppsDirectory()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
