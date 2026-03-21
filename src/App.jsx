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
import worksheetImage from "./assets/547583d9-6.png";
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

/** AI Provider Configuration */
const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER || "local"; // "local" or "openai"
const MLX_BASE_URL = import.meta.env.VITE_MLX_BASE_URL || "http://127.0.0.1:8081";
const MLX_MODEL_ID = import.meta.env.VITE_MLX_MODEL_ID || "mlx-community/Qwen3.5-0.8B-MLX-8bit";
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEBUG = import.meta.env.VITE_DEBUG === "true";
const LOG_ENDPOINT = "/api/debug-log";

/** Shown on worksheet + stored on every snapshot row for the teacher dashboard. */
const PROBLEM_SET_TITLE = "Simple Linear Equations";

const LS_STUDENT_ID = "studentId";
const LS_STUDENT_NAME = "studentName";

const randomId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

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
  const captureDelayRef = useRef(null);
  const logSessionRef = useRef(randomId());
  const frameCanvasRef = useRef(null);

  const [tool, setTool] = useState(TOOL.DRAW);
  const [size, setSize] = useState(SIZE.MEDIUM);
  const [isCaptureRunning, setIsCaptureRunning] = useState(false);
  const [student, setStudent] = useState({ id: "", name: "" });
  const [nameInput, setNameInput] = useState("");
  const [wellDoneVisible, setWellDoneVisible] = useState(false);
  const [latestCaption, setLatestCaption] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);

  const isStudentRegistered = Boolean(student.id && student.name.trim());

  const sendDebugLogToServer = (entry) => {
    if (!DEBUG || typeof window === "undefined" || typeof fetch === "undefined" || !entry) return;

    let sanitizedData = null;
    if (entry.data !== null && entry.data !== undefined) {
      try {
        sanitizedData = JSON.parse(JSON.stringify(entry.data));
      } catch {
        sanitizedData = {
          __unserializable: true,
          fallback: String(entry.data),
        };
      }
    }

    const payload = {
      sessionId: logSessionRef.current,
      timestamp: entry.timestamp,
      isoTimestamp: entry.isoTimestamp,
      type: entry.type,
      message: entry.message,
      data: sanitizedData,
      studentId: localStorage.getItem(LS_STUDENT_ID) || student.id || null,
      studentName: (localStorage.getItem(LS_STUDENT_NAME) || student.name || "").trim(),
      classId: localStorage.getItem("classId") || "class-demo",
    };

    fetch(LOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch((error) => {
      console.warn("Failed to persist debug log", error);
    });
  };

  const addDebugLog = (type, message, data = null) => {
    if (!DEBUG) return;
    const now = new Date();
    const logEntry = {
      timestamp: now.toLocaleTimeString(),
      type,
      message,
      data,
    };

    setDebugLogs((prev) => [...prev.slice(-49), logEntry]); // Keep last 50 logs
    console.log(`[${type}] ${message}`, data || "");
    sendDebugLogToServer({ ...logEntry, isoTimestamp: now.toISOString() });
  };

  useEffect(() => {
    if (DEBUG) {
      addDebugLog("info", "Debug mode enabled");
    }
  }, []);

  useEffect(() => {
    clearStoredStudentSession();
  }, []);

  const registerStudent = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    const id = randomId();
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
    if (captureDelayRef.current) {
      clearTimeout(captureDelayRef.current);
      captureDelayRef.current = null;
    }
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

  const SYSTEM_PROMPT = `You are an expert mathematics tutor analyzing a student's calculus worksheet. You MUST verify all answers by solving problems yourself first.

--- STEP 1: SOLVE THE PROBLEM YOURSELF
Before analyzing student work:
- Solve each problem completely and compute the EXACT correct answer
- For integrals: set up the integral and compute the numerical result
- For areas: identify bounds, set up ∫[top-bottom]dx, compute
- For volumes: use disk/washer/shell method correctly, compute
- Store your computed answer - you will compare against the student's answer

--- STEP 2: TRANSCRIBE

Problem Content (Exact transcription of printed text)

Student Work (Transcribed)
- Line-by-line transcription of student handwriting
- Mark [unclear] for ambiguous handwriting
- NEVER invent missing work

--- STEP 3: VERIFY CORRECTNESS (Critical)

CORRECT ANSWER (from your calculation):
- State the mathematically correct answer with work shown

STUDENT'S ANSWER:
- State what the student wrote as their final answer

VERDICT:
- CORRECT: Student's answer matches your computed answer (within reasonable rounding)
- INCORRECT: Student's answer differs from correct answer
- PARTIAL: Student has correct setup but wrong final answer
- UNCHECKABLE: Cannot verify due to missing work

If INCORRECT:
- Show what the correct answer should be
- Identify the likely error (wrong bounds? wrong integrand? algebra mistake?)
- DO NOT say "correct" if the answer is wrong

--- STEP 4: PROGRESS ANALYSIS

Current Step:
- What step the student is on (setup, integration, evaluation, final answer)

Thinking Assessment:
- Is their approach mathematically sound?
- Are they using the right method?
- What concept are they struggling with?

--- STEP 5: ERROR ANALYSIS (if applicable)

Common Errors to Check:
- Wrong bounds of integration
- Confusing top/bottom functions for area
- Forgetting π in volume problems
- Sign errors
- Algebra mistakes in simplification
- Using wrong formula (disk vs washer)

--- OUTPUT FORMAT

📋 PROBLEM
[Exact problem text]

🎯 CORRECT ANSWER
[Your computed answer with brief work]

✏️ STUDENT WORK
[Transcribed handwriting]

📊 VERDICT: CORRECT / INCORRECT / PARTIAL / UNCHECKABLE

❌ ERRORS FOUND (if any)
[Specific mistakes and corrections]

🧠 CONCEPTUAL UNDERSTANDING
- What they understand
- What they're missing

📝 NEXT STEPS
[What they should do to fix errors]`;

  const captionWithAI = async (frameDataUrl) => {
    const base64Image = frameDataUrl.split(',')[1];
    const isLocal = AI_PROVIDER === "local";
    
    addDebugLog("info", `Using ${isLocal ? "Local MLX" : "OpenAI"} for analysis`);
    console.log(`🤖 Using ${isLocal ? "Local MLX" : "OpenAI"} for analysis...`);

    try {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ]
        }
      ];

      if (isLocal) {
        // Local MLX Server
        const response = await fetch(`${MLX_BASE_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MLX_MODEL_ID,
            messages,
            max_tokens: 1500,
            stream: false
          })
        });

        if (!response.ok) {
          throw new Error(`MLX server error: ${response.status}`);
        }

        const data = await response.json();
        const caption = data.choices?.[0]?.message?.content || "No analysis generated";
        console.log("🤖 Local MLX Analysis:", caption);
        setLatestCaption(caption);
        return caption;
      } else {
        // OpenAI API
        if (!OPENAI_API_KEY) {
          throw new Error("OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env");
        }

        const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages,
            max_completion_tokens: 1500,
            stream: false
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          addDebugLog("error", `OpenAI HTTP ${response.status}`, errorData);
          throw new Error(`OpenAI error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        addDebugLog("info", "OpenAI raw response", { 
          id: data.id, 
          model: data.model, 
          finish_reason: data.choices?.[0]?.finish_reason,
          usage: data.usage,
          content_preview: data.choices?.[0]?.message?.content?.slice(0, 100) || "[empty]"
        });
        
        const caption = data.choices?.[0]?.message?.content || "No analysis generated";
        const finishReason = data.choices?.[0]?.finish_reason;
        
        if (finishReason === "length") {
          addDebugLog("warn", "OpenAI hit token limit - increase max_completion_tokens", { usage: data.usage });
        }
        
        console.log("🤖 OpenAI Analysis:", caption);
        setLatestCaption(caption);
        return caption;
      }
    } catch (error) {
      addDebugLog("error", `${AI_PROVIDER} analysis failed`, error.message);
      console.error(`${AI_PROVIDER} analysis failed:`, error);
      return null;
    }
  };

  const downloadScreenshotLocally = (frameDataUrl, timestamp) => {
    const studentName = (localStorage.getItem(LS_STUDENT_NAME) || student.name || "student").trim();
    const classId = localStorage.getItem("classId") || "class-demo";
    const dateStr = timestamp.toISOString().split("T")[0];
    const timeStr = timestamp.toTimeString().split(":")[0] + timestamp.toTimeString().split(":")[1];
    const filename = `${classId}_${studentName}_${dateStr}_${timeStr}.jpg`;

    const link = document.createElement("a");
    link.href = frameDataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const uploadScreenshotToSupabase = async ({ frameDataUrl, takenAt }) => {
    if (!hasSupabaseConfig) {
      return;
    }

    const screenshotId = randomId();
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
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      addDebugLog("warn", "Capture skipped - no video stream");
      return;
    }

    addDebugLog("info", "Capturing frame", { width: video.videoWidth, height: video.videoHeight });

    const ctx = canvas.getContext("2d");
    const maxWidth = 1920;
    const ratio = video.videoWidth / video.videoHeight;
    const width = Math.min(maxWidth, video.videoWidth);
    const height = Math.floor(width / ratio);

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);

    const frameDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const now = new Date();
    
    addDebugLog("info", `Frame captured: ${width}x${height}px, ~${Math.round(frameDataUrl.length / 1024)}KB`);

    // Get AI caption
    addDebugLog("info", "Sending to AI for analysis...");
    const caption = await captionWithAI(frameDataUrl);
    if (caption) {
      addDebugLog("info", "AI caption received", { preview: caption.slice(0, 100) });
      console.log(`[${now.toISOString()}] Caption: ${caption}`);
    } else {
      addDebugLog("warn", "No caption returned from AI");
    }

    uploadScreenshotToSupabase({
      frameDataUrl,
      takenAt: now.toISOString(),
    }).catch((error) => {
      addDebugLog("error", "Supabase upload failed", error.message);
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
      captureDelayRef.current = setTimeout(() => {
        captureDelayRef.current = null;
        void captureAndSendFrame();
        captureIntervalRef.current = setInterval(() => {
          void captureAndSendFrame();
        }, 3000);
      }, 5000);

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

        {latestCaption && !wellDoneVisible ? (
          <Box
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 15,
              maxWidth: 500,
              maxHeight: "80vh",
              overflow: "auto",
              bgcolor: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(4px)",
              borderRadius: 2,
              p: 2,
              boxShadow: 2,
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
              🤖 AI Observation
            </Typography>
            <Typography variant="body2" color="text.primary">
              {latestCaption}
            </Typography>
          </Box>
        ) : null}

        {DEBUG && debugLogs.length > 0 ? (
          <Box
            sx={{
              position: "fixed",
              bottom: 12,
              right: 12,
              zIndex: 100,
              width: 400,
              maxHeight: 250,
              bgcolor: "rgba(0, 0, 0, 0.85)",
              color: "#00ff00",
              fontFamily: "monospace",
              fontSize: "11px",
              borderRadius: 1,
              p: 1.5,
              overflow: "auto",
              boxShadow: 3,
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="caption" sx={{ color: "#00ff00", fontWeight: "bold" }}>
                🔧 DEBUG LOGS
              </Typography>
              <Button
                size="small"
                sx={{ color: "#00ff00", minWidth: "auto", p: 0.5, fontSize: "10px" }}
                onClick={() => setDebugLogs([])}
              >
                Clear
              </Button>
            </Box>
            {debugLogs.map((log, i) => (
              <Box key={i} sx={{ mb: 0.5, wordBreak: "break-word" }}>
                <span style={{ color: "#888" }}>[{log.timestamp}]</span>{" "}
                <span style={{ color: log.type === "error" ? "#ff4444" : log.type === "warn" ? "#ffaa00" : "#00ff00" }}>
                  {log.type.toUpperCase()}:
                </span>{" "}
                {log.message}
                {log.data && (
                  <Box component="pre" sx={{ m: 0, pl: 2, color: "#aaa", fontSize: "10px" }}>
                    {JSON.stringify(log.data, null, 2).slice(0, 200)}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ) : null}
      </Paper>
    </Box>
  );
}
