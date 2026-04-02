import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "border border-white/10 bg-slate-950 text-slate-50 shadow-lg",
          title: "text-slate-50",
          description: "text-slate-300",
          content: "text-slate-50",
          success:
            "border-emerald-400/30 bg-emerald-950 text-emerald-50 [&_[data-title]]:text-emerald-50 [&_[data-description]]:text-emerald-200",
          info: "border-cyan-400/30 bg-cyan-950 text-cyan-50 [&_[data-title]]:text-cyan-50 [&_[data-description]]:text-cyan-200",
          warning:
            "border-amber-400/30 bg-amber-950 text-amber-50 [&_[data-title]]:text-amber-50 [&_[data-description]]:text-amber-200",
          error:
            "border-rose-400/35 bg-rose-950 text-rose-50 [&_[data-title]]:text-rose-50 [&_[data-description]]:text-rose-200",
          closeButton:
            "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
