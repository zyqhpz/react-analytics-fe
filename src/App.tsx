import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/context/AuthContext";
import AnalyticsQueryBuilder from "@/pages/AnalyticsQueryBuilder";
import GraphQLPlayground from "@/pages/GraphQLPlayground";
import LoginPage from "@/pages/LoginPage";
import PopulationDashboard from "@/pages/PopulationDashboard";
import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Navigate
              to={isAuthenticated ? "/dashboard" : "/login"}
              replace
            />
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<LoginPage />} />
          <Route path="/dashboard" element={<PopulationDashboard />} />
          <Route path="/query-builder" element={<AnalyticsQueryBuilder />} />
          <Route path="/graphql-playground" element={<GraphQLPlayground />} />
        </Route>
        <Route path="*" element={<div>404 - Page Not Found</div>} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
};

export default App;
