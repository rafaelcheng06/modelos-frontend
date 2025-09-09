// src/pages/Admin.tsx
import { useEffect, useState } from "react";
import { listModels, type ModelRow } from "../lib/models";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Admin() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const navigate = useNavigate();

  async function handleToggleActive(id: string, next: boolean) {
    try {
      setSavingId(id);
      const { error } = await supabase
        .from("models")
        .update({ active: next })
        .eq("id", id);
      if (error) throw error;
      // refresco local optimista
      setModels((prev) =>
        prev.map((m) => (m.id === id ? { ...m, active: next } : m))
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSavingId(null);
    }
  }

  // estado para saber qué id se está borrando
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // función para borrar un modelo
  async function handleDelete(id: string) {
    const ok = window.confirm(
      "¿Eliminar este modelo? Esta acción no se puede deshacer."
    );
    if (!ok) return;

    setDeletingId(id);
    setErr(null);

    const { error } = await supabase.from("models").delete().eq("id", id);

    setDeletingId(null);

    if (error) {
      setErr(error.message);
      return;
    }

    // refresca la tabla después de borrar
    await load();
  }

  async function load() {
    setErr(null);

    // pasamos showInactive si quieres que la función lo use
    const { data, error } = await listModels();

    if (error) {
      setErr(error.message);
      return;
    }

    const rows = showInactive
      ? data ?? []
      : (data ?? []).filter((m) => m.active === true);
    setModels(rows);
  }

  useEffect(() => {
    load();
  }, [showInactive]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Administración</h1>
      <label style={{ display: "inline-flex", gap: 8, margin: "12px 0" }}>
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Mostrar inactivas
      </label>
      {/*
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          placeholder="Nuevo modelo: nombre"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ padding: 8, minWidth: 260 }}
        />
        <button onClick={handleCreate} disabled={loading}>
          {loading ? "Creando…" : "Crear"}
        </button>
      </div>
*/}
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div
        style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 6 }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#fafafa" }}>
            <tr>
              <th style={th}>Nombre</th>
              <th style={th}>Activo</th>
              <th style={th}>Creado</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td style={td}>{m.display_name}</td>

                {/* Activo (toggle) */}
                <td style={td}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!m.active}
                      onChange={(e) =>
                        handleToggleActive(m.id, e.target.checked)
                      }
                      disabled={savingId === m.id}
                    />
                    {m.active ? "Sí" : "No"}
                  </label>
                </td>
                <td style={td}>{new Date(m.created_at).toLocaleString()}</td>
                <td style={td}>
                  <button
                    onClick={() => navigate(`/admin/periods/${m.id}`)}
                    style={{ marginRight: 8 }}
                  >
                    Períodos
                  </button>

                  {/* tu botón Eliminar ya existente */}

                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    style={{ color: "crimson" }}
                    title="Eliminar modelo"
                  >
                    {deletingId === m.id ? "Eliminando…" : "Eliminar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
  fontWeight: 600,
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f3f3f3",
  verticalAlign: "middle",
};
