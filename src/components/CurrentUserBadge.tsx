import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CurrentUserBadgeProps = {
  className?: string;
};

export function CurrentUserBadge({ className }: CurrentUserBadgeProps) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("You have been logged out.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error("Logout failed.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleChangePasswordRoute = () => {
    navigate("/change-password");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-full border border-cyan-300/20 bg-slate-950/55 px-4 py-2 text-left text-xs text-slate-200 shadow-[0_10px_30px_rgba(8,47,73,0.25)] transition hover:bg-slate-900/80",
            className,
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-100">
            {currentUser?.name?.trim()?.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-slate-50">
              {currentUser?.name || "Signed-in user"}
            </span>
            <span className="text-slate-300">
              {currentUser?.role?.name ||
                currentUser?.email ||
                "Session active"}{" "}
              / {currentUser?.department?.name || "Workspace"}
            </span>
          </div>
          <ChevronDown className="size-4 text-slate-300" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border-white/10 bg-slate-950/95 text-slate-100"
      >
        <DropdownMenuLabel>{currentUser?.name || "Account"}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={handleChangePasswordRoute}
            className="cursor-pointer focus:bg-slate-800 focus:text-white"
          >
            <KeyRound />
            Change Password
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer focus:bg-slate-800 focus:text-white"
          >
            <LogOut />
            Logout
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
