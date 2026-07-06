import "../style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ApprovalsApp } from "../../src/approvals/ApprovalsApp";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");

createRoot(container).render(
  <StrictMode>
    <ApprovalsApp />
  </StrictMode>
);
