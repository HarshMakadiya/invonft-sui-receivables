/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INVO_APP_MODE?: "development" | "staging" | "production";
  readonly VITE_INVO_INDEXER_URL?: string;
  readonly VITE_INVO_RECEIVABLE_PACKAGE_ID?: string;
  readonly VITE_INVO_ORIGINAL_PACKAGE_ID?: string;
  readonly VITE_INVO_RECEIVABLE_MODULE?: string;
  readonly VITE_INVO_ESCROW_MODULE?: string;
  readonly VITE_INVO_INVOICE_COUNTER_ID?: string;
  readonly VITE_INVO_PLATFORM_CONFIG_ID?: string;
  readonly VITE_WALRUS_PUBLISHER_URL?: string;
  readonly VITE_WALRUS_AGGREGATOR_URL?: string;
  readonly VITE_WALRUS_STORAGE_EPOCHS?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
