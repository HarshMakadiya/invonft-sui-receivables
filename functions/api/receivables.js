import { getSupabaseConfig, handleOptions, jsonResponse, rowToInvoice, supabaseHeaders } from "../_shared/receivables.js";

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet({ env }) {
  try {
    const { baseUrl, serviceRoleKey } = getSupabaseConfig(env);
    const packageId = env.RECEIVABLE_PACKAGE_ID?.trim() || env.VITE_INVO_RECEIVABLE_PACKAGE_ID?.trim();
    const packageFilter = packageId ? `&package_id=eq.${encodeURIComponent(packageId)}` : "";
    const response = await fetch(`${baseUrl}/rest/v1/receivables?select=*&sui_object_id=not.is.null${packageFilter}&order=created_at.desc`, {
      headers: supabaseHeaders(serviceRoleKey),
    });

    if (!response.ok) {
      return jsonResponse({ error: "Could not load receivables." }, { status: response.status });
    }

    const rows = await response.json();
    return jsonResponse(rows.map(rowToInvoice));
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Receivable index is not configured." }, { status: 500 });
  }
}
