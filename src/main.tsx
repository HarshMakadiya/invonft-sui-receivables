import { DAppKitProvider } from "@mysten/dapp-kit-react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { dAppKit } from "./lib/dapp-kit";

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <DAppKitProvider dAppKit={dAppKit}>
      <App />
    </DAppKitProvider>
  </React.StrictMode>,
);
