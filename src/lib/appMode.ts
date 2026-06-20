export type AppMode = "development" | "staging" | "production";

const configuredMode = import.meta.env.VITE_INVO_APP_MODE?.trim().toLowerCase();

export const appMode: AppMode =
  configuredMode === "production" || configuredMode === "staging" || configuredMode === "development"
    ? configuredMode
    : "development";

// Staging exercises the same wallet and verified-index boundaries as production.
// Development is the only mode that permits demo role controls and fallback rows.
export const isProductionMode = appMode === "production" || appMode === "staging";
