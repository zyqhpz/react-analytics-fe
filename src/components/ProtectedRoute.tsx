import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute() {
    const { isAuthenticated, isInitializing } = useAuth();
    const location = useLocation();

    if (isInitializing) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
                Loading session...
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    return <Outlet />;
}
