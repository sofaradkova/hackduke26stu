import { useEffect, useRef, useState } from "react";
import { Box, Paper, ToggleButton, ToggleButtonGroup } from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import EraserIcon from "@mui/icons-material/AutoFixOff";
import CircleIcon from "@mui/icons-material/Circle";
import HighlightAltIcon from "@mui/icons-material/HighlightAlt";
import worksheetImage from "./assets/problem-set.png";

const TOOL = {
  DRAW: "draw",
  HIGHLIGHT: "highlight",
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
  const drawCanvasRef = useRef(null);
  const highlightCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const [tool, setTool] = useState(TOOL.DRAW);
  const [size, setSize] = useState(SIZE.MEDIUM);

  useEffect(() => {
    const resizeOne = (canvas) => {
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    const resizeAll = () => {
      resizeOne(drawCanvasRef.current);
      resizeOne(highlightCanvasRef.current);
    };

    resizeAll();
    window.addEventListener("resize", resizeAll);
    return () => window.removeEventListener("resize", resizeAll);
  }, []);

  const getActiveCanvas = () => {
    if (tool === TOOL.HIGHLIGHT) return highlightCanvasRef.current;
    return drawCanvasRef.current;
  };

  const getPos = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const setBrushForTool = (ctx) => {
    const selectedSize = SIZE_TO_PX[size];

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === TOOL.DRAW) {
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = selectedSize;
      return;
    }

    if (tool === TOOL.HIGHLIGHT) {
      ctx.strokeStyle = "#ffeb3b";
      ctx.lineWidth = selectedSize * 2.5;
    }
  };

  const eraseStroke = (from, to) => {
    const selectedSize = SIZE_TO_PX[size] * 2;

    [drawCanvasRef.current, highlightCanvasRef.current].forEach((canvas) => {
      if (!canvas) return;

      const ctx = canvas.getContext("2d");

      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = selectedSize;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      ctx.restore();
    });
  };

  const eraseDot = (point) => {
    const radius = SIZE_TO_PX[size];

    [drawCanvasRef.current, highlightCanvasRef.current].forEach((canvas) => {
      if (!canvas) return;

      const ctx = canvas.getContext("2d");

      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };

  const handlePointerDown = (event) => {
    if (tool === TOOL.ERASE) {
      const canvas = drawCanvasRef.current;
      const point = getPos(event, canvas);

      drawingRef.current = true;
      lastPointRef.current = point;
      canvas?.setPointerCapture(event.pointerId);
      eraseDot(point);
      return;
    }

    const canvas = getActiveCanvas();
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(event, canvas);

    drawingRef.current = true;
    lastPointRef.current = { x, y };
    canvas.setPointerCapture(event.pointerId);
    setBrushForTool(ctx);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;

    if (tool === TOOL.ERASE) {
      const canvas = drawCanvasRef.current;
      const nextPoint = getPos(event, canvas);
      const prevPoint = lastPointRef.current ?? nextPoint;

      eraseStroke(prevPoint, nextPoint);
      lastPointRef.current = nextPoint;
      return;
    }

    const canvas = getActiveCanvas();
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(event, canvas);

    setBrushForTool(ctx);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPointRef.current = { x, y };
  };

  const handlePointerUp = (event) => {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    lastPointRef.current = null;

    if (tool === TOOL.ERASE) {
      drawCanvasRef.current?.releasePointerCapture(event.pointerId);
      return;
    }

    const canvas = getActiveCanvas();
    canvas.releasePointerCapture(event.pointerId);
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
          <ToggleButton value={TOOL.HIGHLIGHT} aria-label="Highlight">
            <HighlightAltIcon />
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
          position: "relative",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={highlightCanvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            background: "transparent",
            opacity: 0.28,
            pointerEvents: tool === TOOL.HIGHLIGHT ? "auto" : "none",
            cursor: tool === TOOL.HIGHLIGHT ? "crosshair" : "default",
          }}
        />

        <canvas
          ref={drawCanvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            background: "transparent",
            pointerEvents: tool !== TOOL.HIGHLIGHT ? "auto" : "none",
            cursor: tool === TOOL.ERASE ? "cell" : "crosshair",
          }}
        />
      </Paper>
    </Box>
  );
}
