import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import EraserIcon from "@mui/icons-material/AutoFixOff";
import CircleIcon from "@mui/icons-material/Circle";
import HighlightAltIcon from "@mui/icons-material/HighlightAlt";
import worksheetImage from "./assets/problem-set.png";
import { supabase, hasSupabaseConfig } from "./supabaseClient";

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

const SCREENSHOT_BUCKET = import.meta.env.VITE_SUPABASE_SCREENSHOT_BUCKET || "screenshots";
const SCREENSHOT_TABLE = "student_snapshots";

/** Shown on worksheet + stored on every snapshot row for the teacher dashboard. */
const PROBLEM_SET_TITLE = "Simple Linear Equations";

const LS_STUDENT_ID = "studentId";
const LS_STUDENT_NAME = "studentName";

/** Clear persisted student identity on each full page load so reload = new session + name prompt. */
function clearStoredStudentSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_STUDENT_ID);
  localStorage.removeItem(LS_STUDENT_NAME);
}

const togglePillSx = {
  borderRadius: "32px",
  p: 1,
  gap: 0.75,
  flexDirection: "column",
  border: "none",
  bgcolor: "rgba(255,255,255,0.92)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
  "& .MuiToggleButtonGroup-grouped": {
    border: 0,
    borderRadius: "50% !important",
    mx: "auto",
  },
};

const toggleBtnSx = {
  width: 48,
  height: 48,
  minWidth: 48,
  color: "text.secondary",
  border: "none",
  "&:hover": {
    bgcolor: "rgba(26,26,26,0.06)",
  },
  "&.Mui-selected": {
    bgcolor: "#1a1a1a",
    color: "#fff",
    "&:hover": {
      bgcolor: "#2d2d2d",
    },
  },
};

export default function App() {
  const drawCanvasRef = useRef(null);
  const highlightCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const screenVideoRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const frameCanvasRef = useRef(null);

  const [tool, setTool] = useState(TOOL.DRAW);
  const [size, setSize] = useState(SIZE.MEDIUM);
  const [isCaptureRunning, setIsCaptureRunning] = useState(false);
  const [student, setStudent] = useState({ id: "", name: "" });
  const [nameInput, setNameInput] = useState("");
  const [wellDoneVisible, setWellDoneVisible] = useState(false);

  const isStudentRegistered = Boolean(student.id && student.name.trim());

  useEffect(() => {
    clearStoredStudentSession();
  }, []);

  const registerStudent = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    const id = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(LS_STUDENT_ID, id);
    localStorage.setItem(LS_STUDENT_NAME, trimmed);
    setStudent({ id, name: trimmed });
    setWellDoneVisible(false);
    // Start capture right after name is saved (browser will prompt for screen share).
    void startCaptureLoop();
  };

  const handleDoneClick = () => {
    if (!isCaptureRunning) return;
    stopCaptureLoop();
    setWellDoneVisible(true);
  };

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

  const stopCaptureLoop = () => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    const stream = screenVideoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      screenVideoRef.current.srcObject = null;
    }

    setIsCaptureRunning(false);
  };

  const uploadScreenshotToSupabase = async ({ frameDataUrl, takenAt }) => {
    if (!hasSupabaseConfig) {
      return;
    }

    const screenshotId =
      crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Read from localStorage so interval callbacks always see current identity (no stale closure).
    const studentId = localStorage.getItem(LS_STUDENT_ID) || student.id;
    const studentName = (localStorage.getItem(LS_STUDENT_NAME) || student.name || "").trim();
    const classId = localStorage.getItem("classId") || "class-demo";

    if (!studentId || !studentName) {
      return;
    }
    const filePath = `${classId}/${studentId}/${screenshotId}.jpg`;

    const response = await fetch(frameDataUrl);
    const imageBlob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(filePath, imageBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { error: insertError } = await supabase.from(SCREENSHOT_TABLE).insert({
      id: screenshotId,
      class_id: classId,
      student_id: studentId,
      name: studentName,
      problem_set_title: PROBLEM_SET_TITLE,
      storage_path: filePath,
      captured_at: takenAt,
    });

    if (insertError) {
      throw insertError;
    }
  };

  const captureAndSendFrame = async () => {
    const video = screenVideoRef.current;
    const canvas = frameCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;

    const ctx = canvas.getContext("2d");
    const maxWidth = 1024;
    const ratio = video.videoWidth / video.videoHeight;
    const width = Math.min(maxWidth, video.videoWidth);
    const height = Math.floor(width / ratio);

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);

    const frameDataUrl = canvas.toDataURL("image/jpeg", 0.75);
    const now = new Date();

    uploadScreenshotToSupabase({
      frameDataUrl,
      takenAt: now.toISOString(),
    }).catch((error) => {
      console.error("Supabase upload failed:", error);
    });
  };

  const startCaptureLoop = async () => {
    try {
      stopCaptureLoop();

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const video = screenVideoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      setIsCaptureRunning(true);
      captureAndSendFrame();
      captureIntervalRef.current = setInterval(captureAndSendFrame, 3000);

      const [track] = stream.getVideoTracks();
      if (track) {
        track.addEventListener("ended", () => {
          stopCaptureLoop();
        });
      }
    } catch (error) {
      console.error("Failed to start screen capture:", error);
      stopCaptureLoop();
    }
  };

  useEffect(() => {
    return () => {
      stopCaptureLoop();
    };
  }, []);

  return (
    <Box
      sx={{
        height: "100vh",
        bgcolor: "background.default",
        p: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {!isStudentRegistered ? (
        <Box
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-name-dialog-title"
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            bgcolor: "rgba(0, 0, 0, 0.38)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 4 },
              maxWidth: 440,
              width: "100%",
              borderRadius: "28px",
              bgcolor: "background.paper",
              boxShadow: "0 24px 64px rgba(0,0,0,0.1)",
              border: "1px solid rgba(26,26,26,0.06)",
            }}
          >
            <Typography
              id="student-name-dialog-title"
              variant="h5"
              component="h2"
              sx={{ mb: 0.5, color: "text.primary" }}
            >
              Welcome
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Enter your name to start.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              label="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") registerStudent();
              }}
              sx={{
                mb: 3,
                "& .MuiOutlinedInput-root": {
                  borderRadius: "18px",
                },
              }}
            />
            <Button
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              onClick={registerStudent}
              disabled={!nameInput.trim()}
              sx={{
                py: 1.5,
                fontSize: "1rem",
                opacity: nameInput.trim() ? 1 : 0.55,
              }}
            >
              Continue
            </Button>
          </Paper>
        </Box>
      ) : null}

      <Box
        sx={{
          position: "fixed",
          top: "50%",
          left: 20,
          transform: "translateY(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <ToggleButtonGroup
          exclusive
          orientation="vertical"
          value={tool}
          onChange={(_, nextTool) => {
            if (nextTool) setTool(nextTool);
          }}
          sx={togglePillSx}
        >
          <ToggleButton value={TOOL.DRAW} aria-label="Draw" sx={toggleBtnSx}>
            <BrushIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value={TOOL.HIGHLIGHT} aria-label="Highlight" sx={toggleBtnSx}>
            <HighlightAltIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value={TOOL.ERASE} aria-label="Erase" sx={toggleBtnSx}>
            <EraserIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          exclusive
          orientation="vertical"
          value={size}
          onChange={(_, nextSize) => {
            if (nextSize) setSize(nextSize);
          }}
          sx={togglePillSx}
        >
          <ToggleButton value={SIZE.SMALL} aria-label="Small size" sx={toggleBtnSx}>
            <CircleIcon sx={{ fontSize: 12 }} />
          </ToggleButton>
          <ToggleButton value={SIZE.MEDIUM} aria-label="Medium size" sx={toggleBtnSx}>
            <CircleIcon sx={{ fontSize: 18 }} />
          </ToggleButton>
          <ToggleButton value={SIZE.LARGE} aria-label="Large size" sx={toggleBtnSx}>
            <CircleIcon sx={{ fontSize: 24 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <video ref={screenVideoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={frameCanvasRef} style={{ display: "none" }} />

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          width: "100%",
          p: { xs: 1.5, sm: 2.5 },
          pl: { xs: 10, sm: 12 },
          boxSizing: "border-box",
        }}
      >
        {isStudentRegistered ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              flexShrink: 0,
              mb: 1.5,
            }}
          >
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleDoneClick}
              disabled={!isCaptureRunning}
              sx={{
                px: 3,
                py: 1.25,
                fontWeight: 700,
                bgcolor: isCaptureRunning ? "primary.main" : "rgba(26,26,26,0.12)",
                color: isCaptureRunning ? "primary.contrastText" : "text.secondary",
                boxShadow: isCaptureRunning ? "0 4px 20px rgba(0,0,0,0.12)" : "none",
                "&.Mui-disabled": {
                  bgcolor: "rgba(26,26,26,0.08)",
                  color: "text.disabled",
                },
              }}
            >
              Done
            </Button>
          </Box>
        ) : null}

        <Paper
          elevation={0}
          sx={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            bgcolor: "#ffffff",
            backgroundImage: `url(${worksheetImage})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "contain",
            position: "relative",
            overflow: "hidden",
            borderRadius: "28px",
            boxShadow: "0 4px 40px rgba(0,0,0,0.06)",
            border: "1px solid rgba(26,26,26,0.06)",
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
            pointerEvents:
              wellDoneVisible ? "none" : tool === TOOL.HIGHLIGHT ? "auto" : "none",
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
            pointerEvents:
              wellDoneVisible ? "none" : tool !== TOOL.HIGHLIGHT ? "auto" : "none",
            cursor: tool === TOOL.ERASE ? "cell" : "crosshair",
          }}
        />

        {wellDoneVisible ? (
          <Box
            role="status"
            aria-live="polite"
            sx={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              bgcolor: "rgba(0, 0, 0, 0.42)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
              p: 3,
              textAlign: "center",
            }}
          >
            <Typography
              variant="h3"
              component="p"
              sx={{
                color: "#ffffff",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                textShadow: "0 2px 24px rgba(0,0,0,0.25)",
              }}
            >
              Well done!
            </Typography>
            <Typography
              variant="body1"
              sx={{
                mt: 1.5,
                color: "rgba(255,255,255,0.88)",
                maxWidth: 360,
              }}
            >
              Great work on this problem set.
            </Typography>
          </Box>
        ) : null}
        </Paper>
      </Box>
    </Box>
  );
}
