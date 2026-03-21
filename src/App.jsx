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
  const [captureCount, setCaptureCount] = useState(0);
  const [lastCaptureAt, setLastCaptureAt] = useState(null);
  const [lastFramePreviewUrl, setLastFramePreviewUrl] = useState("");
  const [captureHistory, setCaptureHistory] = useState([]);
  const [captureError, setCaptureError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("No uploads yet");
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

  const fakeGeminiVisionRequest = async ({ frameDataUrl, frameNumber, takenAt }) => {
    // Simulated payload; replace with real fetch once API is wired.
    const payload = {
      model: "gemini-2.5-flash",
      prompt: "Describe what is happening in this screenshot.",
      imageFormat: "jpeg",
      screenshotCapturedAt: takenAt,
      screenshotNumber: frameNumber,
      imageBytesApprox: frameDataUrl.length,
    };

    console.log("[SIMULATED GEMINI REQUEST]", payload);
    await new Promise((resolve) => setTimeout(resolve, 150));
  };

  const uploadScreenshotToSupabase = async ({ frameDataUrl, takenAt }) => {
    if (!hasSupabaseConfig) {
      setUploadStatus("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to upload.");
      return;
    }

    const screenshotId =
      crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Read from localStorage so interval callbacks always see current identity (no stale closure).
    const studentId = localStorage.getItem(LS_STUDENT_ID) || student.id;
    const studentName = (localStorage.getItem(LS_STUDENT_NAME) || student.name || "").trim();
    const classId = localStorage.getItem("classId") || "class-demo";

    if (!studentId || !studentName) {
      setUploadStatus("Set your name first (student ID is created automatically).");
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

    setUploadStatus(`Uploaded ${new Date(takenAt).toLocaleTimeString()}`);
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

    setCaptureCount((prev) => {
      const next = prev + 1;
      fakeGeminiVisionRequest({
        frameDataUrl,
        frameNumber: next,
        takenAt: now.toISOString(),
      });
      return next;
    });

    setLastCaptureAt(now.toLocaleTimeString());
    setLastFramePreviewUrl(frameDataUrl);
    setCaptureHistory((prev) => {
      const nextEntry = {
        id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
        capturedAt: now.toLocaleTimeString(),
        frameDataUrl,
      };
      return [nextEntry, ...prev].slice(0, 24);
    });

    uploadScreenshotToSupabase({
      frameDataUrl,
      takenAt: now.toISOString(),
    }).catch((error) => {
      console.error("Supabase upload failed:", error);
      setUploadStatus(`Upload failed: ${error.message}`);
    });
  };

  const startCaptureLoop = async () => {
    try {
      setCaptureError("");
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
      setCaptureError("Screen capture permission was denied or unavailable.");
      stopCaptureLoop();
    }
  };

  useEffect(() => {
    return () => {
      stopCaptureLoop();
    };
  }, []);

  return (
    <Box sx={{ height: "100vh", bgcolor: "#f3f4f6", p: 0, position: "relative" }}>
      {!isStudentRegistered ? (
        <Box
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-name-dialog-title"
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            bgcolor: "rgba(15, 23, 42, 0.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
          }}
        >
          <Paper
            elevation={12}
            sx={{
              p: 3,
              maxWidth: 420,
              width: "100%",
              borderRadius: 2,
            }}
          >
            <Typography id="student-name-dialog-title" variant="h6" component="h2" gutterBottom>
              Welcome
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter your name. A student ID will be created and saved on this device.
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
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={registerStudent}
              disabled={!nameInput.trim()}
            >
              Continue
            </Button>
          </Paper>
        </Box>
      ) : null}

      {isStudentRegistered ? (
        <Box
          sx={{
            position: "fixed",
            top: "max(12px, env(safe-area-inset-top, 0px))",
            left: "max(12px, env(safe-area-inset-left, 0px))",
            zIndex: 2100,
            pointerEvents: "auto",
          }}
        >
          <Button
            variant="contained"
            color="primary"
            size="medium"
            onClick={handleDoneClick}
            disabled={!isCaptureRunning}
            sx={{ boxShadow: 3, fontWeight: 700 }}
          >
            Done
          </Button>
        </Box>
      ) : null}

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

      <Box
        sx={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 11,
          width: 320,
          p: 1.5,
          borderRadius: 2,
          bgcolor: "rgba(17, 24, 39, 0.88)",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <Typography variant="subtitle2">
          Screen Capture to Gemini (Simulated)
        </Typography>

        {isStudentRegistered ? (
          <Box sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#e2e8f0", display: "block" }}>
              Student: <strong>{student.name}</strong>
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 10, wordBreak: "break-all" }}
            >
              ID: {student.id}
            </Typography>
          </Box>
        ) : null}

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="contained"
            color="success"
            size="small"
            onClick={startCaptureLoop}
            disabled={isCaptureRunning || !isStudentRegistered}
          >
            Start 3s Capture
          </Button>
        </Box>

        <Typography variant="caption">
          Status: {isCaptureRunning ? "Running" : "Stopped"} | Captures:{" "}
          {captureCount}
        </Typography>

        <Typography variant="caption">
          Last capture: {lastCaptureAt ?? "N/A"}
        </Typography>

        <Typography variant="caption">Upload: {uploadStatus}</Typography>

        <Button
          variant="text"
          size="small"
          onClick={() => setCaptureHistory([])}
          sx={{ color: "#cbd5e1", justifyContent: "flex-start", px: 0.5 }}
        >
          Clear saved screenshots
        </Button>

        {captureError ? (
          <Typography variant="caption" sx={{ color: "#fecaca" }}>
            {captureError}
          </Typography>
        ) : null}

        <Box
          sx={{
            mt: 0.5,
            pt: 1,
            borderTop: "1px solid #ffffff22",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
            Screenshots
          </Typography>

          {lastFramePreviewUrl ? (
            <Box
              component="img"
              src={lastFramePreviewUrl}
              alt="latest screen capture preview"
              sx={{
                width: "100%",
                borderRadius: 1,
                border: "1px solid #ffffff33",
                objectFit: "cover",
                maxHeight: 180,
                bgcolor: "#000000",
              }}
            />
          ) : null}

          {captureHistory.length ? (
            <Box
              sx={{
                maxHeight: 190,
                overflowY: "auto",
                display: "grid",
                gap: 0.75,
              }}
            >
              {captureHistory.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr",
                    gap: 1,
                    alignItems: "center",
                  }}
                >
                  <Box
                    component="img"
                    src={entry.frameDataUrl}
                    alt={`captured ${entry.capturedAt}`}
                    sx={{
                      width: 90,
                      height: 54,
                      borderRadius: 0.75,
                      objectFit: "cover",
                      border: "1px solid #ffffff2e",
                      bgcolor: "#000000",
                    }}
                  />
                  <Typography variant="caption" sx={{ color: "#d1d5db" }}>
                    Captured at {entry.capturedAt}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      </Box>

      <video ref={screenVideoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={frameCanvasRef} style={{ display: "none" }} />

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
              bgcolor: "rgba(15, 23, 42, 0.55)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <Typography
              variant="h3"
              component="p"
              sx={{
                color: "#ffffff",
                fontWeight: 700,
                textAlign: "center",
                px: 2,
                textShadow: "0 2px 12px rgba(0,0,0,0.35)",
              }}
            >
              Well done!
            </Typography>
          </Box>
        ) : null}
      </Paper>
    </Box>
  );
}
