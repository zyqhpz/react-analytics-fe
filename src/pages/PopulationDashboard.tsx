import { getAuthHeaders } from "@/api/client";
import * as echarts from "echarts";
import { GridStack, type GridStackNode, type GridStackWidget } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { v7 as uuidv7 } from "uuid";

type ChartType = "line" | "bar" | "pie";
type DatasetKey = "total_population" | "ethnicity_latest" | "age_latest";

type RawRow = {
    date: string;
    age: string;
    sex: string;
    ethnicity: string;
    population: number; // (the Nuxt code treats it as *1000)
};

type Processed = {
    totalByYear: RawRow[];
    ethnicityLatest: RawRow[];
    ageLatest: RawRow[];
};

type WidgetPosition = { x: number; y: number; w: number; h: number };

type BackendWidget = {
    id: string;
    widget_type: ChartType; // backend uses widget_type in your example
    position: WidgetPosition;
    // dataset not sent in your example
};

type ChartsMeta = {
    instance: echarts.ECharts;
    type: ChartType;
    dataset: DatasetKey;
    observer?: ResizeObserver;
};

const DASHBOARD_ID = "019c7377-64b0-75c7-93e3-8f2152715aa5";

function processData(data: RawRow[]): Processed {
    const totalByYear = data
        .filter(
            (d) =>
                d.age === "overall" && d.sex === "both" && d.ethnicity === "overall",
        )
        .sort((a, b) => a.date.localeCompare(b.date));

    const latestDate = totalByYear[totalByYear.length - 1]?.date;

    const ethnicityLatest = data.filter(
        (d) =>
            d.date === latestDate &&
            d.age === "overall" &&
            d.sex === "both" &&
            d.ethnicity !== "overall",
    );

    const ageLatest = data.filter(
        (d) =>
            d.date === latestDate &&
            d.sex === "both" &&
            d.ethnicity === "overall" &&
            d.age !== "overall",
    );

    return { totalByYear, ethnicityLatest, ageLatest };
}

function datasetTitle(dataset: DatasetKey) {
    if (dataset === "total_population") return "TOTAL POPULATION";
    if (dataset === "ethnicity_latest") return "ETHNICITY (LATEST)";
    return "AGE DISTRIBUTION (LATEST)";
}

function inferDatasetFromType(type: ChartType): DatasetKey {
    if (type === "pie") return "ethnicity_latest";
    if (type === "bar") return "age_latest";
    return "total_population";
}

function buildOption(
    processed: Processed,
    type: ChartType,
    dataset: DatasetKey,
): echarts.EChartsOption {
    if (dataset === "total_population") {
        return {
            tooltip: { trigger: "axis" },
            xAxis: {
                type: "category",
                data: processed.totalByYear.map((d) => d.date.substring(0, 4)),
                axisLabel: { color: "#cbd5e1" },
            },
            yAxis: {
                type: "value",
                axisLabel: { color: "#cbd5e1" },
            },
            series: [
                {
                    type, // line or bar works; pie would look wrong but we allow it if user picks it
                    data: processed.totalByYear.map((d) => d.population * 1000),
                    smooth: type === "line",
                    areaStyle: type === "line" ? { opacity: 0.3 } : undefined,
                } as any,
            ],
        };
    }

    if (dataset === "ethnicity_latest") {
        return {
            tooltip: { trigger: "item" },
            series: [
                {
                    type: "pie",
                    radius: "65%",
                    data: processed.ethnicityLatest.map((d) => ({
                        name: d.ethnicity,
                        value: d.population * 1000,
                    })),
                },
            ],
        };
    }

    // age_latest
    return {
        tooltip: { trigger: "axis" },
        xAxis: {
            type: "category",
            data: processed.ageLatest.map((d) => d.age),
            axisLabel: { rotate: 45, color: "#cbd5e1" },
        },
        yAxis: {
            type: "value",
            axisLabel: { color: "#cbd5e1" },
        },
        series: [
            {
                type, // bar or line works
                data: processed.ageLatest.map((d) => d.population * 1000),
            } as any,
        ],
    };
}

export default function PopulationDashboard() {
    const gridContainerRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<GridStack | null>(null);

    // chart instances by widget id
    const chartsRef = useRef<Record<string, ChartsMeta>>({});

    const [rawData, setRawData] = useState<RawRow[]>([]);
    const processed = useMemo(() => processData(rawData), [rawData]);

    const [showModal, setShowModal] = useState(false);
    const [selectedChartType, setSelectedChartType] = useState<ChartType>("line");
    const [selectedDataset, setSelectedDataset] =
        useState<DatasetKey>("total_population");

    const [saving, setSaving] = useState(false);

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
        // Outer element must be .grid-stack-item; inside .grid-stack-item-content
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

    const initChart = useCallback(
        (id: string, type: ChartType, dataset: DatasetKey) => {
            const el = document.getElementById(id);
            if (!el) return;

            // If it already exists (e.g. reload), dispose first
            destroyChart(id);

            const chart = echarts.init(el);
            chart.setOption(buildOption(processed, type, dataset));

            const observer = new ResizeObserver(() => chart.resize());
            observer.observe(el);

            chartsRef.current[id] = { instance: chart, type, dataset, observer };
        },
        [processed, destroyChart],
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

    const confirmAddChart = useCallback(() => {
        setShowModal(false);

        const id = uuidv7();
        const type = selectedChartType;
        const dataset = selectedDataset;

        const bottomY = getBottomY();

        // Create widget DOM + GridStack widget
        addWidget({
            id,
            x: 0,
            y: bottomY,
            w: 6,
            h: 3,
            title: datasetTitle(dataset),
        });

        // Defer chart init until DOM/layout exist
        requestAnimationFrame(() => {
            initChart(id, type, dataset);
            resizeAllCharts();
        });
    }, [
        addWidget,
        getBottomY,
        initChart,
        resizeAllCharts,
        selectedChartType,
        selectedDataset,
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

            // Replace with your real endpoint
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

    const loadDashboardFromAPI = useCallback(async () => {
        const grid = gridRef.current;
        const container = gridContainerRef.current;
        if (!grid || !container) return;

        const response = await fetch(
            `http://localhost:8080/api/v1/dashboards/${DASHBOARD_ID}/widgets`,
            {
                headers: getAuthHeaders(),
            },
        );

        if (response.status === 401) {
            getAuthHeaders();
            return;
        }

        const result = await response.json();

        const list: BackendWidget[] = result?.data ?? [];
        if (!list.length) return;

        // Clear grid + charts
        Object.keys(chartsRef.current).forEach(destroyChart);
        grid.removeAll();
        container.innerHTML = "";

        // Recreate
        for (const w of list) {
            const id = w.id;
            const type = w.widget_type;
            const dataset = inferDatasetFromType(type);

            addWidget({
                id,
                x: w.position.x,
                y: w.position.y,
                w: w.position.w,
                h: w.position.h,
                title: `${type.toUpperCase()} CHART`,
            });

            // Init chart after DOM exists
            requestAnimationFrame(() => initChart(id, type, dataset));
        }

        requestAnimationFrame(() => resizeAllCharts());
    }, [addWidget, destroyChart, initChart, resizeAllCharts]);

    // Init grid + wire events once
    useEffect(() => {
        const container = gridContainerRef.current;
        if (!container) return;

        const grid = GridStack.init(
            {
                column: 12,
                cellHeight: 120,
                margin: 15,
                float: true,
                // `responsive` is not a v11 option; GridStack is responsive by CSS/media queries.
                // Keep as close to your config as possible without breaking.
            },
            container,
        );

        gridRef.current = grid;

        // Delete button delegation
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.classList.contains("delete-widget")) {
                const widgetEl = target.closest(
                    ".grid-stack-item",
                ) as HTMLElement | null;
                if (widgetEl) deleteWidget(widgetEl);
            }
        };
        container.addEventListener("click", onClick);

        // Resize/drag events
        let resizeTimeout: number | undefined;

        grid.on("resize", (_event: any, el?: HTMLElement) => {
            window.clearTimeout(resizeTimeout);
            resizeTimeout = window.setTimeout(() => resizeAllCharts(), 50);
            resizeAllCharts();
            // You can log details here if you still want
            // console.log("resize", (el as any)?.gridstackNode);
        });

        grid.on("resizestop", () => resizeAllCharts());
        grid.on("dragstop", () => resizeAllCharts());

        const onWindowResize = () => resizeAllCharts();
        window.addEventListener("resize", onWindowResize);

        return () => {
            window.removeEventListener("resize", onWindowResize);
            container.removeEventListener("click", onClick);

            // dispose charts
            Object.keys(chartsRef.current).forEach(destroyChart);

            grid.destroy(false);
            gridRef.current = null;
        };
    }, [deleteWidget, destroyChart, resizeAllCharts]);

    // Fetch data, then load dashboard
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const response = await fetch(
                "https://api.data.gov.my/opendosm/?id=population_malaysia&sort=-date&date_start=2010-01-01@date",
            );
            const json = (await response.json()) as RawRow[];
            if (cancelled) return;
            setRawData(json);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    // When data arrives, load dashboard config (so charts can render)
    useEffect(() => {
        if (!rawData.length) return;
        loadDashboardFromAPI();
    }, [rawData.length, loadDashboardFromAPI]);

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-900 via-indigo-900 to-slate-800 text-white p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Malaysia Population Dashboard</h1>
                <p className="text-slate-300">Data from data.gov.my (OpenDOSM)</p>
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
                            <p className="text-sm text-slate-400 mb-2">Chart Type</p>
                            <div className="space-y-2">
                                {(["line", "bar", "pie"] as ChartType[]).map((t) => (
                                    <label
                                        key={t}
                                        className="flex items-center gap-3 cursor-pointer"
                                    >
                                        <input
                                            type="radio"
                                            value={t}
                                            checked={selectedChartType === t}
                                            onChange={() => setSelectedChartType(t)}
                                        />
                                        <span>
                                            {t === "line"
                                                ? "Line Chart"
                                                : t === "bar"
                                                    ? "Bar Chart"
                                                    : "Pie Chart"}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <p className="text-sm text-slate-400 mb-2">Dataset</p>
                            <select
                                value={selectedDataset}
                                onChange={(e) =>
                                    setSelectedDataset(e.target.value as DatasetKey)
                                }
                                className="w-full bg-slate-700 border border-white/10 rounded-lg px-3 py-2"
                            >
                                <option value="total_population">
                                    Total Population (Yearly)
                                </option>
                                <option value="ethnicity_latest">
                                    Ethnicity (Latest Year)
                                </option>
                                <option value="age_latest">
                                    Age Distribution (Latest Year)
                                </option>
                            </select>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmAddChart}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg"
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
