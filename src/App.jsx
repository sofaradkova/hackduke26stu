import { useEffect, useRef, useState } from "react";
import { Box, Paper, ToggleButton, ToggleButtonGroup } from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import EraserIcon from "@mui/icons-material/AutoFixOff";
import CircleIcon from "@mui/icons-material/Circle";
import worksheetImage from "./assets/problem-set.png";

const TOOL = {
  DRAW: "draw",
  ERASE: "erase",
};

const SIZE = {
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
};

const SIZE_TO_PX = {
  [SIZE.SMALL]: 4,
  [SIZE.MEDIUM]: 10,
  [SIZE.LARGE]: 18,
};

export default function App() {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState(TOOL.DRAW);
  const [size, setSize] = useState(SIZE.MEDIUM);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const resizeCanvas = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  const setBrushForTool = (ctx) => {
    const selectedSize = SIZE_TO_PX[size];

    if (tool === TOOL.DRAW) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = selectedSize;
      return;
    }

    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = selectedSize;
  };

  const getPos = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(event);

    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    setBrushForTool(ctx);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(event);

    setBrushForTool(ctx);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current.releasePointerCapture(event.pointerId);
  };

  return (
    <Box sx={{ height: "100vh", bgcolor: "#f3f4f6", p: 0 }}>
      <Box
        sx={{
          position: "fixed",
          top: "50%",
          left: 12,
          transform: "translateY(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <ToggleButtonGroup
          color="primary"
          exclusive
          orientation="vertical"
          value={tool}
          onChange={(_, nextTool) => {
            if (nextTool) setTool(nextTool);
          }}
          sx={{ bgcolor: "#ffffff" }}
        >
          <ToggleButton value={TOOL.DRAW} aria-label="Draw">
            <BrushIcon />
          </ToggleButton>
          <ToggleButton value={TOOL.ERASE} aria-label="Erase">
            <EraserIcon />
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          color="primary"
          exclusive
          orientation="vertical"
          value={size}
          onChange={(_, nextSize) => {
            if (nextSize) setSize(nextSize);
          }}
          sx={{ bgcolor: "#ffffff" }}
        >
          <ToggleButton value={SIZE.SMALL} aria-label="Small size">
            <CircleIcon sx={{ fontSize: 12 }} />
          </ToggleButton>
          <ToggleButton value={SIZE.MEDIUM} aria-label="Medium size">
            <CircleIcon sx={{ fontSize: 18 }} />
          </ToggleButton>
          <ToggleButton value={SIZE.LARGE} aria-label="Large size">
            <CircleIcon sx={{ fontSize: 24 }} />
          </ToggleButton>
        </ToggleButtonGroup>

      </Box>

      <Paper
        elevation={0}
        sx={{
          width: "100%",
          height: "100%",
          bgcolor: "#ffffff",
          backgroundImage: `url(${worksheetImage})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "contain",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            background: "transparent",
            cursor: tool === TOOL.ERASE ? "cell" : "crosshair",
          }}
        />
      </Paper>
    </Box>
  );
}
