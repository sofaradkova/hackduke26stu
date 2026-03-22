import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
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
import MovieIcon from "@mui/icons-material/Movie";
import CloseIcon from "@mui/icons-material/Close";
import worksheetImage from "./assets/problem-set.png";
import { supabase, hasSupabaseConfig } from "./supabaseClient";
import {
  createAiSession,
  postAiScreenshot,
} from "./aiBackend.js";

const CLASS_ID =
  import.meta.env.VITE_CLASS_ID?.trim() || "class-demo";

const LS_AI_STORE = "hackduke_ai_session";

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

const HELP_VIDEO_URL =
  "https://dfngqawzseqhzehxbrqr.supabase.co/storage/v1/object/public/video/prob4frq-Prob4FRQScene.mp4";

const SCREENSHOT_BUCKET = import.meta.env.VITE_SUPABASE_SCREENSHOT_BUCKET || "screenshots";
const SCREENSHOT_TABLE = "student_snapshots";

/** Shown on worksheet + stored on every snapshot row for the teacher dashboard. */
const PROBLEM_SET_TITLE = "Simple Linear Equations";

/** Map backend AI categories to Supabase ai_flags CHECK constraint values. */
const CATEGORY_TO_DB = {
  "on-track": "success",
  "calc-error": "calculation-error",
  "wrong-approach": "wrong-approach",
  "stuck": "stuck",
  "off-topic": "off-topic",
  "unsure": "unsure",
};

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
  const worksheetImageRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const frameCanvasRef = useRef(null);

  const [tool, setTool] = useState(TOOL.DRAW);
  const [size, setSize] = useState(SIZE.MEDIUM);
  const [isCaptureRunning, setIsCaptureRunning] = useState(false);
  const [student, setStudent] = useState({ id: "", name: "" });
  const [nameInput, setNameInput] = useState("");
  const [wellDoneVisible, setWellDoneVisible] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  /** AI backend: session + progressive evaluations (stored for this student in-session). */
  const [aiSession, setAiSession] = useState(null);
  const [aiEvaluations, setAiEvaluations] = useState([]);
  const backendSessionIdRef = useRef(null);
  const aiSessionRef = useRef(null);
  const isCapturingRef = useRef(false);

  useEffect(() => {
    aiSessionRef.current = aiSession;
  }, [aiSession]);

  const isStudentRegistered = Boolean(student.id && student.name.trim());

  useEffect(() => {
    clearStoredStudentSession();
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = worksheetImage;
    img.onload = () => { worksheetImageRef.current = img; };
  }, []);

  const registerStudent = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    const id = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(LS_STUDENT_ID, id);
    localStorage.setItem(LS_STUDENT_NAME, trimmed);
    setStudent({ id, name: trimmed });
    setWellDoneVisible(false);
    backendSessionIdRef.current = null;
    setAiSession(null);
    setAiEvaluations([]);
    try {
      localStorage.removeItem(LS_AI_STORE);
    } catch {
      /* ignore */
    }
    // Start capture right after name is saved.
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

    setIsCaptureRunning(false);
  };

  const uploadScreenshotToSupabase = async ({ imageBlob, takenAt }) => {
    if (!hasSupabaseConfig) {
      return;
    }

    const screenshotId =
      crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Read from localStorage so interval callbacks always see current identity (no stale closure).
    const studentId = localStorage.getItem(LS_STUDENT_ID) || student.id;
    const studentName = (localStorage.getItem(LS_STUDENT_NAME) || student.name || "").trim();
    const classId = localStorage.getItem("classId") || CLASS_ID;

    if (!studentId || !studentName) {
      return;
    }
    const filePath = `${classId}/${studentId}/${screenshotId}.jpg`;

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

    return screenshotId;
  };

  const persistAiStore = (session, evaluations) => {
    try {
      const studentId = localStorage.getItem(LS_STUDENT_ID);
      if (!studentId) return;
      localStorage.setItem(
        LS_AI_STORE,
        JSON.stringify({
          studentId,
          session,
          evaluations,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      /* ignore */
    }
  };

  const sendFrameToAiBackend = async (imageBlob) => {
    const studentId = localStorage.getItem(LS_STUDENT_ID) || student.id;
    if (!studentId) return null;

    try {
      if (!backendSessionIdRef.current) {
        const data = await createAiSession(imageBlob, studentId, CLASS_ID);
        backendSessionIdRef.current = data.sessionId;
        const next = {
          sessionId: data.sessionId,
          sourceOfTruth: data.sourceOfTruth,
          status: data.status,
        };
        setAiSession(next);
        persistAiStore(next, []);
        return null;
      } else {
        const evalResult = await postAiScreenshot(backendSessionIdRef.current, imageBlob);
        setAiEvaluations((prev) => {
          const next = [
            ...prev,
            {
              at: new Date().toISOString(),
              ...evalResult,
            },
          ];
          persistAiStore(
            {
              sessionId: backendSessionIdRef.current,
              sourceOfTruth: aiSessionRef.current?.sourceOfTruth,
              status: aiSessionRef.current?.status,
            },
            next,
          );
          return next;
        });
        return evalResult;
      }
    } catch (error) {
      console.error("AI backend request failed:", error);
      return null;
    }
  };

  const captureAndSendFrame = async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    try {
    const drawCanvas = drawCanvasRef.current;
    const highlightCanvas = highlightCanvasRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (!drawCanvas || !highlightCanvas || !frameCanvas) return;

    const width = drawCanvas.width;
    const height = drawCanvas.height;
    if (width === 0 || height === 0) return;

    frameCanvas.width = width;
    frameCanvas.height = height;
    const ctx = frameCanvas.getContext("2d");

    // Layer 1: White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Layer 2: Worksheet background image (matching CSS background-size: contain)
    if (worksheetImageRef.current) {
      const img = worksheetImageRef.current;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = width / height;
      let dw, dh, dx, dy;
      if (imgRatio > canvasRatio) {
        dw = width; dh = width / imgRatio;
        dx = 0; dy = (height - dh) / 2;
      } else {
        dh = height; dw = height * imgRatio;
        dx = (width - dw) / 2; dy = 0;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    // Layer 3: Highlight strokes (opacity matches CSS 0.28)
    ctx.globalAlpha = 0.28;
    ctx.drawImage(highlightCanvas, 0, 0);
    ctx.globalAlpha = 1.0;

    // Layer 4: Draw strokes
    ctx.drawImage(drawCanvas, 0, 0);

    const frameDataUrl = frameCanvas.toDataURL("image/jpeg", 0.75);
    const now = new Date();
    const imageBlob = await (await fetch(frameDataUrl)).blob();

    // Upload screenshot to Supabase
    let screenshotId = null;
    try {
      screenshotId = await uploadScreenshotToSupabase({
        imageBlob,
        takenAt: now.toISOString(),
      });
    } catch (error) {
      console.error("Supabase upload failed:", error);
    }

    // Get AI evaluation
    const evalResult = await sendFrameToAiBackend(imageBlob);

    // Persist AI result to Supabase: insert ai_flags row, update snapshot
    if (evalResult && screenshotId && hasSupabaseConfig) {
      try {
        const dbCategory = CATEGORY_TO_DB[evalResult.category] || "unsure";
        const dbStatus = dbCategory === "success" ? "ok" : "flagged";

        const { data: flag, error: flagError } = await supabase
          .from("ai_flags")
          .insert({
            reason: evalResult.reason,
            category: dbCategory,
            confidence_score: evalResult.confidenceScore,
            triggered_at: now.toISOString(),
            confusion_highlights: evalResult.confusionHighlights || [],
          })
          .select("id")
          .single();

        if (!flagError && flag) {
          const { error: updateError } = await supabase
            .from(SCREENSHOT_TABLE)
            .update({
              current_flag_id: flag.id,
              status: dbStatus,
              progress_percent: evalResult.progressPercent,
              last_checked_at: now.toISOString(),
            })
            .eq("id", screenshotId);
          if (updateError) console.error("Supabase snapshot update failed:", updateError);
        }
      } catch (error) {
        console.error("Supabase AI flag persist failed:", error);
      }
    }
    } finally {
      isCapturingRef.current = false;
    }
  };

  const startCaptureLoop = async () => {
    stopCaptureLoop();
    backendSessionIdRef.current = null;
    setAiSession(null);
    setAiEvaluations([]);
    try { localStorage.removeItem(LS_AI_STORE); } catch { /* ignore */ }

    setIsCaptureRunning(true);
    captureAndSendFrame();
    captureIntervalRef.current = setInterval(captureAndSendFrame, 3000);
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

        <Box
          sx={{
            ...togglePillSx,
            p: 0.75,
          }}
        >
          <IconButton
            onClick={() => setVideoOpen(true)}
            aria-label="Play help video"
            sx={{
              width: 48,
              height: 48,
              color: "text.secondary",
              "&:hover": {
                bgcolor: "rgba(26,26,26,0.06)",
              },
            }}
          >
            <MovieIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {videoOpen && (
        <Box
          onClick={() => setVideoOpen(false)}
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            bgcolor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              position: "relative",
              maxWidth: "80vw",
              maxHeight: "80vh",
              borderRadius: "28px",
              overflow: "hidden",
              bgcolor: "#000",
              boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
            }}
          >
            <IconButton
              onClick={() => setVideoOpen(false)}
              aria-label="Close video"
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 1,
                bgcolor: "rgba(0,0,0,0.5)",
                color: "#fff",
                "&:hover": {
                  bgcolor: "rgba(0,0,0,0.7)",
                },
              }}
            >
              <CloseIcon />
            </IconButton>
            <video
              src={HELP_VIDEO_URL}
              autoPlay
              controls
              style={{
                display: "block",
                maxWidth: "80vw",
                maxHeight: "80vh",
              }}
            />
          </Box>
        </Box>
      )}

      <canvas ref={frameCanvasRef} style={{ display: "none" }} />

      {isStudentRegistered && isCaptureRunning ? (
        <Paper
          elevation={3}
          sx={{
            position: "fixed",
            bottom: 16,
            right: 16,
            zIndex: 100,
            maxWidth: 360,
            p: 2,
            borderRadius: "16px",
            bgcolor: "rgba(255,255,255,0.96)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            border: "1px solid rgba(26,26,26,0.08)",
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            AI progress
          </Typography>
          {!aiSession ? (
            <Typography variant="body2">Starting problem session…</Typography>
          ) : aiEvaluations.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Session ready — grading begins on the next snapshot (every 3s).
            </Typography>
          ) : (
            (() => {
              const last = aiEvaluations[aiEvaluations.length - 1];
              return (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {last.progressPercent}% · {last.category}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {last.reason}
                  </Typography>
                  {last.confusionHighlights?.length ? (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                      {last.confusionHighlights.join(" · ")}
                    </Typography>
                  ) : null}
                </Box>
              );
            })()
          )}
        </Paper>
      ) : null}

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
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 2,
              flexShrink: 0,
              mb: 1.5,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-start",
                gap: 2,
                minWidth: 0,
                flex: 1,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, flexShrink: 0, pt: 0.5 }}
              >
                {student.name}
              </Typography>
            </Box>

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
                flexShrink: 0,
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
