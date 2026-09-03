import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { useMonorepoWorkspaceApps } from "./useMonorepoWorkspaceApps";

const mocks = vi.hoisted(() => ({
  listWorkspaceApps: vi.fn(),
  settings: {
    monorepoRoot: "/repo",
    appsDirectory: "apps",
  } as Record<string, unknown> | null,
}));

vi.mock("@/ipc/types", () => ({
  ipc: {
    monorepo: {
      listWorkspaceApps: mocks.listWorkspaceApps,
    },
  },
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: mocks.settings,
  }),
}));

describe("useMonorepoWorkspaceApps", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("fetches and returns workspace apps via TanStack Query", async () => {
    mocks.listWorkspaceApps.mockResolvedValueOnce({
      isConfigured: true,
      apps: [
        { id: 1, name: "Finance", path: "/repo/apps/finance" },
        { id: 2, name: "Contracts", path: "/repo/apps/contracts" },
      ],
    });

    const { result } = renderHook(() => useMonorepoWorkspaceApps(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isConfigured).toBe(true);
    expect(result.current.workspaceApps).toHaveLength(2);
    expect(result.current.workspaceApps[0].name).toBe("Finance");
    expect(result.current.workspaceApps[1].name).toBe("Contracts");
    expect(mocks.listWorkspaceApps).toHaveBeenCalledWith(undefined);
  });

  it("returns isConfigured: false when workspace is unconfigured", async () => {
    mocks.listWorkspaceApps.mockResolvedValueOnce({
      isConfigured: false,
      apps: [],
    });

    const { result } = renderHook(() => useMonorepoWorkspaceApps(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isConfigured).toBe(false);
    expect(result.current.workspaceApps).toEqual([]);
  });
});
