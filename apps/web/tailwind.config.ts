import type { Config } from "tailwindcss";

const odosSpacing = Object.fromEntries(
  Array.from({ length: 32 }, (_, i) => [`odos-${i + 1}`, `var(--space-${i + 1})`]),
);

export default {
  theme: {
    extend: {
      colors: {
        odos: {
          bg: "var(--odos-bg)",
          surface: {
            "1": "var(--odos-surface-1)",
            "2": "var(--odos-surface-2)",
            "3": "var(--odos-surface-3)",
            offset: "var(--odos-surface-offset)",
          },
          primary: {
            DEFAULT: "var(--odos-primary)",
            foreground: "var(--odos-primary-foreground)",
          },
          text: {
            DEFAULT: "var(--odos-text-primary)",
            muted: "var(--odos-text-muted)",
            faint: "var(--odos-text-faint)",
          },
          success: "var(--odos-success)",
          warning: "var(--odos-warning)",
          danger: "var(--odos-danger)",
          border: {
            DEFAULT: "var(--odos-border)",
            subtle: "var(--odos-border-subtle)",
          },
        },
        hub: {
          heading: "var(--odos-hub-heading)",
          body: "var(--odos-hub-body)",
          muted: "var(--odos-hub-muted)",
          cta: "var(--odos-hub-cta)",
          navy: "var(--odos-hub-navy)",
          page: "var(--odos-hub-page-bg)",
          selected: "var(--odos-hub-selected-bg)",
        },
        auth: {
          cta: "var(--odos-auth-cta)",
          tint: "var(--odos-auth-cta-tint)",
          page: "var(--odos-auth-page-bg)",
        },
      },
      spacing: odosSpacing,
      fontSize: {
        "odos-xs": "var(--text-xs)",
        "odos-sm": "var(--text-sm)",
        "odos-base": "var(--text-base)",
        "odos-lg": "var(--text-lg)",
        "odos-xl": "var(--text-xl)",
      },
      borderRadius: {
        "odos-sm": "var(--radius-sm)",
        "odos-md": "var(--radius-md)",
        "odos-lg": "var(--radius-lg)",
        "odos-full": "var(--radius-full)",
        "card-sm": "var(--radius-card-sm)",
        "card-md": "var(--radius-card-md)",
        "card-lg": "var(--radius-card-lg)",
      },
      boxShadow: {
        "odos-xs": "var(--shadow-xs)",
        "odos-sm": "var(--shadow-sm)",
        "odos-md": "var(--shadow-md)",
        "auth-card": "var(--shadow-auth-card)",
        "hub-card": "var(--shadow-hub-card)",
        "results-card": "var(--shadow-results-card)",
      },
    },
  },
} satisfies Config;
