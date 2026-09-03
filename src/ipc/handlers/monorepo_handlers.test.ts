import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type HandlerTestHarness,
  setupHandlerTestHarness,
} from "@/testing/handler_test_harness";
import { registerMonorepoHandlers } from "./monorepo_handlers";
import type {
  DiscoverMonorepoAppsResult,
  ListMonorepoWorkspaceAppsResult,
} from "../types/monorepo";
import { registerMonorepoApp } from "../services/monorepo_app_discovery_service";

describe("registerMonorepoHandlers", () => {
  let harness: HandlerTestHarness;
  let tempBase: string;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(
      path.join(os.tmpdir(), "dyad-test-monorepo-handler-"),
    );
    harness = setupHandlerTestHarness();
    registerMonorepoHandlers();
  });

  afterEach(() => {
    harness.dispose();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  it("handles monorepo:discover-apps IPC invocation", async () => {
    const appsDir = path.join(tempBase, "apps");
    const financeDir = path.join(appsDir, "finance");
    fs.mkdirSync(financeDir, { recursive: true });

    const result = await harness.invokeHandler<DiscoverMonorepoAppsResult>(
      "monorepo:discover-apps",
      { appsDirectory: appsDir },
    );

    expect(result.apps).toHaveLength(1);
    expect(result.apps[0].name).toBe("Finance");
    expect(result.apps[0].path).toBe(financeDir);
    expect(result.registered).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    // Call again, should be skipped
    const result2 = await harness.invokeHandler<DiscoverMonorepoAppsResult>(
      "monorepo:discover-apps",
      { appsDirectory: appsDir },
    );
    expect(result2.apps).toHaveLength(1);
    expect(result2.registered).toHaveLength(0);
    expect(result2.skipped).toHaveLength(1);
  });

  it("handles monorepo:discover-apps when unconfigured", async () => {
    const result = await harness.invokeHandler<DiscoverMonorepoAppsResult>(
      "monorepo:discover-apps",
      undefined,
    );

    expect(result.apps).toEqual([]);
    expect(result.registered).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("discovers multiple apps in a monorepo workspace directory", async () => {
    const appsDir = path.join(tempBase, "apps");
    const financeDir = path.join(appsDir, "finance");
    const contractsDir = path.join(appsDir, "contracts");
    const hrDir = path.join(appsDir, "hr");

    fs.mkdirSync(financeDir, { recursive: true });
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.mkdirSync(hrDir, { recursive: true });

    const result = await harness.invokeHandler<DiscoverMonorepoAppsResult>(
      "monorepo:discover-apps",
      { appsDirectory: appsDir },
    );

    expect(result.apps).toHaveLength(3);
    const names = result.apps.map((a) => a.name).sort();
    expect(names).toEqual(["Contracts", "Finance", "HR"]);
    expect(result.registered).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });

  it("handles monorepo:list-workspace-apps when unconfigured", async () => {
    const result = await harness.invokeHandler<ListMonorepoWorkspaceAppsResult>(
      "monorepo:list-workspace-apps",
      undefined,
    );

    expect(result.isConfigured).toBe(false);
    expect(result.apps).toEqual([]);
  });

  it("handles monorepo:list-workspace-apps returning only apps in the configured workspace", async () => {
    const appsDir = path.join(tempBase, "apps");
    const outsideDir = path.join(tempBase, "outside-app");
    const financeDir = path.join(appsDir, "finance");
    const contractsDir = path.join(appsDir, "contracts");

    fs.mkdirSync(financeDir, { recursive: true });
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Register apps
    await registerMonorepoApp({ path: financeDir, name: "Finance" });
    await registerMonorepoApp({ path: contractsDir, name: "Contracts" });
    await registerMonorepoApp({ path: outsideDir, name: "Outside App" });

    const result = await harness.invokeHandler<ListMonorepoWorkspaceAppsResult>(
      "monorepo:list-workspace-apps",
      { appsDirectory: appsDir },
    );

    expect(result.isConfigured).toBe(true);
    expect(result.apps).toHaveLength(2);
    expect(result.apps.map((a) => a.name)).toEqual(["Contracts", "Finance"]);
    expect(result.apps.map((a) => a.name)).not.toContain("Outside App");
  });
});
