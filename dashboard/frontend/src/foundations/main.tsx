import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "./foundations.css";
import { FoundationsPage } from "./FoundationsPage.js";

createRoot(document.getElementById("root")!).render(<StrictMode><FoundationsPage /></StrictMode>);
