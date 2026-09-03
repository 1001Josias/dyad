import log from "electron-log";
import { createTypedHandler } from "./base";
import { monorepoContracts } from "../types/monorepo";
import { monorepoAppDiscoveryService } from "../services/monorepo_app_discovery_service";

const logger = log.scope("monorepo-handlers");

export function registerMonorepoHandlers() {
  createTypedHandler(monorepoContracts.discoverApps, async (_event, params) => {
    logger.info("Discovering monorepo apps", params);
    return monorepoAppDiscoveryService.discover(params);
  });

  createTypedHandler(
    monorepoContracts.listWorkspaceApps,
    async (_event, params) => {
      logger.info("Listing monorepo workspace apps", params);
      return monorepoAppDiscoveryService.listWorkspaceApps(params);
    },
  );

  logger.debug("Registered monorepo IPC handlers");
}
