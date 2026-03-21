// This server uses the express from local-llm-video-captioning
// Run: cd /Users/pierce/Documents/hackduke26stu && node --experimental-vm-modules server/logServer.js
// Or use: node -r /Users/pierce/Documents/hackduke26stu/local-llm-video-captioning/node_modules/esm server/logServer.js

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const express = require("/Users/pierce/Documents/hackduke26stu/local-llm-video-captioning/node_modules/express");
const cors = require("/Users/pierce/Documents/hackduke26stu/local-llm-video-captioning/node_modules/cors");
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const LOGS_DIR = path.join(__dirname, "..", "logs");

// Ensure logs directory exists
async function ensureLogsDir() {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create logs directory:", err);
  }
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Receive debug logs
app.post("/api/debug-log", async (req, res) => {
  try {
    const { sessionId, timestamp, isoTimestamp, type, message, data, studentId, studentName, classId } = req.body;
    
    if (!sessionId || !timestamp || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const logEntry = {
      sessionId,
      timestamp,
      isoTimestamp,
      type,
      message,
      data,
      studentId,
      studentName,
      classId,
      receivedAt: new Date().toISOString(),
    };

    // Write to session-specific file
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `${dateStr}_${sessionId.slice(0, 8)}.jsonl`;
    const filepath = path.join(LOGS_DIR, filename);

    const line = JSON.stringify(logEntry) + "\n";
    await fs.appendFile(filepath, line, "utf8");

    res.json({ success: true, filename });
  } catch (error) {
    console.error("Failed to save log:", error);
    res.status(500).json({ error: "Failed to save log" });
  }
});

// Get all log files
app.get("/api/logs", async (req, res) => {
  try {
    const files = await fs.readdir(LOGS_DIR);
    const logFiles = files.filter(f => f.endsWith(".jsonl")).sort().reverse();
    res.json({ files: logFiles });
  } catch (error) {
    res.json({ files: [] });
  }
});

// Get logs for a specific session
app.get("/api/logs/:filename", async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(LOGS_DIR, filename);
    
    // Security check - ensure it's within LOGS_DIR
    const resolvedPath = path.resolve(filepath);
    const resolvedLogsDir = path.resolve(LOGS_DIR);
    if (!resolvedPath.startsWith(resolvedLogsDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const content = await fs.readFile(filepath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const logs = lines.map(line => JSON.parse(line));
    
    res.json({ logs });
  } catch (error) {
    res.status(404).json({ error: "Log file not found" });
  }
});

// Download all logs as a zip or combined file
app.get("/api/logs/download/all", async (req, res) => {
  try {
    const files = await fs.readdir(LOGS_DIR);
    const logFiles = files.filter(f => f.endsWith(".jsonl"));
    
    let allLogs = [];
    for (const file of logFiles) {
      const content = await fs.readFile(path.join(LOGS_DIR, file), "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      const logs = lines.map(line => JSON.parse(line));
      allLogs.push(...logs);
    }
    
    allLogs.sort((a, b) => new Date(a.isoTimestamp) - new Date(b.isoTimestamp));
    
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="all-logs-${new Date().toISOString().split("T")[0]}.json"`);
    res.json(allLogs);
  } catch (error) {
    res.status(500).json({ error: "Failed to compile logs" });
  }
});

const PORT = process.env.LOG_SERVER_PORT || 8788;

ensureLogsDir().then(() => {
  app.listen(PORT, () => {
    console.log(`📁 Log server running on http://localhost:${PORT}`);
    console.log(`   Logs saved to: ${LOGS_DIR}`);
  });
});
