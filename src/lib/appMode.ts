export type AppMode = "development" | "staging" | "production";

const configuredMode = import.meta.env.VITE_INVO_APP_MODE?.trim().toLowerCase();

export const appMode: AppMode =
  configuredMode === "production" || configuredMode === "staging" || configuredMode === "development"
    ? configuredMode
    : "development";

export const isProductionMode = appMode === "production";
