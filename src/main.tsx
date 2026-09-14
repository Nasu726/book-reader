import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "./styles/globals.css";
import { App } from "./app";

// Ask the browser to keep this origin's storage: the books live in it, and a
// browser that evicts them under pressure would take the library with it.
// Best effort — a denial changes nothing about how the app behaves.
void navigator.storage?.persist?.().catch(() => undefined);

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
