import { serve } from "bun";
import { detectFormat } from "./cli";
import { PdfDownloader } from "./downloader/pdf";
import { EpubDownloader } from "./downloader/epub";
import { GoogleBookManifest } from "./types";
import path from "path";
import fs from "fs";
import os from "os";
import { LANGUAGE } from "./utils/config";
import { t } from "./utils/i18n";

interface DownloadTask {
  id: string;
  bookId: string;
  title: string;
  authors: string;
  status: 'pending' | 'downloading' | 'merging' | 'completed' | 'failed';
  format: 'pdf' | 'epub';
  current: number;
  total: number;
  message: string;
  error?: string;
  outputPath?: string;
  filename?: string;
  timestamp: number;
}

const activeDownloads = new Map<string, DownloadTask>();
const COOKIES_PATH = path.resolve("./cookies.txt");
const OUTPUT_DIR = path.resolve("./downloads");
const TEMP_DIR = path.resolve("./temp");

// Cleanup completed or failed tasks older than 2 hours to release memory
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [id, task] of activeDownloads.entries()) {
    if ((task.status === 'completed' || task.status === 'failed') && (now - task.timestamp > TWO_HOURS)) {
      activeDownloads.delete(id);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

function extractBookId(input: string): string {
  const urlRegex = /[?&]id=([a-zA-Z0-9_\-]+)/;
  const match = input.match(urlRegex);
  if (match) {
    return match[1];
  }
  // If it's not a URL, check if it's just the ID
  if (/^[a-zA-Z0-9_\-]+$/.test(input.trim())) {
    return input.trim();
  }
  throw new Error("Invalid URL or Book ID format. Please check the URL.");
}

async function handleDownload(downloadId: string, bookId: string, requestedFormat: 'pdf' | 'epub' | 'auto') {
  const task = activeDownloads.get(downloadId);
  if (!task) return;

  try {
    task.status = 'pending';
    task.message = t("detecting_format");

    // 1. Validate cookies file
    if (!fs.existsSync(COOKIES_PATH)) {
      throw new Error(t("cookies_missing", { path: COOKIES_PATH }));
    }

    // 2. Detect format/manifest
    let format: 'pdf' | 'epub' = 'pdf';
    let manifest: GoogleBookManifest;

    const detected = await detectFormat(bookId, COOKIES_PATH);
    manifest = detected.manifest;
    
    if (requestedFormat === 'auto') {
      format = detected.format;
    } else {
      format = requestedFormat;
    }

    task.format = format;
    const metadata = manifest.metadata;
    task.title = metadata.title || metadata.volume_title || "Untitled Book";
    const authorsVal = metadata.authors || metadata.author || metadata.creator || "Unknown Author";
    task.authors = Array.isArray(authorsVal) ? authorsVal.join(", ") : String(authorsVal);
    
    task.status = 'downloading';
    task.message = t("starting_download", { format: format.toUpperCase() });

    // 3. Setup downloader
    const downloaderOptions = {
      cookiesPath: COOKIES_PATH,
      outputDir: OUTPUT_DIR,
      tempDir: TEMP_DIR,
      pace: 300, // delay between pages in ms
      manifest,
      onProgress: (current: number, total: number, message: string) => {
        task.current = current;
        task.total = total;
        task.message = message;
        // Adjust status dynamically based on operation
        if (message.toLowerCase().includes('merging') || message.toLowerCase().includes('assembling')) {
          task.status = 'merging';
        } else {
          task.status = 'downloading';
        }
      }
    };

    if (format === 'pdf') {
      const downloader = new PdfDownloader(bookId, downloaderOptions);
      await downloader.run();
    } else {
      const downloader = new EpubDownloader(bookId, downloaderOptions);
      await downloader.run();
    }

    // 4. Finished
    task.status = 'completed';
    task.message = t("download_success");
    
    const safeTitle = task.title.trim().replace(/[^a-z0-9_\-\.]/gi, "_");
    const filename = `${safeTitle}.${format}`;
    task.outputPath = path.join(OUTPUT_DIR, filename);
    task.filename = filename;

  } catch (err: any) {
    task.status = 'failed';
    task.error = err.message || String(err);
    task.message = t("download_failed", { error: task.error });
  }
}

const server = serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve HTML page
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const htmlPath = path.resolve("./src/public/index.html");
      if (fs.existsSync(htmlPath)) {
        let htmlContent = await Bun.file(htmlPath).text();
        htmlContent = htmlContent.replace("const API_URL = '';", `const API_URL = '';\n    const APP_LANG = '${LANGUAGE}';`);
        return new Response(htmlContent, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return new Response("index.html not found", { status: 404 });
    }

    // API: Start download task
    if (url.pathname === "/api/download" && req.method === "POST") {
      try {
        const body = (await req.json()) as { url: string; format: "pdf" | "epub" | "auto" };
        if (!body.url) {
          return new Response(JSON.stringify({ error: "URL or Book ID is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const bookId = extractBookId(body.url);
        const format = body.format || "auto";
        const downloadId = `${bookId}_${Date.now()}`;

        const task: DownloadTask = {
          id: downloadId,
          bookId,
          title: "Loading book details...",
          authors: "",
          status: "pending",
          format: format === "auto" ? "pdf" : format,
          current: 0,
          total: 0,
          message: "Starting download task...",
          timestamp: Date.now(),
        };

        activeDownloads.set(downloadId, task);

        // Execute task asynchronously in the background
        handleDownload(downloadId, bookId, format);

        return new Response(
          JSON.stringify({ success: true, downloadId, bookId }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || "Failed to start download" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // API: Get status of a download task
    if (url.pathname.startsWith("/api/status/")) {
      const downloadId = url.pathname.replace("/api/status/", "");
      const task = activeDownloads.get(downloadId);
      if (!task) {
        return new Response(JSON.stringify({ error: "Download task not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(task), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // API: Get list of active/recent downloads
    if (url.pathname === "/api/downloads" && req.method === "GET") {
      const list = Array.from(activeDownloads.values()).sort(
        (a, b) => b.timestamp - a.timestamp
      );
      return new Response(JSON.stringify(list), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // API: Stream downloaded file
    if (url.pathname.startsWith("/api/download-file/")) {
      const downloadId = url.pathname.replace("/api/download-file/", "");
      const task = activeDownloads.get(downloadId);
      if (!task) {
        return new Response("Download task not found", { status: 404 });
      }

      if (task.status !== "completed" || !task.outputPath || !fs.existsSync(task.outputPath)) {
        return new Response("File not ready or not found", { status: 400 });
      }

      const file = Bun.file(task.outputPath);
      return new Response(file, {
        headers: {
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(task.filename || "book." + task.format)}`,
          "Content-Type": task.format === "pdf" ? "application/pdf" : "application/epub+zip",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (ifaceList) {
      for (const iface of ifaceList) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  }
  return "127.0.0.1";
}

const localIp = getLocalIp();
console.log(`\n\x1b[36m➔ ${t("server_success")}\x1b[0m`);
console.log(`\x1b[35m➔ ${t("local_ip")}:\x1b[0m http://${localIp}:${server.port}`);
console.log(`\x1b[90m➔ ${t("localhost_url")}:  \x1b[0m http://localhost:${server.port}\n`);
