import { CurrentUserBadge } from "@/components/CurrentUserBadge";
import { Link } from "react-router-dom";

const PLAYGROUND_URL = "http://localhost:8080/playground";

export default function GraphQLPlayground() {
    return (
        <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-cyan-950 text-white">
            <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-8">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.4)] backdrop-blur-xl">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                            GraphQL Workspace
                        </p>
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
                            Embedded Playground
                        </h1>
                        <p className="max-w-3xl text-sm text-slate-300">
                            This embeds the backend GraphQL UI from{" "}
                            <span className="font-medium text-slate-100">
                                {PLAYGROUND_URL}
                            </span>
                            . If the iframe is blocked, the backend must allow embedding for
                            this origin.
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        <CurrentUserBadge />
                        <div className="flex flex-wrap justify-end gap-2">
                            <Link
                                to="/dashboard"
                                className="rounded-lg border border-white/15 bg-slate-800/70 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700"
                            >
                                Dashboard
                            </Link>
                            <Link
                                to="/query-builder"
                                className="rounded-lg border border-white/15 bg-slate-800/70 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700"
                            >
                                Query Builder
                            </Link>
                            <a
                                href={PLAYGROUND_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/25"
                            >
                                Open In New Tab
                            </a>
                        </div>
                    </div>
                </div>

                <div className="flex min-h-[75vh] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 shadow-[0_20px_60px_rgba(2,6,23,0.5)]">
                    <iframe
                        title="GraphQL Playground"
                        src={PLAYGROUND_URL}
                        className="h-full min-h-[75vh] w-full border-0 bg-white"
                        referrerPolicy="no-referrer"
                    />
                </div>
            </div>
        </div>
    );
}
