import { createTheme } from "@mui/material/styles";

/** Soft pastel / cream dashboard aesthetic (education UI) */
export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1a1a1a",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#E8D5C4",
    },
    background: {
      default: "#F9F7F2",
      paper: "#FFFFFF",
    },
    success: {
      main: "#7CB9A8",
      light: "#C5E8DC",
    },
    text: {
      primary: "#1a1a1a",
      secondary: "#6B7280",
    },
    divider: "rgba(26, 26, 26, 0.08)",
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    h3: {
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
    h4: {
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
    h5: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h6: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    body1: {
      letterSpacing: "-0.01em",
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#F9F7F2",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          paddingLeft: 24,
          paddingRight: 24,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          },
        },
        contained: {
          "&:hover": {
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          backgroundColor: "rgba(255,255,255,0.85)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});
