// ModelDashboard.tsx
//
// Dashboard de Modelo: funcional y ordenado, con comentarios.
// Se usan los nombres reales de tus tablas/columnas:
// - model_periods (id, model_id, period_id, period_name, state, weeks_count, percent_used, tc_usd_cop)
// - model_period_platforms (platform_id, traffic_enabled, traffic_massive_enabled, premium_state) + join platforms
// - platforms (id, name, unit_type, default_unit_to_usd, supports_weeks, has_traffic)

import React, { useEffect, useMemo, useState } from "react";
// ⬇️ Ajusta este import si tu wrapper exporta distinto (default vs named)
import { supabase } from "../lib/supabaseClient"; // si en tu proyecto es `export const supabase = ...`, cambia a: `import { supabase } from "../lib/supabaseClient"`
import {
  fetchGroceriesTotal,
  fetchGroceriesDetail,
} from "../lib/supaGroceries";
// Clase de estilo reutilizable para inputs
const INPUT =
  "border rounded px-1 py-1  bg-[var(--bg-card)] border-[var(--border)] text-[var(--text)]";

// =======================
// Tipos de datos
// =======================
type SessionUser = {
  id: string;
  email: string | null;
};

type PeriodRow = {
  id: string;
  model_id: string;
  period_id: string | null;
  period_name: string;
  state: string | null;
  weeks_count: number | null;
  period_percent: number | null; // participación
  tc_usd_cop: number | null; // tasa USD en COP
  tc_eur_usd: number | null; // tasa EUR en USD
  goal_cop: number | null;
  meta_cop: number | null;
};

type PlatformCatalogRow = {
  id: string;
  name: string;
  unit_type: string | null; // "TOKENS" | "USD" | ...
  default_unit_to_usd: number | null; // ej. 0.05
  supports_weeks: boolean | null; // true = semanal (CB / SC)
  has_traffic: boolean | null;
};

type PeriodPlatformLink = {
  platform_id: string;
  traffic_enabled: boolean | null;
  traffic_massive_enabled: boolean | null;
  premium_state: string | null; // % premium de línea si aplica
  platforms: PlatformCatalogRow; // <-- join anidado
  total_tokens?: number | null;
};

// Producción local (temporal, UI). No guardamos nada todavía.
type LocalProd = {
  total_tokens?: number; // para TOTAL
  w1?: number;
  w2?: number;
  w3?: number;
  w4?: number;
  total?: number;
  // Si luego decides guardar premium por semana, aquí irían premium_w1..w4
};

// =======================
// Utilidades
// =======================
const clampNonNeg = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);
const applyPremium = (units: number, pct: number) => {
  const min = pct === 25 ? 2000 : pct === 15 ? 1000 : 0;
  const ded = Math.max(Math.ceil((units * pct) / 100), min);
  const net = Math.max(units - ded, 0);
  return { net, ded }; // 👈 OBLIGATORIO devolver objeto
};

async function updatePeriodMetaInline(params: {
  periodId: string;
  metaCop: number;
}) {
  try {
    const { periodId, metaCop } = params;
    if (!periodId) return;

    const { error } = await supabase
      .from("model_periods") // ← tu tabla de periodos
      .update({ meta_cop: metaCop }) // ← si tu columna se llama distinto, cámbiala aquí
      .eq("id", periodId);

    if (error) {
      console.error("[META][update][err]", error);
    } else {
      console.log("[META][update] OK:", { periodId, metaCop });
    }
  } catch (e) {
    console.error("[META][update][ex]", e);
  }
}

// =======================
// Componente principal
// =======================
export default function ModelDashboard() {
  // === Calcula neto después de Premium con mínimos ===

  // ---- estado base ----
  const [loading, setLoading] = useState(true);
  const [errorMsg, setError] = useState<string | null>(null);

  const [user, setUser] = useState<SessionUser | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  // Editables locales (placeholders visuales)
  const [usdRate, setUsdRate] = useState<number>(0);
  const [percent, setPercent] = useState<number>(50);
  const [weeksCount, setWeeksCount] = useState<number>(0);
  const [status, setStatus] = useState<string>("-");
  const [metaCopLocal, setMetaCopLocal] = useState<number>(0);

  // Producción temporal por plataforma
  const [prod, setProd] = useState<Record<string, LocalProd>>({});
  // Filas de plataformas (modelo + catálogo)
  const [platRows, setPlatRows] = useState<PeriodPlatformLink[]>([]);

  // === Estados locales para los TC en el dashboard ===
  const [usdToCopLocal, setUsdToCopLocal] = React.useState<number | "">("");
  const [eurToUsdLocal, setEurToUsdLocal] = React.useState<number | "">("");

  let grandTokens = 0;
  let grandUsd = 0;

  //constantes para descuentos
  const [discountRows, setDiscountRows] = React.useState<any[]>([]);

  //DETALLE ABARROTES
  const [showGroceries, setShowGroceries] = useState(false);
  const [groceriesDetail, setGroceriesDetail] = useState<any[]>([]);
  const [groceriesLoading, setGroceriesLoading] = useState(false);
  const [modelName, setModelName] = React.useState("");
  const [gStart, setGStart] = React.useState("");
  const [gEnd, setGEnd] = React.useState("");

  const handleOpenGroceriesDetail = async (
    modelName: string,
    gStart: string,
    gEnd: string
  ) => {
    setGroceriesLoading(true);
    setShowGroceries(true);
    // ⛔️ Guardas y normalización de fechas
    if (!modelName || !gStart || !gEnd) {
      console.warn("[DETAIL][SKIP] Faltan params", { modelName, gStart, gEnd });
      setGroceriesLoading(false);
      return;
    }

    // Asegura formato YYYY-MM-DD
    const pStart = String(gStart).slice(0, 10);
    const pEnd = String(gEnd).slice(0, 10);

    try {
      const rows = await fetchGroceriesDetail(modelName, pStart, pEnd);
      console.log("[DETAIL][RES]", rows);
      setGroceriesDetail(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error("[DETAIL][ERR]", e);
      setGroceriesDetail([]);
    } finally {
      setGroceriesLoading(false);
    }
  };

  // Sincroniza cuando cambie el periodo seleccionado o la lista de periodos
  React.useEffect(() => {
    const sel = (periods || []).find((p: any) => p.id === selectedPeriodId);
    setUsdToCopLocal(sel?.tc_usd_cop ?? "");
    setEurToUsdLocal(sel?.tc_eur_usd ?? "");
    setPercent(Number(sel?.period_percent ?? 50));
    setMetaCopLocal(Number(sel?.meta_cop ?? 0));
  }, [periods, selectedPeriodId]);

  // =======================
  // 1) Cargar usuario actual (una vez)
  // =======================
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!mounted) return;
        if (data?.user) {
          setUser({ id: data.user.id, email: data.user.email ?? null });
        } else {
          setUser(null);
        }
      } catch (e: any) {
        setError(e.message || "Error cargando usuario");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // =======================
  // 1.1) Resolver modelId desde `models` por user_id
  // =======================
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("models")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setModelId(data?.id ?? null);
      } catch (e) {
        if (!cancelled) setModelId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // =======================
  // 2) Cargar periodos del modelo (model_periods)
  // =======================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!modelId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("model_periods") // <-- NO admin_model_periods
          .select(
            "id, model_id, period_id, period_name, state, weeks_count, period_percent, tc_usd_cop,tc_eur_usd,meta_cop"
          )
          .eq("model_id", modelId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as PeriodRow[];
        setPeriods(rows);

        // Si no hay selección aún, usa el más reciente
        if (!selectedPeriodId && rows.length > 0) {
          setSelectedPeriodId(rows[0].id);
        }
      } catch (e: any) {
        if (!cancelled) {
          setPeriods([]);
          setSelectedPeriodId(null);
          setError(e.message || "Error leyendo periodos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  // Objeto del período seleccionado
  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) || null,
    [periods, selectedPeriodId]
  );

  // =======================
  // 3) Reflejar valores del período en inputs locales
  // =======================
  useEffect(() => {
    if (!selectedPeriod) return;
    console.log("[PCT][SYNC]", {
      selectedPeriodId,
      dbPercent: selectedPeriod.period_percent,
      type: typeof selectedPeriod.period_percent,
    });

    setUsdRate(Number(selectedPeriod.tc_usd_cop ?? 0));
    setPercent(Number(selectedPeriod.period_percent ?? 0));
    setWeeksCount(Number(selectedPeriod.weeks_count ?? 0));
    setStatus(String(selectedPeriod.state ?? "-"));
  }, [selectedPeriod]);

  // =======================
  // 4) Cargar plataformas del período (join con platforms)
  // =======================
  useEffect(() => {
    if (!selectedPeriodId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("model_period_platforms")
          .select(
            `
            platform_id,
            traffic_enabled,
            traffic_massive_enabled,
            premium_state,
            platforms (
              id,
              name,
              unit_type,
              default_unit_to_usd,
              supports_weeks,
              has_traffic
                          )
          `
          )
          .eq("model_period_id", selectedPeriodId)
          .order("platform_id", { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as any[];
        // Tipado estricto a PeriodPlatformLink
        const mapped: PeriodPlatformLink[] = rows.map((r) => ({
          platform_id: r.platform_id,
          traffic_enabled: r.traffic_enabled ?? null,
          traffic_massive_enabled: r.traffic_massive_enabled ?? null,
          premium_state: r.premium_state ?? "none",
          platforms: {
            id: r.platforms?.id,
            name: r.platforms?.name,
            unit_type: r.platforms?.unit_type ?? null,
            default_unit_to_usd: r.platforms?.default_unit_to_usd ?? null,
            supports_weeks: r.platforms?.supports_weeks ?? null,
            has_traffic: r.platforms?.has_traffic ?? null,
          },
        }));

        setPlatRows(mapped);
        // === Descuentos guardados para este período ===
        const { data: disc, error: eDisc } = await supabase
          .from("period_discounts")
          .select(
            `
    id,
    discount_id,
    amount,
    created_at,
    discount:discounts(name, currency)
  `
          )
          .eq("model_period_id", selectedPeriodId)
          .order("created_at", { ascending: false });

        if (eDisc) {
          console.error("[DISCOUNTS]", eDisc.message);
        } else if (!cancelled) {
          // 👇 Le decimos a TS exactamente la forma del resultado
          // Normaliza lo que viene de supabase (discount puede venir como array u objeto)
          const arr = (disc ?? []) as any[];

          const rows = arr
            .map((d) => {
              // si discount es array, toma el primero; si es objeto, úsalo tal cual
              const rel = Array.isArray(d.discount)
                ? d.discount[0]
                : d.discount;
              const name = String(rel?.name ?? "");
              const currency = String(rel?.currency ?? "COP");

              return {
                id: String(d.id),
                name,
                currency,
                amount: Number(d.amount) || 0,
              };
            })
            // saca "Premium" (eso ya lo manejas en otro lado)
            .filter((r) => r.name.toLowerCase() !== "premium");

          // 2) Traer flags por plataforma del período
          const { data: links, error: eLinks } = await supabase
            .from("model_period_platforms")
            .select(
              `
    platform_id,
    w1, w2, w3, total_tokens,
    traffic_enabled,
    traffic_massive_enabled,
    traffic_positioning_enabled,
    platforms:platforms(name)
  `
            )
            .eq("model_period_id", selectedPeriodId);

          if (eLinks) console.error("[LINKS]", eLinks.message);

          // 3) Construir descuentos automáticos
          const auto = (links ?? []).flatMap((l: any) => {
            const platformName = String(l.platforms?.name || "").toLowerCase();
            const tokens =
              (Number(l.w1) || 0) + (Number(l.w2) || 0) + (Number(l.w3) || 0) ||
              Number(l.total_tokens) ||
              0;

            const out: Array<{
              id: string;
              name: string;
              currency: "COP";
              amount: number;
            }> = [];

            // Posicionamiento (fijo 60.000)
            if (l.traffic_positioning_enabled) {
              out.push({
                id: `pos-${l.platform_id}`,
                name: "Tráfico posicionamiento",
                currency: "COP",
                amount: 60000,
              });
            }

            // Bots Stripchat: 0 / 75k / 150k según tokens
            if (platformName === "stripchat" && l.traffic_enabled) {
              const amount =
                tokens <= 3000 ? 0 : tokens <= 6000 ? 75000 : 150000;
              out.push({
                id: `bots-sc-${l.platform_id}`,
                name: "Bots Stripchat",
                currency: "COP",
                amount,
              });
            }

            // Tráfico masivo Chaturbate: 0 / 50k / 100k según tokens
            if (platformName === "chaturbate" && l.traffic_massive_enabled) {
              const amount =
                tokens <= 3000 ? 0 : tokens <= 6000 ? 50000 : 100000;
              out.push({
                id: `mass-cb-${l.platform_id}`,
                name: "Tráfico masivo Chaturbate",
                currency: "COP",
                amount,
              });
            }

            return out;
          });

          // 👇 Agrega ABARROTES (fila sintética) si el período lo tiene habilitado
          try {
            const { data: pRow } = await supabase
              .from("model_periods")
              .select("groceries_enabled, start_date, end_date, model_id")
              .eq("id", selectedPeriodId)
              .single();

            if (pRow?.groceries_enabled) {
              const { data: mRow } = await supabase
                .from("models")
                .select("display_name")
                .eq("id", pRow.model_id)
                .single();

              const modelName = mRow?.display_name ?? "";
              const gStart = String(pRow.start_date).slice(0, 10); // "YYYY-MM-DD"
              const gEnd = String(pRow.end_date).slice(0, 10);
              setModelName(modelName);
              setGStart(gStart);
              setGEnd(gEnd);

              if (modelName && gStart && gEnd) {
                const total = await fetchGroceriesTotal(
                  modelName,
                  gStart,
                  gEnd
                );

                rows.push({
                  id: `groceries:${selectedPeriodId}`,
                  name: "Abarrotes",
                  currency: "COP",
                  amount: Number(total) || 0,
                });
              }
            }
          } catch (e) {
            console.warn("[GROCERIES]", e);
          }

          // 4) Unir básicos + automáticos
          setDiscountRows([...(rows ?? []), ...auto]);
        }
        console.log(
          "[filas]",
          mapped.map((x) => ({
            name: x.platforms?.name,
            premium_state: x.premium_state,
          }))
        );
        // Limpia producción temporal al cambiar de período
        //setProd({});
      } catch (e: any) {
        if (!cancelled) {
          setPlatRows([]);
          setError(e.message || "Error leyendo plataformas");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPeriodId]);

  // Cargar producción guardada del periodo seleccionado y dejarla en `prod`
  useEffect(() => {
    if (!selectedPeriodId || !platRows?.length) return;

    (async () => {
      const { data, error } = await supabase
        .from("model_period_platforms")
        .select("platform_id, w1, w2, w3, total_tokens")
        .eq("model_period_id", selectedPeriodId);

      if (error) {
        console.error("[loadProd] Error cargando producción:", error);
        return;
      }

      // Mapa para setProd: { [platform_id]: { w1, w2, w3, total } }
      const byPlatform: Record<
        string,
        { w1?: number; w2?: number; w3?: number; total_tokens?: number }
      > = {};

      for (const r of data ?? []) {
        byPlatform[String(r.platform_id)] = {
          w1: Number((r as any).w1 ?? 0),
          w2: Number((r as any).w2 ?? 0),
          w3: Number((r as any).w3 ?? 0),
          total_tokens: Number((r as any).total_tokens ?? 0),
        };
      }

      // Mezcla con lo que ya tengas en memoria
      setProd((prev: any) => ({ ...(prev || {}), ...byPlatform }));
    })();
  }, [selectedPeriodId, platRows]);

  // =======================
  // Helpers de UI (producción local)
  // =======================
  const weekCols = useMemo(
    () => Array.from({ length: Math.max(0, weeksCount || 0) }, (_, i) => i + 1),
    [weeksCount]
  );

  const getWeekVal = (pid: string, i: number) =>
    Number((prod[pid] as any)?.[`w${i}`] ?? 0);

  const setWeekVal = (pid: string, i: number, v: number) =>
    setProd((prev) => ({
      ...prev,
      [pid]: { ...(prev[pid] || {}), [`w${i}`]: clampNonNeg(v) },
    }));

  const getTotalVal = (pid: string) => Number((prod[pid] as any)?.total ?? 0);

  // =======================
  // Render
  // =======================
  // Valor global de premium del período
  const premiumKeyToPct = (key?: string | null) => {
    if (key === "premium_15") return 15;
    if (key === "premium_25") return 25;
    return 0;
  };
  const headerPct: number = React.useMemo(() => {
    let pct = 0;
    for (const r of platRows) {
      pct = Math.max(pct, premiumKeyToPct((r as any)?.premium_state));
    }
    return pct;
  }, [platRows]);

  //HELPER UPDATE CHANGE RATES
  // Guarda tasas del periodo actual y actualiza la UI local
  // Guarda tasas del periodo actual y sincroniza XLove (EUR) con model_platforms
  // Guarda tasas del periodo actual y sincroniza XLove (EUR) con model_platforms
  async function updatePeriodPercentInline(
    periodId: string,
    nextPercent: number
  ) {
    try {
      if (!Number.isFinite(nextPercent)) {
        console.log("[PERCENT skip] valor inválido", nextPercent);
        return;
      }

      const { data, error, status } = await supabase
        .from("model_periods")
        .update({ period_percent: nextPercent })
        .eq("id", periodId)
        .select("id, period_percent")
        .single();

      console.log("[PERCENT upd]", { status, data, error });
      if (error) return;

      // refrescar estado local
      setPeriods((prev: any[]) =>
        (prev || []).map((r) =>
          r.id === periodId ? { ...r, period_percent: nextPercent } : r
        )
      );
    } catch (e: any) {
      console.error("Excepción guardando porcentaje:", e.message || e);
    }
  }
  async function updatePeriodRatesInline(
    periodId: string,
    nextUsdCop?: number | null,
    nextEurUsd?: number | null
  ) {
    try {
      console.log("[RATES in] args ->", {
        periodId,
        nextUsdCop,
        tUsd: typeof nextUsdCop,
        nextEurUsd,
        tEur: typeof nextEurUsd,
        isFiniteEur: Number.isFinite(nextEurUsd as number),
      });

      // 1) Patch solo con lo que llegó
      const patch: any = {};
      if (Number.isFinite(nextUsdCop as number)) patch.tc_usd_cop = nextUsdCop;
      if (Number.isFinite(nextEurUsd as number)) patch.tc_eur_usd = nextEurUsd;
      if (Object.keys(patch).length === 0) {
        console.log("[RATES skip] nada que actualizar");
        return;
      }

      // 2) Actualiza model_periods (forzamos select para ver retorno)
      const {
        data: upd,
        error: updErr,
        status: updStatus,
      } = await supabase
        .from("model_periods")
        .update(patch)
        .eq("id", periodId)
        .select("id, tc_usd_cop, tc_eur_usd")
        .single();

      console.log("[RATES upd]", { updStatus, patch, upd, updErr });
      if (updErr) return;

      // 2b) Si vino EUR, intenta sincronizar XLove
      if (Number.isFinite(nextEurUsd as number)) {
        console.log("[EUR sync] intentando actualizar model_platforms…", {
          nextEurUsd,
        });

        // nombre flexible por si hay mayúsculas/espacios
        const {
          data: plat,
          error: platErr,
          status: platStatus,
        } = await supabase
          .from("model_platforms")
          .update({ default_unit_to_usd: nextEurUsd })
          .ilike("name", "xlove%") // más tolerante que eq("XLove")
          .select("id, name, default_unit_to_usd");

        console.log("[EUR sync res]", { platStatus, plat, platErr });
      }

      // 3) Refresca estado local
      setPeriods((prev: any[] = []) =>
        prev.map((r) => (r.id === periodId ? { ...r, ...patch } : r))
      );
    } catch (e: any) {
      console.error("Excepción guardando tasas:", e?.message || e);
    }
  }

  //FINAL async function updatePeriodRatesInline

  // Decide el factor unidad->USD para una plataforma
  // Usa el input del dashboard si la plataforma reporta en EUR.
  // En cualquier otro caso, usa el factor que viene de la BD.
  // Decide el factor "unidad -> USD" sin tocar el resto de la lógica
  const pickUnitToUsd = (p: any, eurRate: number) => {
    const t = String(p?.unit_type || "").toLowerCase(); // "tokens" | "credits" | "usd" | "eur"
    if (t === "eur") return eurRate; // EUR usa el input local
    const def = Number(p?.default_unit_to_usd);
    return Number.isFinite(def) && def > 0 ? def : 1; // demás usan el valor de BD
  };

  // Guarda producción del periodo actual (semanal o total, según la plataforma)
  async function savePlatformProduction(
    periodId: string | null,
    platformId: string,
    w1: number | null,
    w2: number | null,
    w3: number | null,
    total: number | null
  ) {
    // 0) Validación rápida
    if (!periodId) {
      console.error("[savePlatformProduction] periodId es null/undefined");
      return;
    }

    // 1) Construir payload exactamente con los nombres de columnas de la BD
    const payload = {
      model_period_id: periodId,
      platform_id: platformId,
      w1: w1 ?? null,
      w2: w2 ?? null,
      w3: w3 ?? null,
      total_tokens: total ?? null,
    };

    console.log("[UPsert payload]", payload);

    try {
      // 2) UPSERT por (model_period_id, platform_id)
      // 🔍 DIAGNÓSTICO: ver exactamente qué columnas mandamos
      console.log("[savePlatformProduction] payload =>", {
        periodId,
        platformId,
        w1,
        w2,
        w3,
        total,
      });
      const { data, error } = await supabase
        .from("model_period_platforms")
        .upsert(payload, { onConflict: "model_period_id,platform_id" })
        .select(); // fuerza retorno y ayuda a depurar

      if (error) {
        console.error(
          "[UPsert error]",
          error.code,
          error.message,
          error.details,
          error.hint
        );
        return;
      }

      console.log("[UPsert OK]", data);
    } catch (e) {
      console.error("❌ Error en savePlatformProduction:", e);
    }
  }

  // === Guardar TODAS las plataformas del periodo actual ===
  // === Guardar TODAS las plataformas del periodo actual ===
  const handleSaveAll = async () => {
    // Paso 1: Tomar los montos que ya calcula discountRows
    const botsRow = (discountRows ?? []).find(
      (r) => String(r.name).toLowerCase() === "bots stripchat"
    );
    const massRow = (discountRows ?? []).find(
      (r) => String(r.name).toLowerCase() === "tráfico masivo chaturbate"
    );

    const botsAmount = Number(botsRow?.amount ?? 0);
    const massAmount = Number(massRow?.amount ?? 0);

    console.log("[SAVE-HIT] Bots:", botsAmount, "Massive:", massAmount);
    if (!selectedPeriodId) {
      alert("Selecciona un período antes de guardar");
      return;
    }
    try {
      // === Paso 2: guardar descuentos automáticos en period_discounts ===
      // 1) Traer los IDs de descuentos por nombre
      const { data: discCats, error: eDisc } = await supabase
        .from("discounts")
        .select("id, name")
        .in("name", ["Bots Stripchat", "Tráfico masivo Chaturbate"]);

      if (eDisc) throw eDisc;

      // 2) Mapear por nombre para ubicar IDs
      const byName = new Map(
        (discCats ?? []).map((d) => [String(d.name).toLowerCase(), d.id])
      );
      const botsId = byName.get("bots stripchat") ?? null;
      const massId = byName.get("tráfico masivo chaturbate") ?? null;

      // 3) Armar payload solo para los que existan y tengan monto > 0
      const pdRows: {
        model_period_id: string;
        discount_id: string;
        amount: number;
      }[] = [];
      if (botsId && botsAmount > 0) {
        pdRows.push({
          model_period_id: selectedPeriodId,
          discount_id: botsId,
          amount: botsAmount,
        });
      }
      if (massId && massAmount > 0) {
        pdRows.push({
          model_period_id: selectedPeriodId,
          discount_id: massId,
          amount: massAmount,
        });
      }

      // 4) Guardar (upsert por periodo+descuento para que reemplace si ya existía)
      if (pdRows.length > 0) {
        const { error: ePd } = await supabase
          .from("period_discounts")
          .upsert(pdRows, { onConflict: "model_period_id,discount_id" });

        if (ePd) throw ePd;
        console.log("[SAVE-HIT] period_discounts OK:", pdRows);
      } else {
        console.log(
          "[SAVE-HIT] period_discounts: nada que guardar (sin IDs o montos = 0)."
        );
      }
      for (const r of platRows) {
        if (r.platforms?.supports_weeks) {
          await savePlatformProduction(
            selectedPeriodId!,
            r.platform_id,
            Number(getWeekVal(r.platform_id, 1)) || 0,
            Number(getWeekVal(r.platform_id, 2)) || 0,
            Number(getWeekVal(r.platform_id, 3)) || 0,
            null // no usamos total cuando es semanal
          );
        } else {
          // 👇 CAMBIO: leer el total desde el estado `prod[pid].total_tokens`
          const total = Number((prod[r.platform_id] as any)?.total_tokens) || 0;

          await savePlatformProduction(
            selectedPeriodId!,
            r.platform_id,
            null,
            null,
            null,
            total // total para plataformas SIN semanas
          );
        }
      }
      console.log("✅ Producción guardada correctamente");
    } catch (e) {
      console.error("❌ Error guardando producción:", e);
    }
  };
  // =============== Normalización a TOKENS CB ===============
  /**
   * Convierte unidades de una plataforma a "tokens CB" (normalizados).
   * @param units         Cantidad capturada (input o suma semanal).
   * @param unitToUsd     Factor "1 unidad -> USD" de la plataforma (r.platforms?.default_unit_to_usd).
   * @param eurToUsd      Tipo de cambio de EUR a USD del período (p.tc_eur_usd) o 1 si no aplica.
   * @param unitCurrency  Moneda base de la unidad: 'USD' | 'EUR' | 'TOKEN' | 'CREDIT'.
   *                      Si no tienes este campo, deja el default 'USD'.
   */
  const USD_PER_TOKEN = 0.05;

  function unitsToTokens(
    units: number,
    unitToUsd: number,
    eurToUsd: number = 1,
    unitCurrency: "USD" | "EUR" | "TOKEN" | "CREDIT" = "USD"
  ): number {
    // Si la unidad está en EUR, primero pásala a USD con la tasa del período.
    const effUnitToUsd =
      unitCurrency === "EUR" ? unitToUsd * (eurToUsd || 1) : unitToUsd;

    // Regla general: tokensEq = unidades * (USD por unidad / USD por token)
    // Nota: si ya son tokens (ej. Chaturbate), unitToUsd suele ser 0.05, por lo que sigue funcionando.
    return units * (effUnitToUsd / USD_PER_TOKEN);
  }

  return (
    <div style={{ padding: 24, maxWidth: "100%", margin: "0 auto" }}>
      <a href="/">← Volver</a>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          marginTop: 8,
          marginBottom: 16,
        }}
      >
        Dashboard de {modelName || "modelo"}
      </h1>

      {/* Panel superior - PARÁMETROS EN CARD */}
      <section
        style={{
          display: "inline-block",
          border: "1px solid",
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            margin: "0 0 12px 0",
          }}
        >
          Parámetros del periodo
        </h2>

        {/* Grid de parámetros */}
        <div
          style={{
            display: "inline-grid",
            gridTemplateColumns: "auto auto",
            columnGap: 12,
            rowGap: 8,
            padding: 12,
            width: "max-content",
            justifyContent: "start",
            alignItems: "center",
          }}
        >
          {/* Periodo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label className="text-sm text-gray-600">Periodo </label>
            <select
              className="border rounded px-2 py-1 "
              style={{ flex: 1, maxWidth: "160px" }}
              value={selectedPeriodId ?? ""}
              onChange={(e) => setSelectedPeriodId(e.target.value || null)}
            >
              {(periods ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.period_name}
                </option>
              ))}
            </select>
          </div>

          {/* USD -> COP */}

          <div>
            <label className="text-sm text-gray-600">1 USD → COP </label>
            <input
              type="number"
              step="0.01"
              min={0}
              className={`$(INPUT) input-num`}
              value={usdToCopLocal}
              onChange={(e) =>
                setUsdToCopLocal(
                  e.target.value === "" ? 0 : Number(e.target.value)
                )
              }
              onBlur={() => {
                if (!selectedPeriodId) return;
                const safeUsd =
                  usdToCopLocal === "" ? 0 : Number(usdToCopLocal);
                updatePeriodRatesInline(selectedPeriodId, safeUsd, null);
              }}
            />
          </div>
          {/*META DEL PERIODO*/}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label className="text-sm text-gray-600">Meta (COP) </label>
            <input
              type="number"
              step="1"
              min={0}
              max={999999999}
              className="INPUT"
              value={metaCopLocal}
              onInput={(e) => {
                const el = e.currentTarget;
                if (el.value.length > 9) {
                  el.value = el.value.slice(0, 9);
                }
              }}
              onChange={(e) =>
                setMetaCopLocal(
                  e.target.value === "" ? 0 : Number(e.target.value)
                )
              }
              onBlur={() => {
                if (!selectedPeriodId) return;
                // ⬇ Guarda la meta (elige UNA de las dos opciones de guardado)
                updatePeriodMetaInline({
                  periodId: selectedPeriodId,
                  metaCop: Number(metaCopLocal) || 0,
                });
              }}
            />
          </div>

          {/* EUR -> USD */}
          <div>
            <label className="text-sm text-gray-600">1 EUR → USD </label>
            <input
              type="number"
              step="0.0001"
              min={0}
              className={`$(INPUT) input-num`}
              value={eurToUsdLocal}
              onChange={(e) =>
                setEurToUsdLocal(
                  e.target.value === "" ? 0 : Number(e.target.value)
                )
              }
              // dentro del <input ...> EUR→USD

              onBlur={() => {
                if (!selectedPeriodId) return;
                const safeEur =
                  eurToUsdLocal === "" ? 0 : Number(eurToUsdLocal);
                updatePeriodRatesInline(selectedPeriodId, null, safeEur);
              }}
            />
          </div>

          {/* Separador a lo ancho */}
          <div
            style={{
              gridColumn: "1 / -1",
              height: 1,
              background: "#e5e7eb",
              margin: "8px 0",
            }}
          />

          {/* Semanas configuradas */}
          <div
            className="text-sm text-gray-600"
            style={{ flex: 1, maxWidth: "160px" }}
          >
            Semanas configuradas
          </div>
          <div style={{ fontSize: 16, fontWeight: 450, maxWidth: "160px" }}>
            {weeksCount || 0}
          </div>

          {/* Participación (%) */}
          <label className="text-sm text-gray-600">Participación (%)</label>
          <input
            type="number"
            className={`$(INPUT) input-num`}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value) || 0)}
            min={0}
            max={100}
            onBlur={() => {
              if (!selectedPeriodId) return;
              const safePercent = Number(percent || 0);
              updatePeriodPercentInline(selectedPeriodId, safePercent);
            }}
          />
        </div>
      </section>
      {/*GRID PRODUCCION/DESCUENTOS*/}
      <section /* CONTENEDOR PADRE DE PRODUCCIÓN + DESCUENTOS */
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 4fr) minmax(0, 2fr)",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {/* Producción */}

        <section
          style={{
            border: "1px solid ",
            borderRadius: 8,
            padding: 12,
            marginTop: 0,
            minWidth: 0,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              margin: "0 0 12px 0",
            }}
          >
            Producción
          </h2>
          <table className="w-full table-fixed">
            <colgroup>
              {/* Plataforma */}
              <col className="w-[12px]" />
              {/* Producción */}
              <col style={{ width: "16%" }} />
              {/* Premium % */}
              <col style={{ width: "12%" }} />
              {/* Total */}
              <col style={{ width: "13%" }} />
              {/* Equivalencia en Tokens */}
              <col style={{ width: "21%" }} />
              {/* USD */}
              <col style={{ width: "13%" }} />
            </colgroup>

            <thead style={{ whiteSpace: "nowrap", wordBreak: "keep-all" }}>
              <tr>
                <th style={{ width: "140px", whiteSpace: "nowrap" }}>
                  Plataforma
                </th>
                <th>Producción</th>
                <th>{headerPct > 0 ? `Premium ${headerPct}%` : "Premium %"}</th>
                <th>Total</th>
                <th>Equivalencia en Tokens</th>
                <th>USD</th>
              </tr>
            </thead>

            <tbody className="text-sm">
              {platRows.map((r) => {
                // ¿Plataforma semanal?
                const isWeekly = Boolean(r.platforms?.supports_weeks);

                // Conversión a USD de la plataforma (tokens/créditos -> USD)
                // dentro del map, justo antes de usar unitToUsd
                const unitToUsd = pickUnitToUsd(
                  r.platforms as any,
                  Number(eurToUsdLocal) || 1
                );
                console.log("[FX DBG]", {
                  platform: r.platforms?.name,
                  unit_type: (r.platforms as any)?.unit_type,
                  def: (r.platforms as any)?.default_unit_to_usd,
                  eurToUsdLocal,
                  unitToUsd,
                });

                // ahora decide si usa default_unit_to_usd o eurToUsdLocal

                // Premium: mapea la clave string a porcentaje numérico
                const premiumKey = String((r as any).premium_state ?? "none"); // "premium_15" | "premium_25" | "none"
                const premiumPct =
                  premiumKey === "premium_15"
                    ? 15
                    : premiumKey === "premium_25"
                    ? 25
                    : 0;

                // === DEBUG puntual (quítalo luego) ===
                console.log("[FILA]", r.platforms?.name, {
                  isWeekly, // debe corresponder a supports_weeks
                  w1: Number(getWeekVal(r.platform_id, 1) || 0),
                  w2: Number(getWeekVal(r.platform_id, 2) || 0),
                  w3: Number(getWeekVal(r.platform_id, 3) || 0),
                  totalInput: Number(getTotalVal(r.platform_id) || 0), // lo que escribe el input NO semanal
                  premiumPct, // 0, 15, 25…
                });

                // ====== FILA RESUMEN POR PLATAFORMA (siempre visible) ======
                // Unidades brutas de la fila
                const grossUnits = isWeekly
                  ? weekCols.reduce(
                      (acc, w) =>
                        acc + Number(getWeekVal(r.platform_id, w) || 0),
                      0
                    )
                  : Number(getTotalVal(r.platform_id) || 0);

                // Aplica premium con mínimos (usa tu util global applyPremium)
                console.log("[PREMIUM DBG]", {
                  platform: r.platforms?.name,
                  grossUnits,
                  premiumPct,
                });
                // === Usar total_tokens para NO-semanales, sin tocar grossUnits existente ===
                const grossForPremium = r.platforms?.supports_weeks
                  ? grossUnits
                  : Number(
                      (prod?.[String(r.platform_id)] as any)?.total_tokens ?? 0
                    );

                // Aplica premium con mínimos (usa tu util global applyPremium)
                const { net: netUnitsRow, ded: premiumDedRow } = applyPremium(
                  grossForPremium,
                  premiumPct
                );
                // USD de la fila (post premium)
                const usdRow = netUnitsRow * unitToUsd;
                // === Total normalizado (TOKENS base 0.05 USD) ===
                const tokensRow = Math.round(usdRow / 0.05);
                grandUsd += Number(usdRow) || 0;
                grandTokens += Number(tokensRow) || 0;

                // USD de la fila (post premium)

                console.log("[USD DBG]", {
                  platform: r.platforms?.name,
                  netUnitsRow,
                  unitToUsd, // asegúrate de que no sea 0 o undefined
                  usdRow,
                });

                return (
                  <React.Fragment key={r.platform_id}>
                    {/* ===== Fila RESUMEN por plataforma ===== */}
                    <tr>
                      {/* Plataforma */}
                      <td className="whitespace-normal md:whitespace-nowrap">
                        {r.platforms?.name ?? " "}
                      </td>

                      {/* Producción NO SEMANAL */}
                      <td>
                        {isWeekly ? (
                          " "
                        ) : (
                          <input
                            type="number"
                            step="1"
                            min={0}
                            max={99999}
                            className={`$(INPUT) input-num`}
                            value={
                              prod?.[String(r.platform_id)]?.total_tokens ?? 0
                            }
                            onChange={(e) => {
                              const pid = String(r.platform_id);
                              const val = Number(e.target.value) || 0;
                              setProd((prev) => ({
                                ...(prev || {}),
                                [pid]: {
                                  ...(prev?.[pid] || {}),
                                  total_tokens: val, // <-- guardamos 'total' (lo que luego se persiste como total_tokens)
                                },
                              }));
                            }}
                          />
                        )}
                      </td>

                      {/* Premium (monto descontado) 
               - En SEMANAL NO mostramos nada aquí (va en subfilas + total).
               - En NO SEMANAL mostramos el monto descontado. */}
                      <td style={{ textAlign: "right" }}>
                        {isWeekly
                          ? " "
                          : premiumPct > 0
                          ? premiumDedRow.toLocaleString("es-CO")
                          : " "}
                      </td>
                      {/* Total nativo: el valor de producción - premium (si aplica), en su unidad original */}
                      <td style={{ textAlign: "right" }}>
                        {isWeekly ? " " : netUnitsRow.toLocaleString("es-CO")}
                      </td>

                      {/* Equivalencia (tokens): total nativo convertido a tokens “Chaturbate-equivalentes” */}
                      <td style={{ textAlign: "right" }}>
                        {isWeekly ? " " : tokensRow.toLocaleString("es-CO")}
                      </td>

                      {/* USD: total nativo convertido a dólares */}
                      <td style={{ textAlign: "right" }}>
                        {isWeekly
                          ? " "
                          : usdRow.toLocaleString("es-CO", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                      </td>
                    </tr>

                    {/* ===== Subfilas SEMANALES (solo si es SEMANAL) ===== */}
                    {isWeekly && (
                      <>
                        {weekCols.map((w) => {
                          const weekGross = Number(
                            getWeekVal(r.platform_id, w) ?? 0
                          );
                          const { net: weekNet, ded: weekDed } = applyPremium(
                            weekGross,
                            premiumPct
                          );
                          const weekUsd = weekNet * unitToUsd;

                          return (
                            <tr key={`${r.platform_id}-w${w}`}>
                              {/* Etiqueta Semana */}
                              <td
                                style={{
                                  paddingLeft: 16,
                                  color: "#667085",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Semana {w}
                              </td>

                              {/* Producción semanal (input) */}
                              <td>
                                <input
                                  type="number"
                                  className={`$(INPUT) input-num`}
                                  style={{ width: "9ch" }}
                                  value={weekGross}
                                  onChange={(e) =>
                                    setWeekVal(
                                      r.platform_id,
                                      w,
                                      Number(e.target.value) || 0
                                    )
                                  }
                                  min={0}
                                  max={99999}
                                />
                              </td>

                              {/* Premium por semana (monto) */}
                              <td style={{ textAlign: "right" }}>
                                {premiumPct > 0
                                  ? weekDed.toLocaleString("es-CO")
                                  : " "}
                              </td>
                              {/* Total neto por semana */}
                              <td style={{ textAlign: "right" }}>
                                {weekNet.toLocaleString("es-CO")}
                              </td>
                              {/* Equivalencia en tokens */}

                              <td style={{ textAlign: "right" }}></td>

                              {/* USD por semana */}
                              <td style={{ textAlign: "right" }}>
                                {weekUsd.toLocaleString("es-CO", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          );
                        })}

                        {/* ===== Fila TOTAL (solo SEMANAL): suma de semanas con premium aplicado ===== */}
                        {(() => {
                          const weeksGross = weekCols.reduce(
                            (acc, w) =>
                              acc + Number(getWeekVal(r.platform_id, w) ?? 0),
                            0
                          );
                          const { net: sumNet, ded: sumDed } = applyPremium(
                            weeksGross,
                            premiumPct
                          );
                          const sumUsd = sumNet * unitToUsd;

                          return (
                            <tr
                              className="total-row"
                              key={`${r.platform_id}-sum`}
                            >
                              <td>Total</td>

                              {/* Total de tokens (suma de inputs de semanas) */}
                              <td>{grossUnits.toLocaleString("es-CO")}</td>
                              {/* Total Premium */}
                              <td>
                                {premiumPct > 0
                                  ? premiumDedRow.toLocaleString("es-CO")
                                  : ""}
                              </td>

                              {/* Total Nativo */}
                              <td>{netUnitsRow.toLocaleString("es-CO")}</td>

                              {/* Total neto */}
                              <td>{tokensRow.toLocaleString("es-CO")}</td>

                              {/* Total USD */}
                              <td>
                                {usdRow.toLocaleString("es-CO", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          );
                        })()}
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* === Card: Descuentos (desde DB, sin Premium) === */}

        <section
          style={{
            border: "1px solid",
            borderRadius: 8,
            padding: 12,
            marginTop: 0,
            marginLeft: 20,
            minWidth: 0,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              margin: "0 0 12px 0",
            }}
          >
            Descuentos
          </h2>
          {discountRows.length === 0 ? (
            <div style={{ opacity: 0.7 }}>
              No hay descuentos para este período.
            </div>
          ) : (
            <table
              className="w-full table-fixed"
              style={{
                width: "auto",
                minWidth: "220px",
                margin: "0",
                textAlign: "left",
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>
                    Concepto
                  </th>
                  <th style={{ textAlign: "right", padding: "6px 4px" }}>
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {discountRows.map((d, idx) => (
                  <tr key={`${d.id}-${idx}`}>
                    <td style={{ padding: "4px" }}>
                      <span>{d.name || "Sin nombre"}</span>

                      {String(d.name).toLowerCase() === "abarrotes" && (
                        <button
                          type="button"
                          style={{ marginLeft: 8 }}
                          onClick={() =>
                            handleOpenGroceriesDetail(modelName, gStart, gEnd)
                          }
                          disabled={groceriesLoading}
                        >
                          {groceriesLoading ? "Cargando..." : "Detalle"}
                        </button>
                      )}
                    </td>

                    <td style={{ padding: "4px", textAlign: "right" }}>
                      {Number(d.amount ?? 0).toLocaleString("es-CO")} {" COP"}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <td style={{ padding: "6px 4px", fontWeight: 600 }}>Total</td>
                  <td
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    {discountRows
                      .reduce((acc, d) => acc + (Number(d.amount) || 0), 0)
                      .toLocaleString("es-CO")}{" "}
                    COP
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {showGroceries && (
            <div
              className="modal-overlay"
              onClick={() => setShowGroceries(false)} // clic afuera cierra
            >
              <div
                className="modal-card"
                onClick={(e) => e.stopPropagation()} // no cerrar si hacen clic dentro
                role="dialog"
                aria-modal="true"
                aria-labelledby="groceries-title"
              >
                <div className="modal-header">
                  <h4 id="groceries-title" style={{ margin: 0 }}>
                    Detalle de abarrotes
                  </h4>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setShowGroceries(false)}
                    aria-label="Cerrar"
                  >
                    ×
                  </button>
                </div>

                {groceriesDetail.length > 0 && (
                  <table style={{ width: "100%", marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "4px" }}>
                          Fecha
                        </th>
                        <th style={{ textAlign: "left", padding: "4px" }}>
                          Vendedor
                        </th>
                        <th style={{ textAlign: "left", padding: "4px" }}>
                          Producto
                        </th>
                        <th style={{ textAlign: "right", padding: "4px" }}>
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groceriesDetail.map((r: any, i: number) => (
                        <tr key={`${r.item_date}-${i}`}>
                          <td style={{ padding: "4px" }}>
                            {new Date(r.item_date).toLocaleString("es-CO")}
                          </td>
                          <td style={{ padding: "4px" }}>{r.seller_name}</td>
                          <td style={{ padding: "4px" }}>{r.product_name}</td>
                          <td style={{ padding: "4px", textAlign: "right" }}>
                            {Number(r.subtotal ?? 0).toLocaleString("es-CO")}{" "}
                            {" COP"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </section>
      </section>
      {/* Guardar (más adelante, cuando definamos columnas de producción reales) */}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={handleSaveAll}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Guardar cambios
        </button>
      </div>
      {/* === CONTENEDOR Resumen general/ Meta y proyeccion === */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 32,
          rowGap: 0,
          marginTop: 16,
          width: "fit-content",
        }}
      >
        {/* === CARD Resumen general*/}
        <section className="rounded-lg border p-4 text-gray-600">
          <h2>Resumen general</h2>

          {/* Total equivalencia en TOKENS */}
          <div className="space-y-2">
            <div style={{ display: "flex", gap: 8 }}>
              <span>Total equivalencia en TOKENS</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {Number(grandTokens).toLocaleString("es-CO", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
            {/* Total en USD */}
            <div style={{ display: "flex", gap: 8 }}>
              <span>Total en USD</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {Number(grandUsd).toLocaleString("es-CO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            {/* Total bruto en COP (ya con % aplicado) */}
            <div style={{ display: "flex", gap: 8 }}>
              <span>Total bruto en COP</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {(
                  Number(grandUsd || 0) *
                  Number(usdToCopLocal || 0) *
                  (Number(percent || 0) / 100)
                ).toLocaleString("es-CO", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}{" "}
                COP
              </span>
            </div>

            {/* Descuentos */}
            <div style={{ display: "flex", gap: 8 }}>
              <span>Descuentos</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {(discountRows ?? [])
                  .reduce(
                    (acc, d) =>
                      acc +
                      // si existe amount_cop (COP) úsalo; si no, cae a amount
                      (Number((d as any).amount_cop) ||
                        Number((d as any).amount) ||
                        0),
                    0
                  )
                  .toLocaleString("es-CO", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                COP
              </span>
            </div>

            {/* Pago a modelo */}
            <div style={{ display: "flex", gap: 8 }}>
              <span>Pago a modelo</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {(
                  Number(grandUsd || 0) *
                    Number(usdToCopLocal || 0) *
                    (Number(percent || 0) / 100) - // Total bruto en COP
                  (discountRows ?? []).reduce(
                    (acc, d) =>
                      acc +
                      (Number((d as any).amount_cop) ||
                        Number((d as any).amount) ||
                        0),
                    0
                  )
                ) // Descuentos en COP
                  .toLocaleString("es-CO", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                COP
              </span>
            </div>
          </div>
        </section>
        {/* === Card: Meta y proyección  === */}
        <section className="rounded-lg border p-4 text-gray-600">
          <h2>Meta y proyección</h2>

          <div className="space-y-2">
            {/* Total faltante en dinero (COP) */}
            <div style={{ display: "flex", gap: 8 }}>
              <span>Total faltante </span>
              {(() => {
                const brutoCop =
                  (Number(grandUsd) || 0) * (Number(usdToCopLocal) || 0);

                const pagoActual =
                  brutoCop * ((Number(percent) || 0) / 100) -
                  (discountRows ?? []).reduce(
                    (acc, d) =>
                      acc +
                      (Number((d as any).amount_cop) ||
                        Number((d as any).amount) ||
                        0),
                    0
                  );

                const meta = Number(metaCopLocal) || 0;
                const faltante = meta - pagoActual;

                // Color: rojo si >0 (todavía falta), verde si <0 (ya pasó la meta)
                const color =
                  faltante > 0
                    ? "#b91c1c"
                    : faltante < 0
                    ? "#166534"
                    : "#6b7280";

                // Mostrar signo en el valor (positivo o negativo)
                const formatted = faltante.toLocaleString("es-CO", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                });

                return (
                  <span className="font-semibold" style={{ color }}>
                    {formatted} COP
                  </span>
                );
              })()}
            </div>

            {/* Total faltante en tokens */}
            <div style={{ display: "flex", gap: 8 }}>
              <span>Total faltante (tokens) </span>
              {(() => {
                const USD_PER_TOKEN = 0.05;
                const tokens = Number(grandTokens) || 0; // ✅ tokens normalizados ya sumados
                const copPerUsd = Number(usdToCopLocal) || 0;
                const pct = Number(percent) || 0;

                // Descuentos en COP (usa amount_cop si existe; si no, amount)
                const descuentosCop = (discountRows ?? []).reduce(
                  (acc, d: any) =>
                    acc + (Number(d?.amount_cop) || Number(d?.amount) || 0),
                  0
                );

                // Pago actual en COP partiendo de GRAND TOKENS normalizados
                // pago = (tokens * 0.05 USD/token * COP/USD) * % - descuentos
                const pagoActualCop =
                  tokens * USD_PER_TOKEN * copPerUsd * (pct / 100) -
                  descuentosCop;

                // Faltante en COP = meta - pago actual
                const meta = Number(metaCopLocal) || 0;
                const faltanteCop = meta - pagoActualCop;

                // Convertir faltante en COP -> tokens normalizados adicionales
                // Necesitamos que: (extraTokens * 0.05 * COP/USD) * % = faltanteCop
                // => extraTokens = faltanteCop / ( (pct/100) * COP/USD * 0.05 )
                let tokensNecesarios = 0;
                if (copPerUsd > 0 && pct > 0) {
                  const denom = (pct / 100) * copPerUsd * USD_PER_TOKEN;
                  const raw = faltanteCop / denom;
                  // rojo: si falta -> redondea hacia arriba; verde: si sobra -> hacia abajo
                  tokensNecesarios = raw > 0 ? Math.ceil(raw) : Math.floor(raw);
                }

                const color =
                  faltanteCop > 0
                    ? "#b91c1c"
                    : faltanteCop < 0
                    ? "#166534"
                    : "#6b7280";

                return (
                  <span className="font-semibold" style={{ color }}>
                    {tokensNecesarios.toLocaleString("es-CO")} tokens
                  </span>
                );
              })()}
            </div>

            {/* Cantidad de horas */}
            <div style={{ display: "flex", gap: 8 }} />
            <span>Cantidad de horas </span>
            <span>
              <input
                type="number"
                min={0}
                max={999}
                defaultValue={0}
                className={`$(INPUT) input-num`}
                onBlur={async (e) => {
                  const raw = parseInt(e.target.value, 10);
                  const hours = Number.isFinite(raw) && raw >= 0 ? raw : 0;

                  try {
                    const { error } = await supabase
                      .from("model_periods")
                      .update({ hours_worked: hours })
                      .eq("id", selectedPeriodId as string);

                    if (error) throw error;

                    setPeriods((prev) =>
                      (prev || []).map((p: any) =>
                        p.id === selectedPeriodId
                          ? { ...p, hours_worked: hours }
                          : p
                      )
                    );
                  } catch (err) {
                    console.error("[HOURS][update]", err);
                  }
                }}
              />
            </span>

            {/* Promedio por hora (solo display, lo calculamos después) */}
            <div style={{ display: "flex", gap: 8 }}>
              <span>Promedio por hora </span>
              <span>
                {(() => {
                  // 1) tomar las horas del período seleccionado, inline
                  const hours = Number(
                    (
                      (periods || []).find(
                        (p: any) => p.id === selectedPeriodId
                      ) as any
                    )?.hours_worked ?? 0
                  );

                  // 2) si no hay horas, mostrar "No disponible"
                  if (hours <= 0) {
                    return (
                      <span className="text-gray-400 italic">
                        No disponible
                      </span>
                    );
                  }

                  // 3) promedio = tokens normalizados / horas
                  const tokensTotal = Number(grandTokens || 0);
                  const avg = tokensTotal / hours;

                  // 4) render
                  return (
                    <>
                      {avg.toLocaleString("es-CO", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      tokens/hora
                    </>
                  );
                })()}
              </span>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
