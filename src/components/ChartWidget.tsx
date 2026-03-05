import { type QueryRow } from "@/types/query";
import * as echarts from "echarts";
import { useEffect, useRef } from "react";

import { buildOption } from "@/pages/PopulationDashboard";

interface ChartWidgetProps {
    type: "line" | "bar" | "pie"
    data?: QueryRow[]
    schema?: string[]
}

export default function ChartWidget({ type, data, schema }: ChartWidgetProps) {
    const ref = useRef<HTMLDivElement>(null)
    const chartRef = useRef<echarts.ECharts>(null)

    useEffect(() => {
        if (!ref.current) return

        chartRef.current = echarts.init(ref.current)

        return () => chartRef.current?.dispose()
    }, [])

    useEffect(() => {
        if (!chartRef.current) return

        chartRef.current.setOption(buildOption(type, data, schema))
    }, [type, data, schema])

    return <div ref={ref} className="h-full w-full" />
}