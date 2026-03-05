import { getAuthHeaders } from "@/api/client";
import * as echarts from "echarts";
import { GridStack, type GridStackNode, type GridStackWidget } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { v7 as uuidv7 } from "uuid";

import type { Query, QueryRow } from "@/api/queries";
import { fetchQueryWithData, fetchSavedQueries } from "@/api/queries";
import { toast } from "sonner";

type ChartType = "line" | "bar" | "pie";

type WidgetPosition = { x: number; y: number; w: number; h: number };

type BackendWidget = {
    id: string;
    widget_type: ChartType;
    position: WidgetPosition;
    query?: Query;
};

type ChartsMeta = {
    instance: echarts.ECharts;
    type: ChartType;
    observer?: ResizeObserver;
};

const DASHBOARD_ID = "019c7377-64b0-75c7-93e3-8f2152715aa5";

/**
 * Build ECharts option dynamically based on query.data
 * This supports generic SQL results like:
 *
 * [
 *   { type: "CreditCard", sum_amount: 308 },
 *   { type: "FPX", sum_amount: 86790 }
 * ]
 */
function buildOption(
    type: ChartType,
    data: QueryRow[] = [],
    schema?: string[],
): echarts.EChartsOption {
    if (!data.length) {
        return {
            title: {
                text: "No Data",
                left: "center",
                textStyle: { color: "#cbd5e1" },
            },
        };
    }

    let categoryKey = "";
    let valueKey = "";

    if (schema && schema.length >= 2) {
        // use backend schema
        categoryKey = schema[0];
        valueKey = schema[1];
    } else {
        // fallback detection
        const sample = data[0];
        const keys = Object.keys(sample);

        for (const k of keys) {
            if (typeof sample[k] === "number") {
                valueKey = k;
            } else {
                categoryKey = k;
            }
        }
    }

    if (type === "pie") {
        return {
            tooltip: { trigger: "item" },
            series: [
                {
                    type: "pie",
                    radius: "65%",
                    data: data.map((row) => ({
                        name: row[categoryKey],
                        value: row[valueKey],
                    })),
                },
            ],
        };
    }

    return {
        tooltip: { trigger: "axis" },
        xAxis: {
            type: "category",
            data: data.map((row) => row[categoryKey]),
            axisLabel: { color: "#cbd5e1" },
        },
        yAxis: {
            type: "value",
            axisLabel: { color: "#cbd5e1" },
        },
        series: [
            {
                type,
                data: data.map((row) => row[valueKey]),
                smooth: type === "line",
            } as any,
        ],
    };
}

export default function PopulationDashboard() {
    const gridContainerRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<GridStack | null>(null);

    // chart instances by widget id
    const chartsRef = useRef<Record<string, ChartsMeta>>({});

    const [dashboardName, setDashboardName] = useState("My Dashboard");
    const [dashboardDescription, setDashboardDescription] = useState("");

    const [showModal, setShowModal] = useState(false);
    const [selectedChartType, setSelectedChartType] = useState<ChartType>("line");

    const [saving, setSaving] = useState(false);

    const [queries, setQueries] = useState<Query[]>([]);
    const [selectedQueryId, setSelectedQueryId] = useState<string>("");

    const navigate = useNavigate();

    const resizeAllCharts = useCallback(() => {
        const charts = chartsRef.current;
        Object.values(charts).forEach((meta) => meta?.instance?.resize?.());
    }, []);

    const destroyChart = useCallback((id: string) => {
        const meta = chartsRef.current[id];
        if (!meta) return;
        meta.observer?.disconnect?.();
        meta.instance?.dispose?.();
        delete chartsRef.current[id];
    }, []);

    const deleteWidget = useCallback(
        (el: HTMLElement) => {
            const node = (el as any).gridstackNode as GridStackNode | undefined;
            const id =
                node?.id?.toString() ||
                el.querySelector(".grid-stack-item-content [id]")?.getAttribute("id") ||
                el.querySelector("[id]")?.getAttribute("id");

            if (id) destroyChart(id);

            gridRef.current?.removeWidget(el);
        },
        [destroyChart],
    );

    const getBottomY = useCallback(() => {
        const grid = gridRef.current;
        if (!grid || !grid.engine.nodes.length) return 0;
        return Math.max(...grid.engine.nodes.map((n) => (n.y ?? 0) + (n.h ?? 0)));
    }, []);

    const ensureWidgetDom = useCallback((id: string, title: string) => {
        const wrapper = document.createElement("div");

        wrapper.innerHTML = `
      <div class="grid-stack-item">
        <div class="grid-stack-item-content bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl border border-white/10 flex flex-col h-full">
          <div class="px-4 py-3 border-b border-white/10 font-semibold text-slate-200 flex justify-between items-center">
            <span>${title}</span>
            <button class="delete-widget text-red-400 hover:text-red-300 text-sm" type="button">✕</button>
          </div>
          <div id="${id}" class="flex-1 min-h-50"></div>
        </div>
      </div>
    `;

        return wrapper.firstElementChild as HTMLElement;
    }, []);

    /**
     * Initialize chart instance
     * Chart now renders directly from API query.data
     */
    const initChart = useCallback(
        (id: string, type: ChartType, data: QueryRow[] = [], schema?: string[]) => {
            const el = document.getElementById(id);
            if (!el) return;

            destroyChart(id);

            const chart = echarts.init(el);

            chart.setOption(buildOption(type, data, schema));

            const observer = new ResizeObserver(() => chart.resize());
            observer.observe(el);

            chartsRef.current[id] = {
                instance: chart,
                type,
                observer,
            };
        },
        [destroyChart],
    );

    const addWidget = useCallback(
        (opts: {
            id: string;
            x: number;
            y: number;
            w: number;
            h: number;
            title: string;
        }) => {
            const grid = gridRef.current;
            const container = gridContainerRef.current;
            if (!grid || !container) return;

            const el = ensureWidgetDom(opts.id, opts.title);

            container.appendChild(el);

            grid.makeWidget(el, {
                x: opts.x,
                y: opts.y,
                w: opts.w,
                h: opts.h,
                id: opts.id,
            } as GridStackWidget);

            return el;
        },
        [ensureWidgetDom],
    );

    useEffect(() => {
        if (!showModal) return;

        (async () => {
            try {
                const q = await fetchSavedQueries();
                setQueries(q);
            } catch (err) {
                toast.error("Failed to load queries: " + (err as Error).message);
            }
        })();
    }, [showModal]);

    const confirmAddChart = useCallback(async () => {
        setShowModal(false);

        const id = uuidv7();
        const type = selectedChartType;

        const selectedQuery = queries.find((q) => q.id === selectedQueryId);

        if (!selectedQuery) return;

        const bottomY = getBottomY();

        addWidget({
            id,
            x: 0,
            y: bottomY,
            w: 6,
            h: 3,
            title: selectedQuery?.name || `${type.toUpperCase()} CHART`,
        });

        // initialize empty chart first
        requestAnimationFrame(() => {
            initChart(id, type, []);
            resizeAllCharts();

            const meta = chartsRef.current[id];
            meta?.instance?.showLoading({
                text: "Running query...",
            });
        });

        try {
            const result = await fetchQueryWithData(selectedQueryId);

            const rows = result.data ?? [];
            const schema = result.result_schema ?? [];

            const meta = chartsRef.current[id];

            if (!meta) return;

            meta.instance.hideLoading();

            meta.instance.setOption(buildOption(type, rows, schema));
        } catch (err) {
            toast.error("Query failed: " + (err as Error).message);

            const meta = chartsRef.current[id];

            meta?.instance?.hideLoading();

            meta?.instance?.setOption({
                title: {
                    text: "Query Failed",
                    left: "center",
                    textStyle: { color: "#f87171" },
                },
            });
        }
    }, [
        addWidget,
        getBottomY,
        initChart,
        resizeAllCharts,
        selectedChartType,
        selectedQueryId,
        queries,
    ]);

    const saveDashboard = useCallback(async () => {
        const grid = gridRef.current;
        if (!grid) return;

        try {
            setSaving(true);

            const layout = grid.save(false, false) as GridStackWidget[];

            const widgets = layout.map((item) => ({
                id: item.id,
                type: chartsRef.current[item.id!]?.type,
                position: {
                    x: item.x!,
                    y: item.y!,
                    w: item.w!,
                    h: item.h!,
                },
            }));

            const payload = {
                dashboard_id: DASHBOARD_ID,
                widgets,
            };

            await fetch("http://localhost:8080/api/v1/widgets", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload),
            });

            alert("✅ Dashboard saved successfully!");
        } catch (err) {
            console.error("❌ Failed to save dashboard:", err);
            alert("Failed to save dashboard");
        } finally {
            setSaving(false);
        }
    }, []);

    /**
     * Load dashboard configuration + query results from API
     */
    const loadDashboardFromAPI = useCallback(async () => {
        const grid = gridRef.current;
        const container = gridContainerRef.current;

        if (!grid || !container) return;

        const response = await fetch(
            `http://localhost:8080/api/v1/dashboards/${DASHBOARD_ID}?include_data=true`,
            {
                headers: getAuthHeaders(),
            },
        );

        const result = await response.json();

        if (response.status !== 200) {
            console.error("Failed to load dashboard:", result);
            return;
        }

        setDashboardName(result.data?.name || "My Dashboard");
        setDashboardDescription(result.data?.description || "");

        const list: BackendWidget[] = result?.data?.widgets ?? [];
        if (!list.length) return;

        Object.keys(chartsRef.current).forEach(destroyChart);

        grid.removeAll();
        container.innerHTML = "";

        for (const w of list) {
            const id = w.id;
            const type = w.widget_type;
            const data = w.query?.data ?? [];
            const schema = w.query?.result_schema;

            addWidget({
                id,
                x: w.position.x,
                y: w.position.y,
                w: w.position.w,
                h: w.position.h,
                title: w.query?.name || `${type.toUpperCase()} CHART`,
            });

            requestAnimationFrame(() => initChart(id, type, data, schema));
        }

        requestAnimationFrame(() => resizeAllCharts());
    }, [addWidget, destroyChart, initChart, resizeAllCharts]);

    useEffect(() => {
        const container = gridContainerRef.current;
        if (!container) return;

        const grid = GridStack.init(
            {
                column: 12,
                cellHeight: 120,
                margin: 15,
                float: true,
            },
            container,
        );

        gridRef.current = grid;

        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;

            if (!target) return;

            if (target.classList.contains("delete-widget")) {
                const widgetEl = target.closest(".grid-stack-item") as HTMLElement;

                if (widgetEl) deleteWidget(widgetEl);
            }
        };

        container.addEventListener("click", onClick);

        grid.on("resize", () => resizeAllCharts());
        grid.on("resizestop", () => resizeAllCharts());
        grid.on("dragstop", () => resizeAllCharts());

        window.addEventListener("resize", resizeAllCharts);

        loadDashboardFromAPI();

        return () => {
            container.removeEventListener("click", onClick);
            window.removeEventListener("resize", resizeAllCharts);

            Object.keys(chartsRef.current).forEach(destroyChart);

            grid.destroy(false);
            gridRef.current = null;
        };
    }, [deleteWidget, destroyChart, resizeAllCharts, loadDashboardFromAPI]);

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-900 via-indigo-900 to-slate-800 text-white p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">{dashboardName}</h1>
                <p className="text-slate-300">{dashboardDescription}</p>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={() => setShowModal(true)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-lg transition"
                >
                    ➕ Add Chart
                </button>

                <button
                    onClick={saveDashboard}
                    disabled={saving}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg transition disabled:opacity-60"
                >
                    {saving ? "Saving..." : "💾 Save Dashboard"}
                </button>

                <button
                    className="px-5 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg shadow-lg transition"
                    onClick={() => navigate("/query-builder")}
                >
                    Create Query
                </button>
            </div>

            <div ref={gridContainerRef} className="grid-stack mt-6" />

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-2xl w-112.5 p-6 shadow-2xl border border-white/10">
                        <h2 className="text-xl font-semibold mb-4">Add New Chart</h2>

                        <div className="mb-5">
                            <p className="text-sm text-slate-400 mb-2">Query</p>

                            <select
                                value={selectedQueryId}
                                onChange={(e) => setSelectedQueryId(e.target.value)}
                                className="w-full bg-slate-700 border border-white/10 rounded-lg px-3 py-2"
                            >
                                <option value="">Select Query</option>

                                {queries.map((q) => (
                                    <option key={q.id} value={q.id}>
                                        {q.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2 mb-6">
                            {(["line", "bar", "pie"] as ChartType[]).map((t) => (
                                <label key={t} className="flex items-center gap-3">
                                    <input
                                        type="radio"
                                        value={t}
                                        checked={selectedChartType === t}
                                        onChange={() => setSelectedChartType(t)}
                                    />
                                    {t.toUpperCase()}
                                </label>
                            ))}
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 bg-slate-600 rounded-lg"
                            >
                                Cancel
                            </button>

                            <button
                                disabled={!selectedQueryId}
                                onClick={confirmAddChart}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                            >
                                Add Chart
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
