import "../style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SetupApp } from "../../src/setup/SetupApp";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");

createRoot(container).render(
  <StrictMode>
    <SetupApp />
  </StrictMode>
);
