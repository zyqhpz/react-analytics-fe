import { getAuthHeaders } from "./client";

export const fetchDashboard = async (dashboardID: string) => {
    const res = await fetch(
        `http://localhost:8080/api/v1/dashboards/${dashboardID}?include_data=true`,
        {
            headers: getAuthHeaders(),
        },
    );

    const json = await res.json();

    if (!res.ok) {
        throw new Error(json.description);
    }

    return json
};