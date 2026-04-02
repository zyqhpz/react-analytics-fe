import { resetPassword } from "@/api/auth";
import { API_BASE_URL } from "@/api/base";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const inputClassName =
    "w-full rounded-xl border border-slate-300 bg-[#e8eefc] px-4 py-3 text-[0.95rem] text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-[#80c5d2] focus:ring-4 focus:ring-[#80c5d2]/20";

const labelClassName = "mb-2 block text-[0.9rem] font-medium text-slate-700";

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isForgotPasswordMode = location.pathname === "/forgot-password";
    const isChangePasswordMode = location.pathname === "/change-password";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const logoUrl = `${API_BASE_URL}/assets/analytix_logo.png`;

    const redirectTo =
        (location.state as { from?: { pathname?: string } } | null)?.from
            ?.pathname || "/dashboard";

    const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setIsSubmitting(true);
            await login(email, password);
            toast.success("Login successful.");
            navigate(redirectTo, { replace: true });
        } catch (error) {
            toast.error("Login failed.", {
                description:
                    error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotPasswordNavigation = () => {
        navigate("/forgot-password");
    };

    const handleForgotPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setIsSubmitting(true);
            toast.info("Forgot password flow is routed and ready for its API integration.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (password !== confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }

        try {
            setIsSubmitting(true);
            await resetPassword({
                password,
                confirm_password: confirmPassword,
            });
            toast.success("Password updated.");
            navigate("/dashboard", { replace: true });
        } catch (error) {
            toast.error("Password reset failed.", {
                description:
                    error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f8f8f8] px-6 py-8">
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
                <div className="w-full max-w-127.5">
                    <div className="mb-8 flex justify-center">
                        <img
                            src={logoUrl}
                            alt="Analytix logo"
                            className="h-auto w-full max-w-52.5 object-contain"
                        />
                    </div>

                    <form
                        className="mx-auto w-full max-w-127.5"
                        onSubmit={
                            isChangePasswordMode
                                ? handleResetPassword
                                : isForgotPasswordMode
                                    ? handleForgotPasswordSubmit
                                    : handleLogin
                        }
                    >
                        {!isChangePasswordMode ? (
                            <div className="mb-5">
                                <label htmlFor="email" className={labelClassName}>
                                    Email
                                </label>
                                <input
                                    id="email"
                                    className={inputClassName}
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="user@example.com"
                                    required
                                />
                            </div>
                        ) : null}

                        <div className="mb-3 flex items-center justify-between gap-4">
                            <label
                                htmlFor="password"
                                className="text-[0.9rem] font-medium text-slate-700"
                            >
                                {isChangePasswordMode ? "New Password" : "Password"}
                            </label>
                            {!isForgotPasswordMode && !isChangePasswordMode ? (
                                <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    onClick={handleForgotPasswordNavigation}
                                    className="h-auto cursor-pointer px-0 py-0 text-[0.9rem] font-medium text-[#80c5d2] no-underline hover:text-[#67b6c5] hover:no-underline"
                                >
                                    Forgot Password
                                </Button>
                            ) : null}
                        </div>

                        {!isForgotPasswordMode ? (
                            <div className={`${isChangePasswordMode ? "mb-5" : "mb-10"} flex overflow-hidden rounded-xl border border-slate-300 bg-white`}>
                                <input
                                    id="password"
                                    className="min-w-0 flex-1 bg-[#e8eefc] px-4 py-3 text-[0.95rem] text-slate-900 outline-none placeholder:text-slate-500"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="password"
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className="h-auto w-14 cursor-pointer rounded-none bg-white text-slate-500 hover:bg-white hover:text-slate-700"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </Button>
                            </div>
                        ) : null}

                        {isChangePasswordMode ? (
                            <>
                                <div className="mb-3 flex items-center justify-between gap-4">
                                    <label
                                        htmlFor="confirm-password"
                                        className="text-[0.9rem] font-medium text-slate-700"
                                    >
                                        Confirm Password
                                    </label>
                                </div>

                                <div className="mb-10 flex overflow-hidden rounded-xl border border-slate-300 bg-white">
                                    <input
                                        id="confirm-password"
                                        className="min-w-0 flex-1 bg-[#e8eefc] px-4 py-3 text-[0.95rem] text-slate-900 outline-none placeholder:text-slate-500"
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(event) =>
                                            setConfirmPassword(event.target.value)
                                        }
                                        placeholder="confirm password"
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() =>
                                            setShowConfirmPassword((prev) => !prev)
                                        }
                                        className="h-auto w-14 cursor-pointer rounded-none bg-white text-slate-500 hover:bg-white hover:text-slate-700"
                                        aria-label={
                                            showConfirmPassword
                                                ? "Hide confirm password"
                                                : "Show confirm password"
                                        }
                                    >
                                        {showConfirmPassword ? (
                                            <EyeOff size={20} />
                                        ) : (
                                            <Eye size={20} />
                                        )}
                                    </Button>
                                </div>
                            </>
                        ) : null}

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-auto w-full cursor-pointer rounded-xl bg-[#86c6cf] px-6 py-3 text-[0.95rem] font-semibold text-white hover:bg-[#74bbc6] disabled:cursor-not-allowed"
                        >
                            {isSubmitting
                                ? isChangePasswordMode
                                    ? "Updating..."
                                    : isForgotPasswordMode
                                        ? "Submitting..."
                                        : "Signing in..."
                                : isChangePasswordMode
                                    ? "Update Password"
                                    : isForgotPasswordMode
                                        ? "Continue"
                                        : "Sign in"}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
