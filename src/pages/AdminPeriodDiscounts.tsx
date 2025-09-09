import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { fetchGroceriesTotal } from "../lib/supaGroceries";

type AnyRow = Record<string, any>;

export default function AdminPeriodDiscounts() {
  const { modelId, periodId } = useParams<{
    modelId: string;
    periodId: string;
  }>();
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  function isEditableDiscount(r: any) {
    const name = r?.discount?.name ?? r?.discounts?.name ?? "";

    const editableNames = ["Préstamo", "Adelanto", "Productos"];
    // No editable si es sintético (_readOnly), o si no tiene id real (p. ej. traffic:...)
    if (!r?.id || r?._readOnly) return false;
    return editableNames.includes(name);
  }

  function formatAmount(amount: number | null | undefined) {
    if (amount === null || amount === undefined) return "—";
    return `${Number(amount).toLocaleString("es-CO")} COP`;
  }

  async function handleSaveAmount(row: any, raw: string) {
    try {
      setSavingId(row.id);
      // 1) Normaliza el valor
      const trimmed = String(raw ?? "").trim();
      const amount = trimmed === "" ? null : Number(trimmed);

      if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
        alert("Monto inválido");
        return;
      }

      // 2) Guardar
      if (row.id) {
        // UPDATE: solo enviar columnas que existen en period_discounts
        const { error } = await supabase
          .from("period_discounts")
          .update({ amount })
          .eq("id", row.id)
          .single();

        if (error) throw error;
      } else {
        // INSERT: fila nueva (para descuentos editables sin id)
        if (!row.discount_id) {
          alert("Falta discount_id");
          return;
        }
        const { data, error } = await supabase
          .from("period_discounts")
          .insert([
            {
              model_period_id: periodId,
              discount_id: row.discount_id,
              amount,
            },
          ])
          .select("id")
          .single();

        if (error) throw error;

        // Actualiza la fila en memoria con el id recién creado
        setRows((prev) =>
          prev.map((r) => (r === row ? { ...r, id: data.id } : r))
        );
      }
    } catch (e: any) {
      console.error(e);
      alert(`No se pudo actualizar: ${e.message ?? String(e)}`);
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreate() {
    if (!periodId) return;
    const name = window.prompt("Nombre del descuento:");
    if (!name) return;

    const amountStr = window.prompt(
      "Monto (número, puede ser % o USD según el tipo):",
      "0"
    );
    if (amountStr === null) return;

    const amount = Number(amountStr);

    setSaving(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("period_discounts")
        .insert([{ model_period_id: periodId, name, amount }])
        .select("*")
        .single();

      if (error) throw error;

      // Insertar al inicio de la tabla sin recargar
      setRows((prev) => [data, ...prev]);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const toYMD = (d?: string | Date | null) =>
    d ? String(d).slice(0, 10) : null; // YYYY-MM-DD

  useEffect(() => {
    (async () => {
      if (!periodId) return;
      setLoading(true);
      setErr(null);

      try {
        // 1) Descuentos guardados en DB
        const { data, error } = await supabase
          .from("period_discounts")
          .select(
            `
          id,
          discount_id,
          amount,
          created_at,
          discount:discounts ( name, currency )
        `
          )
          .eq("model_period_id", periodId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        // 2) Flags de tráfico por plataforma del período
        const { data: links, error: eLinks } = await supabase
          .from("model_period_platforms")
          .select(
            `
          platform_id,
          traffic_enabled,
          traffic_massive_enabled,
          traffic_positioning_enabled,
          premium_state,
          platform:platforms(name)
        `
          )
          .eq("model_period_id", periodId);

        if (eLinks) throw eLinks;

        // Tipado de la respuesta
        type LinkRow = {
          platform_id: string;
          traffic_enabled: boolean | null;
          traffic_massive_enabled: boolean | null;
          traffic_positioning_enabled: boolean | null;
          premium_state: string | null;
          platform?: { name?: string } | null;
        };

        const list: LinkRow[] = (links ?? []) as LinkRow[];

        // 3) Construir filas sintéticas de tráfico (solo visual)
        const synthetic: any[] = [];
        for (const l of list) {
          const pname = l.platform?.name ?? "Plataforma";

          if (l.traffic_massive_enabled) {
            synthetic.push({
              id: `traffic:${l.platform_id}:massive`,
              amount: 0,
              created_at: null,
              discount: { name: `Tráfico masivo - ${pname}`, currency: "COP" },
              _readOnly: true,
            });
          }

          if (l.traffic_positioning_enabled) {
            synthetic.push({
              id: `traffic:${l.platform_id}:positioning`,
              amount: 0,
              created_at: null,
              discount: { name: `Posicionamiento - ${pname}`, currency: "COP" },
              _readOnly: true,
            });
          }

          // Stripchat: por nombre de plataforma
          if (l.traffic_enabled && pname.toLowerCase().includes("strip")) {
            synthetic.push({
              id: `traffic:${l.platform_id}:stripchat`,
              amount: 0,
              created_at: null,
              discount: {
                name: `Tráfico Stripchat - ${pname}`,
                currency: "COP",
              },
              _readOnly: true,
            });
          }
          // Premium (informativo)
          if (l.premium_state && l.premium_state !== "none") {
            const pct =
              l.premium_state === "premium_25"
                ? "25%"
                : l.premium_state === "premium_15"
                ? "15%"
                : "";
            synthetic.push({
              id: `traffic:${l.platform_id}:premium`,
              amount: 0, // 👈 clave: que NO sea null/undefined
              created_at: null,
              discount: {
                name: `Premium ${pct} · ${pname}`,
                currency: "tokens", // 👈 así sabemos formatear como tokens
              },
              _readOnly: true,
            });
          }
        }
        // === Abarrotes: si el periodo lo tiene habilitado, agregamos una fila sintética ===

        const { data: periodRow, error: ePeriod } = await supabase
          .from("model_periods")
          .select("groceries_enabled, start_date, end_date, model_id")
          .eq("id", periodId)
          .single();

        console.log("[PERIODO]", { periodId, periodRow, ePeriod });

        if (periodRow && !ePeriod && periodRow.groceries_enabled) {
          // Fechas a YYYY-MM-DD (si ya vienen como date, toYMD las deja igual en string)
          const gStart = toYMD(periodRow.start_date);
          const gEnd = toYMD(periodRow.end_date);

          // 1) Obtener el nombre de la modelo SIN relaciones (segundo query)
          let modelName = "";
          if (periodRow.model_id) {
            const { data: mRow, error: eModel } = await supabase
              .from("models")
              .select("display_name")
              .eq("id", periodRow.model_id)
              .single();

            if (!eModel) {
              modelName = mRow?.display_name ?? "";
            } else {
              console.warn("[MODELO][ERROR]", eModel);
            }
            console.log("[MODELO]", { modelName });
          }

          // 2) Si tenemos todo, pedimos total a la otra app y agregamos la fila sintética
          if (modelName && gStart && gEnd) {
            const total = await fetchGroceriesTotal(modelName, gStart, gEnd);
            synthetic.push({
              id: `groceries:${periodId}`,
              amount: total ?? 0,
              created_at: null,
              discount: { name: "Abarrotes", currency: "COP" },
              _readOnly: true,
            });
          }
        }
        // === Fin Abarrotes ===

        // === 1) Traer flags y semanas por plataforma del período actual ===
        const { data: trafficLinks, error: errTraffic } = await supabase
          .from("model_period_platforms")
          .select(
            `
    platform_id,
    traffic_enabled,
    traffic_massive_enabled,
    premium_state,
    w1, w2, w3,
    platform:platforms(name)
  `
          )
          .eq("model_period_id", periodId);

        if (errTraffic) throw errTraffic;

        // Normalizar nombres de plataforma
        const typed = (trafficLinks ?? []) as Array<{
          platform?: { name?: string };
          traffic_enabled?: boolean;
          traffic_massive_enabled?: boolean;
          premium_state?: string | null;
          w1?: number | null;
          w2?: number | null;
          w3?: number | null;
        }>;

        const chRow = typed.find(
          (l) => String(l.platform?.name ?? "").toLowerCase() === "chaturbate"
        );
        const scRow = typed.find(
          (l) => String(l.platform?.name ?? "").toLowerCase() === "stripchat"
        );
        console.log("[DEBUG chRow]", chRow);
        console.log("[DEBUG scRow]", scRow);

        // Totales de tokens por plataforma
        const chTotal =
          Number(chRow?.w1 ?? 0) +
          Number(chRow?.w2 ?? 0) +
          Number(chRow?.w3 ?? 0);
        const scTotal =
          Number(scRow?.w1 ?? 0) +
          Number(scRow?.w2 ?? 0) +
          Number(scRow?.w3 ?? 0);

        // Reglas de escalas (idénticas para ambos; difieren valores)
        function amountMassiveCOP(total: number): number {
          if (total <= 3000) return 0;
          if (total <= 6000) return 50000;
          return 100000;
        }
        function amountBotsCOP(total: number): number {
          if (total <= 3000) return 0;
          if (total <= 6000) return 75000;
          return 150000;
        }

        // Aplicar flags: si el flag no está activo, el monto es 0
        const massAmountCop = chRow?.traffic_massive_enabled
          ? amountMassiveCOP(chTotal)
          : 0;
        const botsAmountCop = scRow?.traffic_enabled
          ? amountBotsCOP(scTotal)
          : 0;

        // DEBUG opcional (puedes borrar si no quieres logs)
        console.log("[ADMIN] tokens CH/SC =>", { chTotal, scTotal });
        console.log("[ADMIN] montos calculados =>", {
          massAmountCop,
          botsAmountCop,
        });
        // 4) Guardados + sintéticos
        const merged = [...(data ?? []), ...synthetic];

        const filled = (merged ?? []).map((r: any) => {
          const label = String(
            r?.discount?.name ?? r?.discounts?.name ?? ""
          ).toLowerCase();

          // Stripchat (bots)
          if (label.includes("stripchat")) {
            const v = Number(botsAmountCop || 0);
            return { ...r, amount_cop: v, amount: v, currency: "COP" };
          }

          // Chaturbate (masivo)
          if (label.includes("masivo")) {
            const v = Number(massAmountCop || 0);
            return { ...r, amount_cop: v, amount: v, currency: "COP" };
          }

          // Premium: sin monto (solo estado). No tocamos amount/amount_cop.
          return r;
        });

        setRows(filled);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [periodId]);

  return (
    <div style={{ padding: 24 }}>
      {/* Botón Atrás */}
      <div style={{ marginBottom: 12 }}>
        <Link
          to={`/admin/periods/${modelId}`}
          style={{
            textDecoration: "none",
            padding: "6px 10px",
            border: "1px solid #ddd",
            borderRadius: 6,
            display: "inline-block",
          }}
        >
          ← Atrás
        </Link>
      </div>

      <h1>Configurar descuentos</h1>
      <p style={{ color: "#666" }}>
        Modelo: {modelId} · Período: {periodId}
      </p>

      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <div style={{ margin: "12px 0", display: "flex", gap: 8 }}>
        <button disabled={saving || !periodId} onClick={handleCreate}>
          Nuevo descuento
        </button>
      </div>

      <div
        style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 6 }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                style={{
                  padding: 8,
                  borderBottom: "1px solid #eee",
                  textAlign: "left",
                }}
              >
                ID
              </th>
              <th
                style={{
                  padding: 8,
                  borderBottom: "1px solid #eee",
                  textAlign: "left",
                }}
              >
                Nombre/Tipo
              </th>
              <th
                style={{
                  padding: 8,
                  borderBottom: "1px solid #eee",
                  textAlign: "left",
                }}
              >
                Monto
              </th>
              <th
                style={{
                  padding: 8,
                  borderBottom: "1px solid #eee",
                  textAlign: "left",
                }}
              >
                Creado
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: 8 }}>
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 8, color: "#888" }}>
                  Sin descuentos
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  {/* 1) ID */}
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {r.id}
                  </td>

                  {/* 2) Nombre/Tipo */}
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {(() => {
                      // 1) Tomamos el nombre original que llega de la BD
                      const raw = (
                        r.discount?.name ??
                        r.discounts?.name ??
                        "-"
                      ).trim();

                      // 2) Separamos por " - " o " · " si viene con plataforma pegada
                      const parts = raw.split(/[-·]/); // ej: ["Tráfico Stripchat ", " Stripchat"]
                      const baseRaw = (parts[0] ?? "").trim(); // "Tráfico Stripchat"
                      const platform = (parts[1] ?? "").trim(); // "Stripchat" (si viene)

                      // 3) Normalizamos para comparar sin tildes / mayúsculas
                      const norm = baseRaw.toLowerCase();

                      // 4) Mapeo de etiquetas
                      let mapped = baseRaw;
                      if (norm.includes("stripchat")) mapped = "Tráfico Bots";
                      else if (norm.includes("posicionamiento"))
                        mapped = "Tráfico Posicionamiento";

                      // 5) Moneda (si existe) y armado final
                      const cur = (
                        r.discount?.currency ??
                        r.currency ??
                        ""
                      ).toUpperCase();
                      const pieces = [
                        mapped,
                        platform || null,
                        cur || null,
                      ].filter(Boolean);

                      return pieces.join(" · ");
                    })()}
                  </td>

                  {/* 3) Monto  */}
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {isEditableDiscount(r) ? (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        defaultValue={Number(r.amount ?? 0)}
                        disabled={savingId === r.id}
                        style={{ width: 120, padding: 6 }}
                        onBlur={(e) =>
                          handleSaveAmount(r, e.currentTarget.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    ) : (
                      // Mostrar según moneda: tokens o COP
                      (() => {
                        if (
                          r?.discount?.name
                            ?.toLowerCase()
                            .includes("posicionamiento")
                        ) {
                          const n = 60000;
                          return `${n.toLocaleString("es-CO")}\u00A0COP`;
                        }
                        if (
                          r?.discount?.name?.toLowerCase().includes("premium")
                        ) {
                          return ""; // no mostramos nada en Premium
                        }

                        const cur = r?.discount?.currency ?? r?.currency ?? "";
                        if (cur.toLowerCase() === "tokens") {
                          return `${Number(
                            r.amount ?? 0
                          ).toLocaleString()} tokens`;
                        }
                        return formatAmount(r.amount); // tu helper de COP
                      })()
                    )}
                  </td>

                  {/* 4) Creado */}
                  <td style={{ padding: 8, borderBottom: "1px solid #f6f6f6" }}>
                    {r.created_at
                      ? new Date(r.created_at).toLocaleString()
                      : " "}
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
