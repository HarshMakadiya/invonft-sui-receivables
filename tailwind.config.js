export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                ink: "#101312",
                moss: "#193329",
                paper: "#F4F7F1",
                line: "#DDE7DE",
                mint: "#75F0B2",
                aqua: "#70D9FF",
                coral: "#FF6B57",
                sun: "#F5CF5C",
            },
            boxShadow: {
                lifted: "0 26px 80px rgba(16, 19, 18, 0.14)",
                glow: "0 0 46px rgba(117, 240, 178, 0.34)",
            },
            fontFamily: {
                sans: [
                    "Inter",
                    "ui-sans-serif",
                    "system-ui",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "sans-serif",
                ],
            },
        },
    },
    plugins: [],
};
