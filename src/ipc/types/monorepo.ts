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

// =============================================================================
// Monorepo Contracts
// =============================================================================

export const monorepoContracts = {
  discoverApps: defineContract({
    channel: "monorepo:discover-apps",
    input: DiscoverMonorepoAppsParamsSchema,
    output: DiscoverMonorepoAppsResultSchema,
  }),
} as const;

// =============================================================================
// Monorepo Client
// =============================================================================

export const monorepoClient = createClient(monorepoContracts);
