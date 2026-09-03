import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";
import { AppBaseSchema } from "./app";

// =============================================================================
// Monorepo Schemas
// =============================================================================

export const DiscoverMonorepoAppsParamsSchema = z.object({
  appsDirectory: z.string().optional(),
});

export type DiscoverMonorepoAppsParams = z.infer<
  typeof DiscoverMonorepoAppsParamsSchema
>;

export const DiscoverMonorepoAppsResultSchema = z.object({
  apps: z.array(AppBaseSchema),
  registered: z.array(AppBaseSchema),
  skipped: z.array(AppBaseSchema),
});

export type DiscoverMonorepoAppsResult = z.infer<
  typeof DiscoverMonorepoAppsResultSchema
>;

export const ListMonorepoWorkspaceAppsParamsSchema = z
  .object({
    appsDirectory: z.string().optional(),
  })
  .optional();

export type ListMonorepoWorkspaceAppsParams = z.infer<
  typeof ListMonorepoWorkspaceAppsParamsSchema
>;

export const ListMonorepoWorkspaceAppsResultSchema = z.object({
  isConfigured: z.boolean(),
  apps: z.array(AppBaseSchema),
});

export type ListMonorepoWorkspaceAppsResult = z.infer<
  typeof ListMonorepoWorkspaceAppsResultSchema
>;

// =============================================================================
// Monorepo Contracts
// =============================================================================

export const monorepoContracts = {
  discoverApps: defineContract({
    channel: "monorepo:discover-apps",
    input: DiscoverMonorepoAppsParamsSchema,
    output: DiscoverMonorepoAppsResultSchema,
  }),
  listWorkspaceApps: defineContract({
    channel: "monorepo:list-workspace-apps",
    input: ListMonorepoWorkspaceAppsParamsSchema,
    output: ListMonorepoWorkspaceAppsResultSchema,
  }),
} as const;

// =============================================================================
// Monorepo Client
// =============================================================================

export const monorepoClient = createClient(monorepoContracts);
