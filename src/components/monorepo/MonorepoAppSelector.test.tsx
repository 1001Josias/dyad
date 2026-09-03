import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonorepoAppSelector } from "./MonorepoAppSelector";

const mocks = vi.hoisted(() => ({
  selectedAppId: 1 as number | null,
  setSelectedAppId: vi.fn(),
  selectedChatId: 10 as number | null,
  setSelectedChatId: vi.fn(),
  openApp: vi.fn(),
  navigate: vi.fn(),
  pathname: "/",
  isConfigured: true,
  workspaceApps: [
    {
      id: 1,
      name: "Finance",
      path: "/repo/apps/finance",
      createdAt: new Date(),
      updatedAt: new Date(),
      githubOrg: null,
      githubRepo: null,
      githubBranch: null,
      supabaseProjectId: null,
      supabaseParentProjectId: null,
      supabaseOrganizationSlug: null,
      neonProjectId: null,
      neonDevelopmentBranchId: null,
      neonPreviewBranchId: null,
      neonActiveBranchId: null,
      selectedDatabaseBranchType: null,
      vercelProjectId: null,
      vercelProjectName: null,
      vercelDeploymentUrl: null,
      vercelTeamId: null,
      installCommand: null,
      startCommand: null,
      isFavorite: false,
      testingEnabled: false,
      collectionId: null,
    },
    {
      id: 2,
      name: "Contracts",
      path: "/repo/apps/contracts",
      createdAt: new Date(),
      updatedAt: new Date(),
      githubOrg: null,
      githubRepo: null,
      githubBranch: null,
      supabaseProjectId: null,
      supabaseParentProjectId: null,
      supabaseOrganizationSlug: null,
      neonProjectId: null,
      neonDevelopmentBranchId: null,
      neonPreviewBranchId: null,
      neonActiveBranchId: null,
      selectedDatabaseBranchType: null,
      vercelProjectId: null,
      vercelProjectName: null,
      vercelDeploymentUrl: null,
      vercelTeamId: null,
      installCommand: null,
      startCommand: null,
      isFavorite: false,
      testingEnabled: false,
      collectionId: null,
    },
    {
      id: 3,
      name: "HR",
      path: "/repo/apps/hr",
      createdAt: new Date(),
      updatedAt: new Date(),
      githubOrg: null,
      githubRepo: null,
      githubBranch: null,
      supabaseProjectId: null,
      supabaseParentProjectId: null,
      supabaseOrganizationSlug: null,
      neonProjectId: null,
      neonDevelopmentBranchId: null,
      neonPreviewBranchId: null,
      neonActiveBranchId: null,
      selectedDatabaseBranchType: null,
      vercelProjectId: null,
      vercelProjectName: null,
      vercelDeploymentUrl: null,
      vercelTeamId: null,
      installCommand: null,
      startCommand: null,
      isFavorite: false,
      testingEnabled: false,
      collectionId: null,
    },
  ],
  loading: false,
}));

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>();
  return {
    ...actual,
    useAtomValue: (_atom: unknown) => mocks.selectedAppId,
    useSetAtom: (_atom: unknown) => mocks.setSelectedAppId,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: () => ({
    location: { pathname: mocks.pathname },
  }),
}));

vi.mock("@/hooks/useMonorepoWorkspaceApps", () => ({
  useMonorepoWorkspaceApps: () => ({
    isConfigured: mocks.isConfigured,
    workspaceApps: mocks.workspaceApps,
    loading: mocks.loading,
    error: null,
    refreshWorkspaceApps: vi.fn(),
  }),
}));

vi.mock("@/hooks/useOpenApp", () => ({
  useOpenApp: () => mocks.openApp,
}));

describe("MonorepoAppSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isConfigured = true;
    mocks.selectedAppId = 1;
    mocks.pathname = "/";
    mocks.loading = false;
  });

  it("renders null when monorepo workspace is unconfigured", () => {
    mocks.isConfigured = false;
    const { container } = render(<MonorepoAppSelector />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Applications header, app names, and + New app button", () => {
    render(<MonorepoAppSelector />);

    expect(
      screen.getByTestId("monorepo-app-selector-title").textContent,
    ).toContain("Applications");
    expect(screen.getByText("Finance")).toBeDefined();
    expect(screen.getByText("Contracts")).toBeDefined();
    expect(screen.getByText("HR")).toBeDefined();
    expect(screen.getByTestId("monorepo-new-app-button").textContent).toContain(
      "+ New app",
    );
  });

  it("does not expose filesystem paths to the user", () => {
    const { container } = render(<MonorepoAppSelector />);

    // Check that path strings never appear in rendered text content
    expect(container.textContent).not.toContain("/repo/apps/finance");
    expect(container.textContent).not.toContain("/repo/apps/contracts");
    expect(container.textContent).not.toContain("/repo/apps/hr");
    expect(container.textContent).not.toContain("appPath");
  });

  it("switches to the selected app when clicked via openApp", () => {
    render(<MonorepoAppSelector />);

    const contractsButton = screen.getByTestId("monorepo-app-item-2");
    fireEvent.click(contractsButton);

    expect(mocks.openApp).toHaveBeenCalledWith(2);
  });

  it("invokes custom onSelectApp callback when provided", () => {
    const onSelectApp = vi.fn();
    render(<MonorepoAppSelector onSelectApp={onSelectApp} />);

    const contractsButton = screen.getByTestId("monorepo-app-item-2");
    fireEvent.click(contractsButton);

    expect(onSelectApp).toHaveBeenCalledWith(2);
    expect(mocks.openApp).not.toHaveBeenCalled();
  });

  it("handles navigation in chat route when switching apps", () => {
    mocks.pathname = "/chat";
    render(<MonorepoAppSelector />);

    const contractsButton = screen.getByTestId("monorepo-app-item-2");
    fireEvent.click(contractsButton);

    expect(mocks.setSelectedAppId).toHaveBeenCalledWith(2);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/chat",
      search: { appId: 2 },
    });
  });

  it("handles + New app button click", () => {
    const onNewApp = vi.fn();
    render(<MonorepoAppSelector onNewApp={onNewApp} />);

    const newAppButton = screen.getByTestId("monorepo-new-app-button");
    fireEvent.click(newAppButton);

    expect(onNewApp).toHaveBeenCalled();
  });

  it("navigates to / when + New app is clicked without custom callback", () => {
    render(<MonorepoAppSelector />);

    const newAppButton = screen.getByTestId("monorepo-new-app-button");
    fireEvent.click(newAppButton);

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("renders popover variant with trigger and opens list on click", () => {
    render(<MonorepoAppSelector variant="popover" />);

    const trigger = screen.getByTestId("monorepo-app-selector-trigger");
    expect(trigger.textContent).toContain("Finance");

    fireEvent.click(trigger);

    expect(
      screen.getByTestId("monorepo-app-selector-title").textContent,
    ).toContain("Applications");
    expect(screen.getByText("Contracts")).toBeDefined();
  });
});
