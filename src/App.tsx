import { Toaster } from "@/components/ui/sonner";
import AnalyticsQueryBuilder from "@/pages/AnalyticsQueryBuilder";
import GraphQLPlayground from "@/pages/GraphQLPlayground";
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

        {/* GraphQL Playground route */}
        <Route path="/graphql-playground" element={<GraphQLPlayground />} />

        {/* 404 fallback */}
        <Route path="*" element={<div>404 - Page Not Found</div>} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
};

export default App;
