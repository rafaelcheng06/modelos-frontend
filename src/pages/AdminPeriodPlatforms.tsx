// src/pages/AdminPeriodPlatforms.tsx
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type PlatformRow = {
  id: string;
  name: string;
  unit_type: "usd" | "tokens" | "credits" | "eur";
  default_unit_to_usd: number | null;
  supports_weeks: boolean;
  has_traffic: boolean;
  selected: boolean;

  // NUEVO:
  isStripchat?: boolean;
  isChaturbate?: boolean;
  traffic_enabled?: boolean;
  traffic_massive_enabled?: boolean;
  traffic_positioning_enabled?: boolean;
  premium_state?: "none" | "premium_15" | "premium_25";
};

export default function AdminPeriodPlatforms() {
  const { modelId, periodId } = useParams<{
    modelId: string;
    periodId: string;
  }>();

  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    if (!periodId) {
      console.warn("Sin periodId, no cargo plataformas");
      return;
    }
    setLoading(true);
    setErr(null);
    console.log("[load] modelId:", modelId, "periodId:", periodId);

    try {
      // 1) Todas las plataformas
      const { data: platforms, error: e1 } = await supabase
        .from("platforms")
        .select(
          "id, name, unit_type, default_unit_to_usd, supports_weeks, has_traffic"
        )
        .order("name", { ascending: true });

      if (e1) throw e1;
      console.log("[load] platforms:", platforms?.length);

      // 2) Enlaces del período actual
      const { data: links, error: e2 } = await supabase
        .from("model_period_platforms")
        .select(
          "platform_id, traffic_enabled, traffic_massive_enabled, traffic_positioning_enabled, premium_state"
        )
        .eq("model_period_id", periodId);

      if (e2) throw e2;
      console.log("[load] links:", links?.length);

      const byId = new Map((links ?? []).map((l) => [l.platform_id, l]));
      const withSelection = (platforms ?? []).map((p) => {
        const link = byId.get(p.id);
        return {
          ...p,
          selected: byId.has(p.id),
          isStripchat: p.name?.toLowerCase().includes("strip"),
          isChaturbate: p.name?.toLowerCase().includes("chatur"),
          traffic_enabled: link?.traffic_enabled ?? false,
          traffic_massive_enabled: link?.traffic_massive_enabled ?? false,
          traffic_positioning_enabled:
            link?.traffic_positioning_enabled ?? false,
          premium_state: link?.premium_state ?? "none",
        };
      });

      setRows(withSelection);
    } catch (err: any) {
      console.error("[load] error:", err);
      setErr(err?.message ?? String(err));
    } finally {
      setLoading(false); // <- pase lo que pase, salimos del estado "Cargando…"
    }
  }
  async function handleTogglePlatform(
    periodId: string,
    platformId: string,
    next: boolean // 👈 aquí se define el parámetro
  ) {
    // 👇 esto es para rollback si falla
    const snapshot = rows;

    try {
      setSavingId(platformId);

      // --- 1) Optimista: actualizar UI al instante
      setRows((prev) =>
        prev.map((r) => (r.id === platformId ? { ...r, selected: next } : r))
      );

      // --- 2) Guardar en Supabase
      if (next) {
        // marcar como usada
        const { error } = await supabase
          .from("model_period_platforms")
          .upsert(
            { model_period_id: periodId, platform_id: platformId },
            { onConflict: "model_period_id,platform_id" }
          );
        if (error) throw error;
      } else {
        // desmarcar (eliminar vínculo)
        const { error } = await supabase
          .from("model_period_platforms")
          .delete()
          .eq("model_period_id", periodId)
          .eq("platform_id", platformId);
        if (error) throw error;
      }
    } catch (e: any) {
      // --- 3) Rollback si falla
      setRows(snapshot);
      setErr(e?.message ?? String(e));
    } finally {
      setSavingId(null);
    }
  }
  async function handleToggleTraffic(
    periodId: string,
    platformId: string,
    field:
      | "traffic_enabled"
      | "traffic_massive_enabled"
      | "traffic_positioning_enabled"
      | "premium_state",
    value: boolean | "none" | "premium_15" | "premium_25"
  ) {
    setSavingId(platformId);

    // 1) Optimistic: guardo el valor anterior por si hay que hacer rollback
    let prevValue: any;
    setRows((prev) =>
      prev.map((p) => {
        if (p.id === platformId) {
          prevValue = p[field as keyof typeof p];
          return { ...p, [field]: value };
        }
        return p;
      })
    );

    try {
      // 2) Persistir (con .select() para forzar retorno/RLS)
      const { error } = await supabase
        .from("model_period_platforms")
        .upsert(
          {
            model_period_id: periodId,
            platform_id: platformId,
            [field]: value,
          },
          { onConflict: "model_period_id,platform_id" }
        )
        .select("platform_id");

      if (error) throw error;
    } catch (err) {
      console.error("[TRAFFIC][SAVE][ERR]", { platformId, field, value, err });
      // Rollback si algo falló
      setRows((prev) =>
        prev.map((p) =>
          p.id === platformId ? { ...p, [field]: prevValue } : p
        )
      );
      alert("No se pudo guardar el cambio. Revisa conexión/políticas RLS.");
    } finally {
      // 3) Fin
      setSavingId(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  return (
    <div style={{ padding: 24 }}>
      {/* Botón Atrás */}
      <div style={{ marginBottom: 12 }}>
        <Link to={`/admin/periods/${modelId}`}>← Atrás</Link>
      </div>
      <h1>Configurar plataformas</h1>
      <p style={{ color: "#666" }}>
        Modelo: {modelId} · Período: {periodId}
      </p>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div
        style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 6 }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderBottom: "1px solid #eee",
                }}
              >
                Usar
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderBottom: "1px solid #eee",
                }}
              >
                Plataforma
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderBottom: "1px solid #eee",
                }}
              >
                Unidad
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderBottom: "1px solid #eee",
                }}
              >
                Unit→USD (def.)
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderBottom: "1px solid #eee",
                }}
              >
                Semanas
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderBottom: "1px solid #eee",
                }}
              >
                Tráfico
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td style={{ padding: 8 }} colSpan={6}>
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td style={{ padding: 8, color: "#888" }} colSpan={6}>
                  Sin plataformas
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    <input
                      type="checkbox"
                      checked={r.selected} // <-- SIEMPRE booleano y NO invertido
                      disabled={savingId === r.id}
                      onChange={(e) => {
                        console.log("[UI] click usar:", {
                          id: r.id,
                          next: e.target.checked,
                        });
                        void handleTogglePlatform(
                          periodId!,
                          r.id,
                          e.target.checked
                        );
                      }}
                    />
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {r.name}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {r.unit_type}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {r.default_unit_to_usd ?? "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {r.supports_weeks ? "Sí" : "No"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {/* Stripchat: un solo toggle */}
                    {r.isStripchat && (
                      <label
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!!r.traffic_enabled}
                          disabled={!r.selected || savingId === r.id}
                          onChange={(e) =>
                            handleToggleTraffic(
                              periodId!,
                              r.id,
                              "traffic_enabled",
                              e.target.checked
                            )
                          }
                        />
                        Tráfico Stripchat
                      </label>
                    )}

                    {/* Chaturbate: masivo y posicionamiento */}
                    {r.isChaturbate && (
                      <div
                        style={{
                          display: "flex",
                          gap: 14,
                          alignItems: "center",
                        }}
                      >
                        <label
                          style={{
                            display: "inline-flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!r.traffic_massive_enabled}
                            disabled={!r.selected || savingId === r.id}
                            onChange={(e) =>
                              handleToggleTraffic(
                                periodId!,
                                r.id,
                                "traffic_massive_enabled",
                                e.target.checked
                              )
                            }
                          />
                          Masivo
                        </label>

                        <label
                          style={{
                            display: "inline-flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!r.traffic_positioning_enabled}
                            disabled={!r.selected || savingId === r.id}
                            onChange={(e) =>
                              handleToggleTraffic(
                                periodId!,
                                r.id,
                                "traffic_positioning_enabled",
                                e.target.checked
                              )
                            }
                          />
                          Posicionamiento
                        </label>
                      </div>
                    )}

                    {/* Trafico Premium */}
                    {r.isChaturbate && (
                      <div style={{ marginTop: 8 }}>
                        <label
                          style={{
                            display: "inline-flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          Premium:
                          <select
                            value={r.premium_state ?? "none"}
                            disabled={!r.selected || savingId === r.id}
                            onChange={(e) =>
                              handleToggleTraffic(
                                periodId!,
                                r.id,
                                "premium_state",
                                e.target.value as
                                  | "none"
                                  | "premium_15"
                                  | "premium_25"
                              )
                            }
                          >
                            <option value="none">Sin premium</option>
                            <option value="premium_15">Premium 15%</option>
                            <option value="premium_25">Premium 25%</option>
                          </select>
                        </label>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
