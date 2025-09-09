// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ResetPassword from "./pages/ResetPassword";
import RoleRoute from "./auth/RoleRoute";
import Admin from "./pages/Admin";
import AdminModelPeriods from "./pages/AdminModelPeriods";
import AdminPeriodPlatforms from "./pages/AdminPeriodPlatforms";
import AdminPeriodDiscounts from "./pages/AdminPeriodDiscounts";
import ModelDashboard from "./pages/ModelDashboard";

function HomeRedirect() {
  const { user } = useAuth();
  return user ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <Navigate to="/login" replace />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route index element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          {/* Nueva ruta pública */}
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleRoute roles={["admin"]}>
                  <Admin />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route
            path="/admin/periods/:modelId"
            element={<AdminModelPeriods />}
          />
          <Route
            path="/admin/models/:modelId/periods/:periodId/platforms"
            element={
              <RoleRoute roles={["admin"]}>
                <AdminPeriodPlatforms />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/models/:modelId/periods/:periodId/discounts"
            element={
              <RoleRoute roles={["admin"]}>
                <AdminPeriodDiscounts />
              </RoleRoute>
            }
          />
          <Route
            path="/ping"
            element={<div style={{ padding: 24 }}>Router OK</div>}
          />
          <Route
            path="/model"
            element={
              <RoleRoute roles={["model"]}>
                <ModelDashboard />
              </RoleRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
