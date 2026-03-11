import { fetchCurrentUser } from "@/api/users";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/types/user";
import { useEffect, useState } from "react";

type CurrentUserBadgeProps = {
    className?: string;
};

export function CurrentUserBadge({ className }: CurrentUserBadgeProps) {
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadCurrentUser = async () => {
            try {
                const user = await fetchCurrentUser();
                if (isMounted) {
                    setCurrentUser(user);
                }
            } catch (err) {
                console.error("Failed to load current user:", err);
            }
        };

        loadCurrentUser();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-full border border-cyan-300/20 bg-slate-950/55 px-4 py-2 text-xs text-slate-200 shadow-[0_10px_30px_rgba(8,47,73,0.25)]",
                className,
            )}
        >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-100">
                {currentUser?.name?.trim()?.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="flex flex-col leading-tight">
                <span className="font-semibold text-slate-50">
                    {currentUser?.name || "Loading user"}
                </span>
                <span className="text-slate-300">
                    {currentUser?.role?.name || "Role"} /{" "}
                    {currentUser?.department?.name || "Department"}
                </span>
            </div>
        </div>
    );
}
