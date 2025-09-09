import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { fetchGroceriesTotal } from "../lib/supaGroceries";

type PeriodRow = {
  id: string;
  period_name: string;
  weeks_count: number;
  weeks_selected: number[];
  period_type: string;
  groceries_enabled: boolean;
  start_date?: string;
  end_date?: string;
  created_at: string;
  period_percent: number | null;
  tc_usd_cop: number | null;
  tc_eur_usd: number | null;
};

export default function AdminModelPeriods() {
  const { modelId: routeId } = useParams<{ modelId: string }>();
  const location = useLocation() as any;
  const navigate = useNavigate();

  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState<number>(1);
  const [percent, setPercent] = useState<string>("");

  // Abarrotes (UI)
  const [gEnabled, setGEnabled] = useState<boolean>(false);
  const [gStart, setGStart] = useState<string>(""); // yyyy-mm-dd
  const [gEnd, setGEnd] = useState<string>(""); // yyyy-mm-dd

  // determinamos el modelId
  const modelId: string | undefined = routeId || location?.state?.modelId;

  const [saving, setSaving] = useState(false);

  //tasas de conversion
  const [usdToCop, setUsdToCop] = useState<number>(1);
  const [eurToUsd, setEurToUsd] = useState<number>(1);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  console.log("modelId =>", modelId); // debug

  // cargar periodos
  async function load() {
    if (!modelId) return;
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("model_periods")
      .select("*")
      .eq("model_id", modelId)
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setRows(data ?? []);
    setLoading(false);
  }
  // Sincroniza tasas del periodo seleccionado -> estados usdToCop / eurToUsd
  useEffect(() => {
    const sel = (rows || []).find((r: any) => r.id === selectedPeriodId);
    if (!sel) return;

    setUsdToCop(Number(sel.tc_usd_cop ?? 1));
    setEurToUsd(Number(sel.tc_eur_usd ?? 1));
  }, [rows, selectedPeriodId]);

  // crear periodo custom
  async function handleCreateCustom() {
    if (!modelId) return;
    setErr(null);

    // 1) construir [1..weeks] si lo necesitas en otro lado
    const selectedWeeks = Array.from({ length: weeks }, (_, i) => i + 1);

    // 2) normalizar porcentaje -> number | null
    const percentValue =
      percent.trim() === ""
        ? null
        : Math.max(0, Math.min(100, Number(percent)));

    // 3) validaciones de abarrotes (solo si está activado)
    if (gEnabled) {
      if (!gStart || !gEnd) {
        setErr("Debes ingresar fecha inicio y fecha fin para abarrotes.");
        return;
      }
      if (gStart > gEnd) {
        setErr("La fecha de inicio no puede ser mayor a la fecha fin.");
        return;
      }
    }

    // 4) nombre de columnas reales en model_periods
    const COL_G_ENABLED = "groceries_enabled"; // bool
    const COL_G_START = "start_date"; // date
    const COL_G_END = "end_date"; // date

    // 5) payload único
    const payload = {
      model_id: modelId,
      period_name: name.trim(),
      weeks_count: weeks,
      weeks_selected: selectedWeeks,
      period_type: "custom",
      period_percent: percentValue,
      tc_usd_cop: usdToCop,
      tc_eur_usd: eurToUsd,

      // nuevos campos de abarrotes
      [COL_G_ENABLED]: gEnabled,
      [COL_G_START]: gEnabled ? gStart : null,
      [COL_G_END]: gEnabled ? gEnd : null,
    };

    // 6) único insert (el anterior elimínalo)
    const { error: periodError } = await supabase
      .from("model_periods")
      .insert(payload);

    if (periodError) {
      setErr(periodError.message);
      return;
    }

    // 7) limpiar y recargar
    setName("");
    setWeeks(1);
    setPercent(""); // deja string vacío como ya lo tenías
    setGEnabled(false);
    setGStart("");
    setGEnd("");
    await load();
  }
  async function handleDuplicateDeep(periodId: string) {
    try {
      setSaving(true);
      setErr(null);

      // 1) Leer período original
      const { data: orig, error: readErr } = await supabase
        .from("model_periods")
        .select(
          "model_id, period_name, weeks_count, weeks_selected, period_type, period_percent, groceries_enabled, start_date, end_date"
        )
        .eq("id", periodId)
        .single();

      if (readErr || !orig)
        throw readErr ?? new Error("No se encontró el período a duplicar.");

      // Helpers
      const toYMD = (d: any) => (d ? String(d).slice(0, 10) : "");

      // 2) Pedir nuevos datos
      const newName = window.prompt(
        "Nombre del período (copia):",
        `${orig.period_name ?? "Período"} (copia)`
      );
      if (!newName) return;

      const weeksStr = window.prompt(
        "Cantidad de semanas:",
        String(orig.weeks_count ?? 1)
      );
      const weeks = Number(weeksStr);
      if (!Number.isFinite(weeks) || weeks < 1 || weeks > 13) {
        alert("Cantidad de semanas inválida (1–13).");
        return;
      }

      const percentStr = window.prompt(
        "Porcentaje (%):",
        String(orig.period_percent ?? 0)
      );
      const percent = Math.max(0, Math.min(100, Number(percentStr)));
      if (!Number.isFinite(percent)) {
        alert("Porcentaje inválido.");
        return;
      }

      let gEnabled = !!orig.groceries_enabled;
      let gStart: string | null = null;
      let gEnd: string | null = null;

      // Solo pedimos fechas si el original tenía abarrotes habilitados
      if (gEnabled) {
        const defS = toYMD(orig.start_date);
        const defE = toYMD(orig.end_date);
        const s = window.prompt("Abarrotes: fecha inicio (YYYY-MM-DD):", defS);
        const e = window.prompt("Abarrotes: fecha fin (YYYY-MM-DD):", defE);
        if (!s || !e) {
          alert("Debes ingresar ambas fechas de abarrotes.");
          return;
        }
        if (s > e) {
          alert(
            "La fecha inicio de abarrotes no puede ser mayor a la fecha fin."
          );
          return;
        }
        gStart = s;
        gEnd = e;
      }

      // 3) Crear el nuevo período
      const newPayload = {
        model_id: orig.model_id,
        period_name: newName.trim(),
        weeks_count: weeks,
        weeks_selected: orig.weeks_selected ?? null,
        period_type: orig.period_type ?? "custom",
        period_percent: percent,
        groceries_enabled: gEnabled,
        start_date: gEnabled ? gStart : null,
        end_date: gEnabled ? gEnd : null,
      };

      const { data: newRow, error: insErr } = await supabase
        .from("model_periods")
        .insert(newPayload)
        .select("id")
        .single();

      if (insErr || !newRow?.id)
        throw insErr ?? new Error("No se pudo crear el período copia.");
      const newPeriodId = newRow.id as string;

      // 4) Copiar PLATAFORMAS
      // Traemos todas las columnas para no adivinar; luego quitamos id/foreigns de origen
      const { data: oldPlats, error: platsErr } = await supabase
        .from("model_period_platforms")
        .select("*")
        .eq("model_period_id", periodId);

      if (platsErr) throw platsErr;

      if (oldPlats && oldPlats.length) {
        const platCopies = oldPlats.map((p: any) => {
          const { id, model_period_id, created_at, updated_at, ...rest } = p;
          return { ...rest, model_period_id: newPeriodId };
        });

        const { error: insPlatsErr } = await supabase
          .from("model_period_platforms")
          .insert(platCopies);

        if (insPlatsErr) throw insPlatsErr;
      }

      // 5) Copiar DESCUENTOS
      // 5) Copiar DESCUENTOS (respetando UNIQUE (model_period_id, discount_id))
      const { data: oldDisc, error: discErr } = await supabase
        .from("period_discounts")
        .select("*")
        .eq("model_period_id", periodId);

      if (discErr) throw discErr;

      // a) Deduplicar por discount_id -> nos quedamos con la más nueva
      const byDiscount = new Map<string, any>();
      for (const d of oldDisc ?? []) {
        if (!d?.discount_id) continue;
        const prev = byDiscount.get(d.discount_id);
        if (!prev || new Date(d.created_at) > new Date(prev.created_at)) {
          byDiscount.set(d.discount_id, d);
        }
      }

      // b) Evitar conflictos si el nuevo período ya tiene alguno insertado (reintentos)
      const { data: already, error: alErr } = await supabase
        .from("period_discounts")
        .select("discount_id")
        .eq("model_period_id", newPeriodId);
      if (alErr) throw alErr;

      const alreadySet = new Set(
        (already ?? []).map((x: any) => x.discount_id)
      );

      // c) Preparar filas finales sin columnas problemáticas
      const discCopies = Array.from(byDiscount.values())
        .filter((d: any) => !alreadySet.has(d.discount_id))
        .map((d: any) => {
          const { id, model_period_id, created_at, updated_at, ...rest } = d;
          return { ...rest, model_period_id: newPeriodId };
        });

      // d) Insertar si hay algo que copiar
      if (discCopies.length) {
        const { error: insDiscErr } = await supabase
          .from("period_discounts")
          .insert(discCopies);
        if (insDiscErr) throw insDiscErr;
      }

      // 6) Refrescar
      await load();
      alert("Período duplicado con plataformas y descuentos ✅");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? String(e));
      alert(`No se pudo duplicar: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }
  async function handleEditPeriod(periodId: string) {
    try {
      // 1) Leer fila actual (para pre-cargar valores)
      const { data: p, error: readErr } = await supabase
        .from("model_periods")
        .select(
          "period_name, weeks_count, period_percent, groceries_enabled, start_date, end_date"
        )
        .eq("id", periodId)
        .single();

      if (readErr || !p) {
        alert("No se pudo leer el período.");
        return;
      }

      // 2) Prompts (rápidos). Puedes dejarlos vacíos para conservar el valor actual.
      const name =
        window.prompt("Nombre del período:", p.period_name ?? "") ??
        p.period_name;
      const weeks = window.prompt(
        "Cantidad de semanas:",
        String(p.weeks_count ?? 1)
      );
      const percent =
        window.prompt("Porcentaje (%):", String(p.period_percent ?? "")) ??
        String(p.period_percent ?? "");
      const gEnabledStr =
        window.prompt(
          "¿Abarrotes habilitado? (si/no):",
          p.groceries_enabled ? "si" : "no"
        ) ?? (p.groceries_enabled ? "si" : "no");
      const gEnabled = gEnabledStr.trim().toLowerCase() === "si";

      let gStart = p.start_date,
        gEnd = p.end_date;
      if (gEnabled) {
        gStart =
          window.prompt(
            "Fecha inicio abarrotes (YYYY-MM-DD):",
            p.start_date ?? ""
          ) || null;
        gEnd =
          window.prompt(
            "Fecha fin abarrotes (YYYY-MM-DD):",
            p.end_date ?? ""
          ) || null;

        if (!gStart || !gEnd) {
          alert("Si abarrotes está habilitado, ambas fechas son obligatorias.");
          return;
        }
        if (String(gStart) > String(gEnd)) {
          alert("La fecha de inicio no puede ser mayor a la fecha fin.");
          return;
        }
      } else {
        gStart = null;
        gEnd = null;
      }

      // Normaliza numéricos

      const percentNum =
        String(percent).trim() === ""
          ? null
          : Math.max(0, Math.min(100, Number(percent)));
      // Normalizar semanas antes de enviar a la BD
      let weeksNum = Number(weeks || p.weeks_count || 1);

      if (isNaN(weeksNum) || weeksNum < 1) {
        weeksNum = 1;
      }
      if (weeksNum > 12) {
        weeksNum = 12;
      }

      // 3) Actualizar
      const { error: updErr } = await supabase
        .from("model_periods")
        .update({
          period_name: name?.trim() || p.period_name,
          weeks_count: weeksNum,
          period_percent: percentNum,
          groceries_enabled: gEnabled,
          start_date: gStart,
          end_date: gEnd,
        })
        .eq("id", periodId);

      if (updErr) {
        alert("No se pudo actualizar: " + updErr.message);
        return;
      }

      // 4) Refrescar lista
      await load();
      alert("Período actualizado.");
    } catch (e: any) {
      console.error(e);
      alert("Error: " + (e?.message ?? String(e)));
    }
  }
  async function handleTestGroceries() {
    try {
      if (!gEnabled) {
        alert("Activa 'Abarrotes' para probar.");
        return;
      }
      if (!gStart || !gEnd) {
        alert("Completa fecha inicio y fecha fin.");
        return;
      }

      // Por ahora pedimos el nombre por prompt (luego lo conectamos con el nombre real de la modelo)
      const customer = window.prompt(
        "Nombre EXACTO de la modelo/cliente en Abarrotes:"
      );
      if (!customer) return;

      const total = await fetchGroceriesTotal(
        customer,
        gStart, // formato YYYY-MM-DD
        gEnd
      );

      alert(
        `Total abarrotes para "${customer}" entre ${gStart} y ${gEnd}: ${total.toLocaleString(
          "es-CO"
        )} COP`
      );
    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message ?? String(e)}`);
    }
  }

  async function handleUpdatePercent(rowId: string, newValue: string) {
    setErr(null);

    // permite vacío => null
    const normalized =
      newValue.trim() === ""
        ? null
        : Math.max(0, Math.min(100, Number(newValue)));

    // optimista: actualiza la fila en memoria
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, period_percent: normalized } : r
      )
    );

    const { error } = await supabase
      .from("model_periods")
      .update({ period_percent: normalized })
      .eq("id", rowId);

    if (error) setErr(error.message);
  }
  // Actualiza sólo las tasas de cambio (USD→COP y EUR→USD) de un período
  async function updatePeriodRatesInline(
    periodId: string,
    usd: number,
    eur: number
  ) {
    try {
      setSaving(true);
      setErr(null);

      // 1) Guarda en BD
      const { error } = await supabase
        .from("model_periods")
        .update({
          tc_usd_cop: usd,
          tc_eur_usd: eur,
        })
        .eq("id", periodId);

      if (error) throw error;

      // 2) Refresca la UI local (normalizamos a string)
      setRows((prev) =>
        (prev || []).map((r) =>
          String(r.id) === String(periodId)
            ? ({ ...r, tc_usd_cop: usd, tc_eur_usd: eur } as PeriodRow)
            : r
        )
      );
    } catch (e: any) {
      setErr(e.message || "Error guardando tasas");
    } finally {
      setSaving(false);
    }
  }
  async function handleDeletePeriod(periodId: string, periodName?: string) {
    try {
      setErr(null);
      const ok = window.confirm(
        `¿Eliminar el período "${
          periodName ?? periodId
        }"? Esta acción no se puede deshacer.`
      );
      if (!ok) return;

      setSaving(true);

      // 1) Borra dependencias (si NO tienes ON DELETE CASCADE)
      await supabase
        .from("period_discounts")
        .delete()
        .eq("model_period_id", periodId);
      await supabase
        .from("model_period_platforms")
        .delete()
        .eq("model_period_id", periodId);

      // 2) Borra el período
      const { error: delErr } = await supabase
        .from("model_periods")
        .delete()
        .eq("id", periodId)
        .single();

      if (delErr) throw delErr;

      // 3) Refresca la lista
      await load();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (modelId) load();
  }, [modelId]);

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #eee",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: 8,
    borderBottom: "1px solid #f6f6f6",
    verticalAlign: "top",
  };

  return (
    <section>
      <h2>Períodos del modelo</h2>
      <p>
        ID: {modelId} —{" "}
        <a onClick={() => navigate("/admin")}>Volver a Administración</a>
      </p>

      <div>
        <h3>Crear nuevo período (tokens, personalizado)</h3>

        <div style={{ marginBottom: "10px" }}>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            Nombre del período
          </label>
          <input
            type="text"
            value={name}
            placeholder="Ej. Junio Q1 / Período 1"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            Cantidad de semanas
          </label>
          <input
            type="number"
            min={1}
            max={3}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
          />
          <div style={{ margin: "8px 0" }}>
            <label style={{ display: "block", fontWeight: 600 }}>
              Porcentaje (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              style={{ padding: 8, minWidth: 120 }}
              placeholder="Ej. 60"
            />
          </div>
        </div>
        {/* --- Abarrotes --- */}
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 6,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Abarrotes</div>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={gEnabled}
              onChange={(e) => setGEnabled(e.target.checked)}
            />
            Incluir abarrotes en este período
          </label>

          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                Fecha inicio
              </div>
              <input
                type="date"
                value={gStart}
                onChange={(e) => setGStart(e.target.value)}
                disabled={!gEnabled}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                Fecha fin
              </div>
              <input
                type="date"
                value={gEnd}
                onChange={(e) => setGEnd(e.target.value)}
                disabled={!gEnabled}
              />
            </div>
          </div>
        </div>
        {/* Tasas de conversión (se guardan con el nuevo período) */}
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "220px 200px",
            gap: 8,
            alignItems: "center",
          }}
        >
          <label htmlFor="new-usdToCop" style={{ fontWeight: 600 }}>
            1 USD → COP
          </label>
          <input
            id="new-usdToCop"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={usdToCop}
            onChange={(e) => setUsdToCop(Number(e.target.value) || 0)}
            style={{
              padding: "6px 8px",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />

          <label htmlFor="new-eurToUsd" style={{ fontWeight: 600 }}>
            1 EUR → USD
          </label>
          <input
            id="new-eurToUsd"
            type="number"
            inputMode="decimal"
            step="0.0001"
            min={0}
            value={eurToUsd}
            onChange={(e) => setEurToUsd(Number(e.target.value) || 0)}
            style={{
              padding: "6px 8px",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
        </div>
        <button onClick={handleCreateCustom}>Crear período</button>
        <button
          onClick={() => {
            setName("");
            setWeeks(1);
          }}
        >
          Cancelar
        </button>
        <button onClick={handleTestGroceries} style={{ marginLeft: 8 }}>
          Probar Abarrotes
        </button>
      </div>

      <h3>Períodos existentes</h3>
      {err && <p style={{ color: "red" }}>{err}</p>}

      <table>
        <thead>
          <tr>
            <th style={th}>Nombre</th>
            <th style={th}>Semanas</th>
            <th style={th}>Porcentaje</th>
            <th style={th}>1 USD → COP</th>
            <th style={th}>1 EUR → USD</th>
            <th style={th}>Abarrotes</th>
            <th style={th}>Tipo</th>
            <th style={th}>Rango quincena</th>
            <th style={th}>Creado</th>
            <th style={th}></th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td style={td} colSpan={7}>
                Cargando...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td style={{ ...td, color: "#888" }} colSpan={7}>
                Sin períodos todavía
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.period_name || "-"}</td>
                <td style={td}>{r.weeks_count ?? "-"}</td>
                <td style={td}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={r.period_percent ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      // reflejo inmediato en UI sin guardar aún (opcional)
                      setRows((prev) =>
                        prev.map((row) =>
                          row.id === r.id
                            ? {
                                ...row,
                                period_percent: val === "" ? null : Number(val),
                              }
                            : row
                        )
                      );
                    }}
                    onBlur={(e) => handleUpdatePercent(r.id, e.target.value)}
                    style={{ width: 90, padding: 6 }}
                    title="Editar porcentaje del período"
                  />
                </td>
                {/* 1 USD → COP */}
                <td style={td}>
                  <input
                    type="number"
                    step="0.01"
                    value={r.tc_usd_cop ?? ""}
                    onChange={(e) =>
                      updatePeriodRatesInline(
                        r.id,
                        Number(e.target.value),
                        r.tc_eur_usd ?? 1
                      )
                    }
                    style={{ width: "80px" }}
                  />
                </td>

                {/* 1 EUR → USD */}
                <td style={td}>
                  <input
                    type="number"
                    step="0.0001"
                    value={r.tc_eur_usd ?? ""}
                    onChange={(e) =>
                      updatePeriodRatesInline(
                        r.id,
                        r.tc_usd_cop ?? 1,
                        Number(e.target.value)
                      )
                    }
                    style={{ width: "80px" }}
                  />
                </td>
                <td style={td}>{r.groceries_enabled ? "Sí" : "No"}</td>
                <td style={td}>{r.period_type}</td>
                <td style={td}>
                  {r.start_date && r.end_date
                    ? `${r.start_date} → ${r.end_date}`
                    : "-"}
                </td>
                <td style={td}>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : "-"}
                </td>

                <td style={td}>
                  <button
                    onClick={() =>
                      navigate(
                        `/admin/models/${modelId}/periods/${r.id}/platforms`
                      )
                    }
                  >
                    Configurar Plataformas <br></br>
                  </button>
                  <button
                    onClick={() =>
                      navigate(
                        `/admin/models/${modelId}/periods/${r.id}/discounts`
                      )
                    }
                  >
                    Configurar Descuentos
                  </button>
                  <button
                    onClick={() => handleDeletePeriod(r.id, r.period_name)}
                    style={{ marginLeft: 8 }}
                    disabled={saving || loading}
                    title="Eliminar período"
                  >
                    🗑️ Eliminar
                  </button>
                  <button onClick={() => handleEditPeriod(r.id)}>Editar</button>
                  <button
                    style={{ marginLeft: 8 }}
                    disabled={saving}
                    onClick={() => handleDuplicateDeep(r.id)}
                  >
                    Duplicar
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
