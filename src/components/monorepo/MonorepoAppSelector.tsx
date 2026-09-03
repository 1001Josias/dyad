import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Folder, Plus } from "lucide-react";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useMonorepoWorkspaceApps } from "@/hooks/useMonorepoWorkspaceApps";
import { useOpenApp } from "@/hooks/useOpenApp";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MonorepoAppSelectorProps {
  className?: string;
  variant?: "inline" | "popover";
  onSelectApp?: (appId: number) => void;
  onNewApp?: () => void;
}

export function MonorepoAppSelector({
  className,
  variant = "inline",
  onSelectApp,
  onNewApp,
}: MonorepoAppSelectorProps) {
  const { isConfigured, workspaceApps, loading } = useMonorepoWorkspaceApps();
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const openApp = useOpenApp();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!isConfigured) {
    return null;
  }

  const isChatRoute = routerState.location.pathname === "/chat";

  const handleSelectApp = (appId: number) => {
    setPopoverOpen(false);
    if (onSelectApp) {
      onSelectApp(appId);
      return;
    }

    if (isChatRoute) {
      setSelectedAppId(appId);
      setSelectedChatId(null);
      navigate({ to: "/chat", search: { appId } });
    } else {
      openApp(appId);
    }
  };

  const handleNewApp = () => {
    setPopoverOpen(false);
    if (onNewApp) {
      onNewApp();
      return;
    }
    navigate({ to: "/" });
  };

  const selectedApp = workspaceApps.find((app) => app.id === selectedAppId);

  const listContent = (
    <div className="flex flex-col space-y-2">
      <div
        className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        data-testid="monorepo-app-selector-title"
      >
        Applications
      </div>

      {loading ? (
        <div className="py-2 px-3 text-xs text-muted-foreground">
          Loading applications...
        </div>
      ) : workspaceApps.length === 0 ? (
        <div className="py-2 px-3 text-xs text-muted-foreground">
          No applications found
        </div>
      ) : (
        <div
          className="flex flex-col space-y-1"
          data-testid="monorepo-app-list"
        >
          {workspaceApps.map((app) => {
            const isSelected = selectedAppId === app.id;
            return (
              <Button
                key={app.id}
                variant={isSelected ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start text-left h-8 px-2 font-normal gap-2",
                  isSelected &&
                    "font-semibold bg-accent text-accent-foreground",
                )}
                onClick={() => handleSelectApp(app.id)}
                data-testid={`monorepo-app-item-${app.id}`}
                data-app-id={app.id}
                data-app-name={app.name}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{app.name}</span>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </Button>
            );
          })}
        </div>
      )}

      <div className="pt-1 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-8 px-2 text-xs font-medium"
          onClick={handleNewApp}
          data-testid="monorepo-new-app-button"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>+ New app</span>
        </Button>
      </div>
    </div>
  );

  if (variant === "popover") {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "no-app-region-drag h-7 px-2 gap-1.5 flex items-center font-medium text-xs cursor-pointer",
                className,
              )}
              data-testid="monorepo-app-selector-trigger"
              aria-label={
                selectedApp
                  ? `Select application: current is ${selectedApp.name}`
                  : "Select application"
              }
            />
          }
        >
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-36 truncate">
            {selectedApp ? selectedApp.name : "Applications"}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent
          className="w-60 p-2 shadow-lg"
          align="start"
          sideOffset={6}
          data-testid="monorepo-app-selector-popover"
        >
          {listContent}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div
      className={cn("flex flex-col space-y-1 p-2", className)}
      data-testid="monorepo-app-selector"
    >
      {listContent}
    </div>
  );
}
