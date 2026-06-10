export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                ink: "#1A1A17", // Charcoal black (primary text)
                inksecondary: "#3A3A35", // Muted charcoal-brown (body text)
                inkmuted: "#6B6B63", // Secondary details text
                inklight: "#9A9A90", // Light grey text
                moss: "#1F4634", // Deep forest green accent
                mossdeep: "#15311F", // Darker forest green accent
                mosssoft: "#E4EBE5", // Sage green soft background
                paper: "#F7F4ED", // Page warm sand cream background
                paperalt: "#EFEAE0", // Section alternate warm background
                line: "#D9D3C4", // Warm beige structural border rules
                linesoft: "#E6E0D1", // Subtle beige rules
                lead: "#FFFDF7", // Pure parchment paper card background
                coral: "#8A3A2A", // Soft rust danger/alert red
                sun: "#D4A247", // Soft ochre/gold yellow
                aqua: "#2C5A44", // Deep trust teal green
            },
            boxShadow: {
                lifted: "0 4px 24px rgba(26, 26, 23, 0.06)",
                flat: "0 1px 3px rgba(26, 26, 23, 0.04)",
                glow: "0 0 0 transparent",
                "glow-mint": "0 0 0 transparent",
                "glow-aqua": "0 0 0 transparent",
                "glow-coral": "0 0 0 transparent",
                "glow-sun": "0 0 0 transparent",
            },
            fontFamily: {
                sans: [
                    "Plus Jakarta Sans",
                    "Inter",
                    "ui-sans-serif",
                    "sans-serif",
                ],
                serif: [
                    "Georgia",
                    "ui-serif",
                    "serif",
                ],
                mono: [
                    "Space Grotesk",
                    "ui-monospace",
                    "monospace",
                ],
            },
        },
    },
    plugins: [],
};
