import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { registerSW } from "./lib/push.js";
import "./styles.css";

registerSW();
createRoot(document.getElementById("root")).render(<App />);
