import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.indexOf("node_modules/react") !== -1 || id.indexOf("node_modules/react-dom") !== -1) {
                        return "react";
                    }
                    if (id.indexOf("node_modules/@mysten") !== -1) {
                        return "sui";
                    }
                },
            },
        },
    },
});
