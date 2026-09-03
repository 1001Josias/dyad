import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";

export function useMonorepoWorkspaceApps() {
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  const monorepoRoot = settings?.monorepoRoot ?? null;
  const appsDirectory = settings?.appsDirectory ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: [
      ...queryKeys.monorepo.workspaceApps,
      monorepoRoot,
      appsDirectory,
    ],
    queryFn: async () => {
      return await ipc.monorepo.listWorkspaceApps(undefined);
    },
  });

  const refreshWorkspaceApps = () => {
    return queryClient.invalidateQueries({ queryKey: queryKeys.monorepo.all });
  };

  return {
    isConfigured: data?.isConfigured ?? false,
    workspaceApps: data?.apps ?? [],
    loading: isLoading,
    error: error ?? null,
    refreshWorkspaceApps,
  };
}
