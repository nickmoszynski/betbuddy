import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { registerSW } from "./lib/push.js";
import { startAutoUpdate } from "./lib/autoUpdate.js";
import "./styles.css";

registerSW();
startAutoUpdate();
createRoot(document.getElementById("root")).render(<App />);
