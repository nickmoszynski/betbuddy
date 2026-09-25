import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const stamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export default defineConfig({ plugins: [react()], define: { __BUILD__: JSON.stringify(stamp) } });
