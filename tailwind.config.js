/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        bronze: {
          50: "#faf5ef",
          100: "#f2e6d2",
          200: "#e5cba5",
          300: "#d4ac6e",
          400: "#c59146",
          500: "#B87333",
          600: "#a35e27",
          700: "#87481f",
          800: "#6e3a1c",
          900: "#5a3018",
          950: "#33190a",
        },
        gold: {
          50: "#fdf8e8",
          100: "#f9edc4",
          200: "#f3da84",
          300: "#edc663",
          400: "#e8c35a",
          500: "#D4AF37",
          600: "#b8901f",
          700: "#8f6e16",
        },
        cinnabar: {
          50: "#fdf3f1",
          100: "#fbe2dc",
          200: "#f8c0b5",
          300: "#ee9282",
          400: "#e25a3f",
          500: "#C23B22",
          600: "#a02d18",
        },
        ink: {
          50: "#f0f1f8",
          100: "#d3d6eb",
          200: "#a6aad4",
          300: "#797fbc",
          400: "#4c54a4",
          500: "#2D5F3E",
          600: "#1e4030",
          700: "#132822",
          800: "#0c1a16",
          900: "#0A0E27",
          950: "#050614",
        },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Songti SC"', '"SimSun"', "serif"],
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', "sans-serif"],
      },
      boxShadow: {
        bronze: "0 0 20px rgba(184, 115, 51, 0.35)",
        gold: "0 0 24px rgba(212, 175, 55, 0.4)",
        glow: "0 0 40px rgba(212, 175, 55, 0.15)",
      },
      backgroundImage: {
        "ancient-grid":
          "linear-gradient(rgba(212,175,55,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.05) 1px, transparent 1px)",
        "bronze-gradient":
          "linear-gradient(135deg, #5a3018 0%, #B87333 50%, #87481f 100%)",
      },
      backgroundSize: {
        "grid-size": "24px 24px",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float-slow": "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
