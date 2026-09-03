import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseManagedMonorepoWorkspaceConfig,
  resolveManagedMonorepoAppsDirectory,
} from "./managed_monorepo_workspace";

describe("managed monorepo workspace configuration", () => {
  it("is optional and leaves existing behavior unconfigured", () => {
    expect(parseManagedMonorepoWorkspaceConfig({})).toBeNull();
    expect(resolveManagedMonorepoAppsDirectory({ customAppsFolder: "/tmp" })).toBeNull();
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
});
