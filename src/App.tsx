import { Toaster } from "@/components/ui/sonner";
import AnalyticsQueryBuilder from "@/pages/AnalyticsQueryBuilder";
import PopulationDashboard from "@/pages/PopulationDashboard";
import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Dashboard route */}
        <Route path="/dashboard" element={<PopulationDashboard />} />

        {/* Query Builder route */}
        <Route path="/query-builder" element={<AnalyticsQueryBuilder />} />

        {/* 404 fallback */}
        <Route path="*" element={<div>404 - Page Not Found</div>} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
};

export default App;
