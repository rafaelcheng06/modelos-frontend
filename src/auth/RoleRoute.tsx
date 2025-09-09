import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { getModelProfile } from "../lib/profile";

type Role = "admin" | "model";

type Props = {
  roles: Role[];
  children: React.ReactNode;
};

export default function RoleRoute({ roles, children }: Props) {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [checking, setChecking] = useState(true);
  const loc = useLocation();

  useEffect(() => {
    if (loading) return; // todavía cargando sesión, no hacer nada

    if (!user) {
      setChecking(false); // no hay sesión
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const prof = await getModelProfile();
        const inferred: Role | null =
          (prof.appUser?.role as Role | undefined) ??
          (user.user_metadata?.role as Role | undefined) ??
          (user.app_metadata?.role as Role | undefined) ??
          null;

        if (mounted) setRole(inferred);
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loading, user]);

  // Mientras está cargando
  if (loading || checking) {
    return <div style={{ padding: 24 }}>Cargando…</div>;
  }

  // Ya terminó de cargar y no hay usuario → login
  if (!user) {
    return <Navigate to="/login" replace state={{ next: loc.pathname }} />;
  }

  // Usuario no tiene rol permitido → redirige al inicio
  if (!role || !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  // OK → renderiza el hijo
  return <>{children}</>;
}
