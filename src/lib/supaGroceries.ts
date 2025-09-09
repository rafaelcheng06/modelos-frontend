// src/lib/supaGroceries.ts
import { createClient } from "@supabase/supabase-js";

/** Cliente SOLO para el proyecto de abarrotes */
const groceriesUrl = import.meta.env.VITE_GROCERIES_SUPABASE_URL as string;
const groceriesAnon = import.meta.env.VITE_GROCERIES_SUPABASE_ANON_KEY as string;

export const groceriesSupabase = createClient(groceriesUrl, groceriesAnon,
  { auth: { storageKey: "sb-groceries"}}
);

/**
 * Llama al wrapper público que creaste en el proyecto de abarrotes.
 * Devuelve el total (número) en COP para ese cliente y rango de fechas.
 *
 * @param customerName  Nombre EXACTO del cliente/modelo (case-sensitive según tu DB)
 * @param startDate     "YYYY-MM-DD"
 * @param endDate       "YYYY-MM-DD"
 */
export async function fetchGroceriesTotal(
  customerName: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const { data, error } = await groceriesSupabase
    .rpc("groceries_total_wrapper", {
      p_customer_name: customerName,
      p_start_date: startDate,
      p_end_date: endDate,
    });

  if (error) throw error;
  // El wrapper retorna NUMERIC → supabase-js lo entrega como number
  return Number(data ?? 0);
}
// === Detalle de abarrotes (usa la función nueva con sufijo V) ===
export async function fetchGroceriesDetail(
  customerName: string,
  startDate: string, // "YYYY-MM-DD"
  endDate: string    // "YYYY-MM-DD"
): Promise<Array<{
  item_date: string;      // timestamp ISO
  seller_name: string | null;
  product_name: string;
  qty: number;
  price: number;
  subtotal: number;
}>> {
  // 👇 CAMBIA solo este nombre por el de tu función en la BD
  const FN_NAME = "groceries_detail_wrapper_b"; // <-- usa el nombre EXACTO que creaste

  const { data, error } = await groceriesSupabase
    .rpc(FN_NAME, {
      p_customer_name: customerName,
      p_start_date: startDate,
      p_end_date: endDate,
    });

  if (error) throw error;

  // Supabase ya devuelve un array con las columnas de la función
  return (data ?? []) as any[];
}