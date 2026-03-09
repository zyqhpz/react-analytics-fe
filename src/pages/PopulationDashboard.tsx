import { getAuthHeaders } from "@/api/client";
import * as echarts from "echarts";
import * as echartsCharts from "echarts/charts";
import { GridStack, type GridStackNode, type GridStackWidget } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { v7 as uuidv7 } from "uuid";

import { fetchDashboard } from "@/api/dashboard";
import { fetchQueryWithData, fetchSavedQueries } from "@/api/queries";
import { type DashboardWidget, type WidgetPosition } from "@/types/dashboard";
import { type ChartType, type Query, type QueryRow } from "@/types/query";
import { toast } from "sonner";

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

type WidgetMeta = {
    queryId: string;
    chartType: ChartType;
};

type ChartTypeGuide = {
    description: string;
    minimumFields: number;
    required: string[];
    optional?: string[];
    sampleRow: Record<string, string | number>;
    notes?: string[];
};

const DASHBOARD_ID = "019c7377-64b0-75c7-93e3-8f2152715aa5";

const formatCompactNumber = (value: unknown): string => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return String(value ?? "");

    return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
    }).format(numericValue);
};

const toNumeric = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
};

const toLabel = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "N/A";
    return String(value);
};

const inferDataShape = (data: QueryRow[], schema?: string[]) => {
    const sample = data[0] ?? {};
    const keys = schema?.length ? schema : Object.keys(sample);
    const numericKeys = keys.filter((key) =>
        data.every((row) => toNumeric(row[key]) !== null),
    );
    const categoryKey =
        keys.find((key) => !numericKeys.includes(key)) ?? keys[0] ?? "category";
    const valueKeys = numericKeys.length ? numericKeys : keys.slice(1, 2);
    const primaryValueKey = valueKeys[0] ?? keys[1] ?? keys[0];

    return { keys, numericKeys, valueKeys, categoryKey, primaryValueKey };
};

const fallbackCartesianOption = (
    chartType: string,
    categoryData: string[],
    seriesData: number[],
): echarts.EChartsOption => ({
    title: {
        text: `${chartType} needs specialized schema`,
        subtext: "Showing fallback bar chart",
        left: "center",
        top: 4,
        textStyle: { color: "#e2e8f0", fontSize: 13, fontWeight: 600 },
        subtextStyle: { color: "#94a3b8", fontSize: 11 },
    },
    backgroundColor: "transparent",
    grid: { left: 28, right: 20, top: 54, bottom: 40, containLabel: true },
    xAxis: {
        type: "category",
        data: categoryData,
        axisLabel: { color: "#cbd5e1", fontSize: 11 },
        axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.45)" } },
    },
    yAxis: {
        type: "value",
        axisLabel: {
            color: "#cbd5e1",
            fontSize: 11,
            formatter: (value: number) => formatCompactNumber(value),
        },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
    },
    tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderColor: "rgba(148, 163, 184, 0.3)",
        textStyle: { color: "#e2e8f0" },
    },
    series: [
        {
            type: "bar",
            data: seriesData,
            itemStyle: { color: "#60a5fa" },
        },
    ],
});

const CHART_TYPE_GUIDES: Record<string, ChartTypeGuide> = {
    line: {
        description: "Trend over categories or time.",
        minimumFields: 2,
        required: ["1 category field (string/date)", "1+ numeric field"],
        optional: ["Additional numeric fields for multiple lines"],
        sampleRow: { month: "2026-01", total_amount: 12045.5 },
        notes: ["Schema order should be category first, then metrics."],
    },
    bar: {
        description: "Compare values across categories.",
        minimumFields: 2,
        required: ["1 category field", "1+ numeric field"],
        optional: ["Additional numeric fields for grouped bars"],
        sampleRow: { provider_type: "FPX", total_amount: 87000.23 },
    },
    scatter: {
        description: "Relationship/distribution of numeric values.",
        minimumFields: 2,
        required: ["1 category/label field", "1 numeric field"],
        optional: ["Additional numeric fields as extra series"],
        sampleRow: { merchant: "Store A", revenue: 12345.67 },
    },
    effectScatter: {
        description: "Scatter with emphasis animation.",
        minimumFields: 2,
        required: ["1 category/label field", "1 numeric field"],
        sampleRow: { region: "North", count: 98 },
    },
    pictorialBar: {
        description: "Bar chart using symbols/icons.",
        minimumFields: 2,
        required: ["1 category field", "1 numeric field"],
        sampleRow: { product: "Plan A", users: 4200 },
    },
    pie: {
        description: "Part-to-whole distribution.",
        minimumFields: 2,
        required: ["1 category/segment field", "1 numeric value field"],
        sampleRow: { payment_type: "EWallet", total_amount: 4014.24 },
    },
    funnel: {
        description: "Sequential stage drop-off.",
        minimumFields: 2,
        required: ["1 stage/category field", "1 numeric value field"],
        sampleRow: { stage: "Checkout", users: 8400 },
    },
    gauge: {
        description: "Single KPI progress meter.",
        minimumFields: 1,
        required: ["1 numeric value field"],
        optional: ["1 label field (optional)"],
        sampleRow: { completion_rate: 72.5 },
        notes: ["Only first numeric value is used."],
    },
    radar: {
        description: "Compare multiple dimensions for one profile.",
        minimumFields: 2,
        required: ["1 dimension/category field", "1 numeric value field"],
        optional: ["Additional numeric fields"],
        sampleRow: { metric: "Speed", score: 86 },
    },
    heatmap: {
        description: "Intensity map by category cell.",
        minimumFields: 2,
        required: ["1 category field", "1 numeric value field"],
        sampleRow: { day: "Mon", transactions: 1200 },
    },
    tree: {
        description: "Hierarchical view (auto-built from flat rows).",
        minimumFields: 2,
        required: ["1 category field", "1 numeric value field"],
        sampleRow: { segment: "Enterprise", amount: 53200 },
    },
    treemap: {
        description: "Nested area sizing by value.",
        minimumFields: 2,
        required: ["1 category field", "1 numeric value field"],
        sampleRow: { team: "A", cost: 23000 },
    },
    sunburst: {
        description: "Radial hierarchical view.",
        minimumFields: 2,
        required: ["1 category field", "1 numeric value field"],
        sampleRow: { channel: "Online", value: 34200 },
    },
    candlestick: {
        description: "OHLC financial-style chart.",
        minimumFields: 5,
        required: [
            "1 category/timestamp field",
            "4 numeric fields: open, close, low, high",
        ],
        sampleRow: {
            date: "2026-02-19",
            open: 100,
            close: 108,
            low: 95,
            high: 112,
        },
        notes: ["Numeric field order matters for correct OHLC rendering."],
    },
    boxplot: {
        description: "Distribution summary with quartiles.",
        minimumFields: 6,
        required: [
            "1 category field",
            "5 numeric fields: min, q1, median, q3, max",
        ],
        sampleRow: {
            segment: "A",
            min: 10,
            q1: 22,
            median: 35,
            q3: 47,
            max: 61,
        },
        notes: ["Numeric field order matters for boxplot rendering."],
    },
};

const getChartTypeGuide = (type: string): ChartTypeGuide => {
    return (
        CHART_TYPE_GUIDES[type] ?? {
            description: "Generic support with automatic fallback rendering.",
            minimumFields: 2,
            required: ["1 category field", "1 numeric field"],
            sampleRow: { category: "A", value: 120 },
            notes: [
                "If this chart needs special schema, dashboard falls back to bar visualization.",
            ],
        }
    );
};

/**
 * Build ECharts option dynamically based on query.data
 * This supports generic SQL results like:
 *
 * [
 *   { type: "CreditCard", sum_amount: 308 },
 *   { type: "FPX", sum_amount: 86790 }
 * ]
 */
export function buildOption(
    type: ChartType,
    data: QueryRow[] = [],
    schema?: string[],
): echarts.EChartsOption {
    if (!data.length) {
        return {
            title: {
                text: "No Data",
                left: "center",
                top: "middle",
                textStyle: { color: "#cbd5e1", fontSize: 20, fontWeight: 700 },
            },
        };
    }

    const { keys, valueKeys, categoryKey, primaryValueKey } = inferDataShape(
        data,
        schema,
    );
    const categoryData = data.map((row) => toLabel(row[categoryKey]));
    const baseSeriesData = data.map(
        (row) => toNumeric(row[primaryValueKey]) ?? 0,
    );
    const nameValuePairs = data.map((row, index) => ({
        name: toLabel(row[categoryKey] ?? `Item ${index + 1}`),
        value: toNumeric(row[primaryValueKey]) ?? 0,
    }));
    const selectedType = String(type);

    if (selectedType === "pie" || selectedType === "funnel") {
        return {
            backgroundColor: "transparent",
            tooltip: {
                trigger: "item",
                backgroundColor: "rgba(15, 23, 42, 0.92)",
                borderColor: "rgba(148, 163, 184, 0.3)",
                textStyle: { color: "#e2e8f0" },
                valueFormatter: (value) => formatCompactNumber(value),
            },
            legend: {
                bottom: 4,
                textStyle: { color: "#cbd5e1", fontSize: 12 },
                itemWidth: 10,
                itemHeight: 10,
                type: "scroll",
            },
            series: [
                {
                    type: selectedType as any,
                    radius: selectedType === "pie" ? ["42%", "72%"] : undefined,
                    center: selectedType === "pie" ? ["50%", "46%"] : undefined,
                    minAngle: 3,
                    itemStyle: {
                        borderColor: "rgba(15, 23, 42, 0.7)",
                        borderWidth: 2,
                    },
                    labelLine: {
                        length: 12,
                        length2: 8,
                        lineStyle: { color: "rgba(203, 213, 225, 0.55)" },
                    },
                    label: {
                        color: "#e2e8f0",
                        fontSize: 12,
                        formatter: "{name|{b}} {percent|{d}%}",
                        rich: {
                            name: { color: "#cbd5e1", fontWeight: 500 },
                            percent: { color: "#f8fafc", fontWeight: 700 },
                        },
                    },
                    data: data.map((row) => ({
                        name: toLabel(row[categoryKey]),
                        value: toNumeric(row[primaryValueKey]) ?? 0,
                    })),
                },
            ],
        };
    }

    if (selectedType === "gauge") {
        return {
            backgroundColor: "transparent",
            tooltip: {
                trigger: "item",
                backgroundColor: "rgba(15, 23, 42, 0.92)",
                borderColor: "rgba(148, 163, 184, 0.3)",
                textStyle: { color: "#e2e8f0" },
            },
            series: [
                {
                    type: "gauge",
                    progress: { show: true, width: 14 },
                    axisLine: { lineStyle: { width: 14 } },
                    detail: {
                        valueAnimation: true,
                        color: "#f8fafc",
                        formatter: (value: number) => formatCompactNumber(value),
                    },
                    data: [{ value: baseSeriesData[0] ?? 0 }],
                },
            ],
        };
    }

    if (selectedType === "radar") {
        const maxValue = Math.max(...baseSeriesData, 1);
        return {
            backgroundColor: "transparent",
            tooltip: { trigger: "item" },
            radar: {
                indicator: nameValuePairs.map((entry) => ({
                    name: entry.name,
                    max: Math.ceil(maxValue * 1.2),
                })),
                axisName: { color: "#cbd5e1" },
            },
            series: [
                {
                    type: "radar",
                    data: [{ value: nameValuePairs.map((entry) => entry.value) }],
                    areaStyle: { color: "rgba(96, 165, 250, 0.25)" },
                    lineStyle: { color: "#60a5fa" },
                },
            ],
        };
    }

    if (selectedType === "sunburst") {
        return {
            backgroundColor: "transparent",
            tooltip: { trigger: "item" },
            series: [
                {
                    type: "sunburst",
                    radius: ["20%", "85%"],
                    data: nameValuePairs,
                    label: { color: "#e2e8f0" },
                },
            ],
        };
    }

    if (selectedType === "treemap") {
        return {
            backgroundColor: "transparent",
            tooltip: { trigger: "item" },
            series: [
                {
                    type: "treemap",
                    data: nameValuePairs,
                    label: { color: "#e2e8f0" },
                },
            ],
        };
    }

    if (selectedType === "tree") {
        return {
            backgroundColor: "transparent",
            tooltip: { trigger: "item" },
            series: [
                {
                    type: "tree",
                    data: [
                        {
                            name: keys[0] ? toLabel(keys[0]) : "Data",
                            children: nameValuePairs.map((entry) => ({
                                name: `${entry.name}: ${formatCompactNumber(entry.value)}`,
                            })),
                        },
                    ],
                    top: "8%",
                    left: "8%",
                    bottom: "10%",
                    right: "20%",
                    symbolSize: 8,
                    label: { color: "#e2e8f0" },
                    lineStyle: { color: "rgba(148, 163, 184, 0.5)" },
                },
            ],
        };
    }

    if (selectedType === "heatmap") {
        return {
            backgroundColor: "transparent",
            tooltip: { position: "top" },
            xAxis: {
                type: "category",
                data: categoryData,
                axisLabel: { color: "#cbd5e1" },
            },
            yAxis: {
                type: "category",
                data: [primaryValueKey],
                axisLabel: { color: "#cbd5e1" },
            },
            visualMap: {
                min: Math.min(...baseSeriesData),
                max: Math.max(...baseSeriesData, 1),
                calculable: true,
                orient: "horizontal",
                left: "center",
                bottom: 0,
                textStyle: { color: "#cbd5e1" },
            },
            series: [
                {
                    type: "heatmap",
                    data: baseSeriesData.map((value, index) => [index, 0, value]),
                    label: { show: false },
                },
            ],
        };
    }

    if (selectedType === "candlestick" && valueKeys.length >= 4) {
        return {
            backgroundColor: "transparent",
            tooltip: { trigger: "axis" },
            xAxis: {
                type: "category",
                data: categoryData,
                axisLabel: { color: "#cbd5e1" },
            },
            yAxis: { scale: true, axisLabel: { color: "#cbd5e1" } },
            series: [
                {
                    type: "candlestick",
                    data: data.map((row) =>
                        valueKeys.slice(0, 4).map((key) => toNumeric(row[key]) ?? 0),
                    ),
                },
            ],
        };
    }

    if (selectedType === "boxplot" && valueKeys.length >= 5) {
        return {
            backgroundColor: "transparent",
            tooltip: { trigger: "item" },
            xAxis: {
                type: "category",
                data: categoryData,
                axisLabel: { color: "#cbd5e1" },
            },
            yAxis: { type: "value", axisLabel: { color: "#cbd5e1" } },
            series: [
                {
                    type: "boxplot",
                    data: data.map((row) =>
                        valueKeys.slice(0, 5).map((key) => toNumeric(row[key]) ?? 0),
                    ),
                },
            ],
        };
    }

    const isMultiCartesianType =
        selectedType === "line" ||
        selectedType === "bar" ||
        selectedType === "scatter" ||
        selectedType === "effectScatter" ||
        selectedType === "pictorialBar";
    const fallbackSeries =
        (fallbackCartesianOption(selectedType, categoryData, baseSeriesData)
            .series as any[]) ?? [];
    const cartesianSeries = isMultiCartesianType
        ? valueKeys.map((key, index) => ({
            type: selectedType as any,
            name: key,
            data: data.map((row) => toNumeric(row[key]) ?? 0),
            smooth: selectedType === "line",
            itemStyle: { color: index % 2 === 0 ? "#60a5fa" : "#22d3ee" },
            lineStyle: { width: 3, color: index % 2 === 0 ? "#60a5fa" : "#22d3ee" },
            areaStyle:
                selectedType === "line"
                    ? {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            {
                                offset: 0,
                                color:
                                    index % 2 === 0
                                        ? "rgba(96, 165, 250, 0.45)"
                                        : "rgba(34, 211, 238, 0.45)",
                            },
                            { offset: 1, color: "rgba(96, 165, 250, 0.03)" },
                        ]),
                    }
                    : undefined,
        }))
        : fallbackSeries;

    return {
        backgroundColor: "transparent",
        grid: {
            left: 28,
            right: 20,
            top: 28,
            bottom: 40,
            containLabel: true,
        },
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            borderColor: "rgba(148, 163, 184, 0.3)",
            textStyle: { color: "#e2e8f0" },
            axisPointer: { type: "shadow" },
            valueFormatter: (value) => formatCompactNumber(value),
        },
        xAxis: {
            type: "category",
            data: categoryData,
            axisLabel: {
                color: "#cbd5e1",
                fontSize: 11,
                formatter: (value: string) =>
                    value?.length > 14 ? `${value.slice(0, 14)}...` : value,
            },
            axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.45)" } },
            axisTick: { show: false },
        },
        yAxis: {
            type: "value",
            axisLabel: {
                color: "#cbd5e1",
                fontSize: 11,
                formatter: (value: number) => formatCompactNumber(value),
            },
            splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
        },
        series: [...cartesianSeries],
        ...(isMultiCartesianType
            ? {}
            : {
                title: {
                    text: `${selectedType} needs specialized schema`,
                    subtext: "Showing fallback bar series",
                    left: "center",
                    top: 4,
                    textStyle: { color: "#e2e8f0", fontSize: 13, fontWeight: 600 },
                    subtextStyle: { color: "#94a3b8", fontSize: 11 },
                },
            }),
    };
}

export default function PopulationDashboard() {
    const gridContainerRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<GridStack | null>(null);

    // chart instances by widget id
    const chartsRef = useRef<Record<string, ChartsMeta>>({});
    const widgetsMetaRef = useRef<Record<string, WidgetMeta>>({});

    const [widgets, setWidgets] = useState<DashboardWidget[]>([]);

    const [dashboardName, setDashboardName] = useState("My Dashboard");
    const [dashboardDescription, setDashboardDescription] = useState("");

    const [showModal, setShowModal] = useState(false);
    const [selectedChartType, setSelectedChartType] = useState<ChartType>("line");

    const [saving, setSaving] = useState(false);

    const [queries, setQueries] = useState<Query[]>([]);
    const [selectedQueryId, setSelectedQueryId] = useState<string>("");

    const navigate = useNavigate();
    const chartTypeOptions = useMemo(() => {
        const toLabel = (type: string) =>
            type
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (char) => char.toUpperCase())
                .trim();

        return Object.keys(echartsCharts)
            .filter((key) => key.endsWith("Chart"))
            .map((key) => key.replace(/Chart$/, ""))
            .map((base) => `${base.charAt(0).toLowerCase()}${base.slice(1)}`)
            .filter((value, index, array) => array.indexOf(value) === index)
            .sort((a, b) => a.localeCompare(b))
            .map((value) => ({
                value,
                label: toLabel(value),
            }));
    }, []);
    const selectedChartGuide = useMemo(
        () => getChartTypeGuide(String(selectedChartType)),
        [selectedChartType],
    );

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
        if (!grid) return 0;
        return grid.getRow();
    }, []);

    const ensureWidgetDom = useCallback((id: string, title: string) => {
        const wrapper = document.createElement("div");

        wrapper.innerHTML = `
      <div class="grid-stack-item">
        <div class="grid-stack-item-content overflow-hidden rounded-2xl border border-white/10 bg-slate-900/45 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl flex flex-col">
          <div class="px-4 py-3 border-b border-white/10 font-semibold text-slate-100 flex justify-between items-center gap-3">
            <span class="truncate">${title}</span>
            <button class="delete-widget h-8 w-8 rounded-md border border-red-400/40 text-red-300 hover:bg-red-500/10 hover:text-red-200 transition text-sm" type="button">X</button>
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

            chart.setOption(buildOption(type, data, schema), { notMerge: true });

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
            el.setAttribute("gs-x", String(Number(opts.x)));
            el.setAttribute("gs-y", String(Number(opts.y)));
            el.setAttribute("gs-w", String(Number(opts.w)));
            el.setAttribute("gs-h", String(Number(opts.h)));
            el.setAttribute("gs-id", opts.id);

            container.appendChild(el);
            grid.makeWidget(el, {
                x: Number(opts.x),
                y: Number(opts.y),
                w: Number(opts.w),
                h: Number(opts.h),
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

        widgetsMetaRef.current[id] = {
            queryId: selectedQueryId,
            chartType: type,
        };

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

        setWidgets((prev) => [
            ...prev,
            {
                id,
                queryId: selectedQueryId,
                chartType: selectedChartType,
                title: selectedQuery.name,
                position: { x: 0, y: bottomY, w: 6, h: 3 },
            },
        ]);

        // initialize empty chart first
        const waitForDom = () => {
            const el = document.getElementById(id);

            if (!el) {
                requestAnimationFrame(waitForDom);
                return;
            }

            initChart(id, type, []);

            chartsRef.current[id]?.instance.showLoading({
                text: "Running query...",
            });
            resizeAllCharts();

            const meta = chartsRef.current[id];

            meta?.instance?.showLoading({
                text: "Running query...",
            });
        };

        requestAnimationFrame(waitForDom);

        try {
            const result = await fetchQueryWithData(selectedQueryId);

            const rows = result.data ?? [];
            const schema = result.result_schema ?? [];

            const applyData = () => {
                const meta = chartsRef.current[id];

                if (!meta) {
                    requestAnimationFrame(applyData);
                    return;
                }

                meta.instance.hideLoading();
                meta.instance.resize();
                meta.instance.setOption(buildOption(type, rows, schema), {
                    notMerge: true,
                });
            };

            applyData();
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
            const widgets = layout.map((item) => {
                const meta = widgetsMetaRef.current[item.id!];

                return {
                    id: item.id,
                    type: meta?.chartType,
                    query_id: meta?.queryId,
                    position: {
                        x: item.x!,
                        y: item.y!,
                        w: item.w!,
                        h: item.h!,
                    },
                };
            });

            const payload = {
                dashboard_id: DASHBOARD_ID,
                widgets,
            };

            const res = await fetch("http://localhost:8080/api/v1/widgets", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                throw new Error("Failed to save dashboard");
            }

            toast.success("Dashboard saved successfully.");
        } catch (err) {
            console.error("Failed to save dashboard:", err);

            toast.error("Failed to save dashboard.");
        } finally {
            setSaving(false);
        }
    }, []);

    /**
     * Load dashboard configuration + query results from API
     */
    const loadDashboardFromAPI = useCallback(async () => {
        const container = gridContainerRef.current;
        if (!container) return;

        try {
            const result = await fetchDashboard(DASHBOARD_ID);

            if (!result?.data) {
                throw new Error("Dashboard response missing data");
            }

            setDashboardName(result.data?.name || "My Dashboard");
            setDashboardDescription(result.data?.description || "");

            const list: BackendWidget[] = result?.data?.widgets ?? [];
            if (!list.length) return;

            // 1. Destroy all charts first
            Object.keys(chartsRef.current).forEach(destroyChart);

            // 2. Fully destroy the grid instance and wipe the container DOM
            if (gridRef.current) {
                gridRef.current.destroy(false); // keeps DOM nodes
                gridRef.current = null;
            }
            // Manually remove all grid-stack-item children
            container.innerHTML = "";

            // 3. Reinitialize a fresh grid
            const grid = GridStack.init(
                { column: 12, cellHeight: 120, margin: 15, float: false },
                container,
            );
            gridRef.current = grid;

            // Re-attach resize listeners
            grid.on("resize", () => resizeAllCharts());
            grid.on("resizestop", () => resizeAllCharts());
            grid.on("dragstop", () => resizeAllCharts());

            if (!list.length) {
                setWidgets([]);
                return;
            }

            gridContainerRef.current
                ?.querySelectorAll(".grid-stack-item")
                .forEach((el) => el.remove());
            setWidgets([]);

            const loadedWidgets: DashboardWidget[] = [];
            const pendingCharts: Array<() => void> = [];

            for (const w of list) {
                const id = w.id;
                const type = w.widget_type;
                const data = w.query?.data ?? [];
                const schema = w.query?.result_schema;

                widgetsMetaRef.current[id] = {
                    queryId: w.query?.id ?? "",
                    chartType: type,
                };

                addWidget({
                    id,
                    x: w.position.x,
                    y: w.position.y,
                    w: w.position.w,
                    h: w.position.h,
                    title: w.query?.name || `${type.toUpperCase()} CHART`,
                });

                // requestAnimationFrame(() => initChart(id, type, data, schema));

                loadedWidgets.push({
                    id,
                    queryId: w.query?.id ?? "",
                    chartType: type,
                    title: w.query?.name || "",
                    position: w.position,
                    data,
                    schema,
                });

                pendingCharts.push(() => initChart(id, type, data, schema));
            }

            setWidgets(loadedWidgets);

            requestAnimationFrame(() => {
                pendingCharts.forEach((fn) => fn());
                resizeAllCharts();
            });
        } catch (err) {
            console.error("Failed to load dashboard:", err);
            toast.error("Failed to load dashboard: " + (err as Error).message);
            return;
        }
    }, [addWidget, destroyChart, initChart, resizeAllCharts]);

    const loadDashboardFromAPIRef = useRef(loadDashboardFromAPI);
    useEffect(() => {
        loadDashboardFromAPIRef.current = loadDashboardFromAPI;
    }, [loadDashboardFromAPI]);

    useEffect(() => {
        const container = gridContainerRef.current;
        if (!container) return;

        const grid = GridStack.init(
            {
                column: 12,
                cellHeight: 120,
                margin: 15,
                float: false,
            },
            container,
        );

        gridRef.current = grid;

        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;

            if (!target) return;

            if (target.classList.contains("delete-widget")) {
                const widgetEl = target.closest(".grid-stack-item") as HTMLElement;

                if (widgetEl) {
                    const widgetId = widgetEl.querySelector("[id]")?.getAttribute("id");
                    deleteWidget(widgetEl);
                    if (widgetId) {
                        delete widgetsMetaRef.current[widgetId];
                        setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
                    }
                }
            }
        };

        container.addEventListener("click", onClick);

        grid.on("resize", () => resizeAllCharts());
        grid.on("resizestop", () => resizeAllCharts());
        grid.on("dragstop", () => resizeAllCharts());

        window.addEventListener("resize", resizeAllCharts);

        loadDashboardFromAPIRef.current();

        return () => {
            container.removeEventListener("click", onClick);
            window.removeEventListener("resize", resizeAllCharts);
            Object.keys(chartsRef.current).forEach(destroyChart);

            // grid may have been reinitialized by loadDashboardFromAPI
            gridRef.current?.destroy(false);
            gridRef.current = null;
        };
    }, [deleteWidget, destroyChart, resizeAllCharts]);

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 text-white relative overflow-x-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-indigo-500/18 blur-3xl" />
                <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-cyan-500/12 blur-3xl" />
            </div>

            <div className="relative z-10 p-6 md:p-8">
                <div className="mx-auto max-w-360">
                    <div className="mb-8 rounded-2xl border border-white/10 bg-slate-900/45 px-6 py-5 shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">
                                    {dashboardName}
                                </h1>
                                <p className="mt-2 text-sm text-slate-300/90 md:text-base">
                                    {dashboardDescription || "Analytics workspace"}
                                </p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                                Widgets: {widgets.length}
                            </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                onClick={() => setShowModal(true)}
                                className="px-5 py-2.5 rounded-xl border border-emerald-400/30 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 transition shadow-sm"
                            >
                                + Add Chart
                            </button>

                            <button
                                onClick={saveDashboard}
                                disabled={saving}
                                className="px-5 py-2.5 rounded-xl border border-indigo-300/30 bg-indigo-500/25 text-indigo-50 hover:bg-indigo-500/35 transition disabled:opacity-60"
                            >
                                {saving ? "Saving..." : "Save Dashboard"}
                            </button>

                            <button
                                className="px-5 py-2.5 rounded-xl border border-white/15 bg-slate-700/45 text-slate-100 hover:bg-slate-700/65 transition"
                                onClick={() => navigate("/query-builder")}
                            >
                                Open Query Builder
                            </button>
                        </div>
                    </div>

                    <div ref={gridContainerRef} className="grid-stack mt-6 pb-8" />
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/85 p-6 shadow-2xl">
                        <h2 className="mb-5 text-xl font-semibold text-slate-100">
                            Add New Chart
                        </h2>

                        <div className="mb-5">
                            <p className="mb-2 text-sm text-slate-300">Query</p>

                            <select
                                value={selectedQueryId}
                                onChange={(e) => setSelectedQueryId(e.target.value)}
                                className="w-full rounded-lg border border-white/15 bg-slate-800/90 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-300/40"
                            >
                                <option value="">Select Query</option>

                                {queries.map((q) => (
                                    <option key={q.id} value={q.id}>
                                        {q.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-6">
                            <p className="mb-2 text-sm text-slate-300">Chart Type</p>
                            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-3">
                                {chartTypeOptions.map((chartTypeOption) => (
                                    <label
                                        key={chartTypeOption.value}
                                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 transition ${selectedChartType === chartTypeOption.value
                                                ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                                                : "cursor-pointer border-white/15 bg-slate-800/80 text-slate-300 hover:bg-slate-700/70"
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            value={chartTypeOption.value}
                                            checked={selectedChartType === chartTypeOption.value}
                                            onChange={() =>
                                                setSelectedChartType(chartTypeOption.value as ChartType)
                                            }
                                            className="hidden"
                                        />
                                        {chartTypeOption.label}
                                    </label>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-slate-400">
                                Showing all ECharts chart types.
                            </p>
                        </div>

                        <div className="mb-6 rounded-xl border border-white/10 bg-slate-800/40 p-4">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-100">
                                    Data Requirements
                                </p>
                                <span className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">
                                    {String(selectedChartType)}
                                </span>
                            </div>

                            <p className="text-xs text-slate-300">
                                {selectedChartGuide.description}
                            </p>

                            <p className="mt-3 text-xs text-slate-300">
                                Minimum fields:{" "}
                                <span className="font-semibold text-slate-100">
                                    {selectedChartGuide.minimumFields}
                                </span>
                            </p>

                            <div className="mt-3 text-xs text-slate-300">
                                <p className="font-medium text-slate-200">Required</p>
                                <ul className="mt-1 list-disc pl-5">
                                    {selectedChartGuide.required.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>

                            {selectedChartGuide.optional?.length ? (
                                <div className="mt-3 text-xs text-slate-300">
                                    <p className="font-medium text-slate-200">Optional</p>
                                    <ul className="mt-1 list-disc pl-5">
                                        {selectedChartGuide.optional.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            <div className="mt-3">
                                <p className="text-xs font-medium text-slate-200">Sample row</p>
                                <pre className="mt-1 overflow-x-auto rounded-lg border border-white/10 bg-slate-900/70 p-2 text-[11px] leading-relaxed text-slate-300">
                                    {JSON.stringify(selectedChartGuide.sampleRow, null, 2)}
                                </pre>
                            </div>

                            {selectedChartGuide.notes?.length ? (
                                <div className="mt-3 text-xs text-amber-200/90">
                                    {selectedChartGuide.notes.map((note) => (
                                        <p key={note}>Note: {note}</p>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="rounded-lg border border-white/15 bg-slate-700/70 px-4 py-2 text-slate-100 transition hover:bg-slate-700"
                            >
                                Cancel
                            </button>

                            <button
                                disabled={!selectedQueryId}
                                onClick={confirmAddChart}
                                className="rounded-lg border border-emerald-400/30 bg-emerald-500/25 px-4 py-2 text-emerald-100 transition hover:bg-emerald-500/35 disabled:opacity-50"
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
