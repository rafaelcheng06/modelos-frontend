// src/pages/Dashboard.tsx

import { useEffect, useState } from "react";
import { getModelProfile } from "../lib/profile";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Dashboard() {
  const [name, setName] = useState<string>(""); // nombre para mostrar
  const [role, setRole] = useState<string>(""); // admin | model
  const [authEmail, setAuthEmail] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { model, appUser, error } = await getModelProfile();
      if (!error) {
        setName(model?.display_name ?? "");
        setRole(appUser?.role ?? "");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email ?? "";
      setAuthEmail(email);
    })();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Bienvenida(o), {name || authEmail} — ({role})<br></br>
        {role === "admin" && <Link to="/admin">Ir al panel de Admin</Link>}
        {role === "model" && <Link to="/model">Ir al panel de Modelo</Link>}
      </p>

      <button onClick={handleLogout}>Cerrar sesión</button>
    </div>
  );
}
