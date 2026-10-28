import "../style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PopupApp } from "../../src/popup/PopupApp";
import { initTheme } from "../../src/popup/prefs";

initTheme();

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");

createRoot(container).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);
