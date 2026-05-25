import fs from "fs";
import path from "path";
import { getCookieHeader } from "../utils/cookie";
import { decipherKey } from "../utils/crypto";
import { logger } from "../utils/logger";
import { GoogleBookManifest, GoogleBookTocEntry } from "../types";

export interface DownloaderOptions {
  cookiesPath: string;
  outputDir: string;
  tempDir: string;
  pace: number;
  verbose?: boolean;
  interactive?: boolean;
  manifest?: GoogleBookManifest;
}

export abstract class BaseDownloader {
  protected bookId: string;
  protected options: DownloaderOptions;
  protected bookTempDir: string;
  protected headers: Record<string, string>;
  protected cachedManifest?: GoogleBookManifest;

  constructor(bookId: string, options: DownloaderOptions) {
    this.bookId = bookId;
    this.options = options;
    this.bookTempDir = path.join(this.options.tempDir, this.bookId);
    
    if (options.manifest) {
      this.cachedManifest = options.manifest;
    }

    // Initialize directories
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
    if (!fs.existsSync(this.options.tempDir)) {
      fs.mkdirSync(this.options.tempDir, { recursive: true });
    }
    if (!fs.existsSync(this.bookTempDir)) {
      fs.mkdirSync(this.bookTempDir, { recursive: true });
    }

    // Load cookies and generate headers
    const cookieHeader = getCookieHeader(this.options.cookiesPath);
    this.headers = {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      referer: "https://play.google.com/books",
      cookie: cookieHeader,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    };
  }

  /**
   * Fetches the book reader HTML.
   */
  async getBookHtml(): Promise<string> {
    const url = `https://play.google.com/books/reader?id=${this.bookId}&hl=en`;
    logger.debug(`Fetching book reader HTML from: ${url}`);
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch book reader HTML: ${res.statusText} (${res.status})`);
    }
    const text = await res.text();
    logger.debug(`Successfully fetched reader HTML (${text.length} characters)`);
    return text;
  }

  /**
   * Fetches the book manifest.
   */
  async getManifest(): Promise<GoogleBookManifest> {
    if (this.cachedManifest) {
      logger.debug("Using cached manifest");
      return this.cachedManifest;
    }
    const url = `https://play.google.com/books/volumes/${this.bookId}/manifest?hl=en&source=ge-web-app`;
    logger.debug(`Fetching book manifest from: ${url}`);
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch book manifest: ${res.statusText} (${res.status})`);
    }
    const json = await res.json() as GoogleBookManifest;
    this.cachedManifest = json;
    logger.debug(`Manifest metadata: title="${json.metadata?.title}", segments=${json.segment?.length || 0}, pages=${json.page?.length || 0}`);
    return json;
  }

  /**
   * Parses the Table of Contents from the HTML.
   */
  getToc(html: string): GoogleBookTocEntry[] {
    const match = html.match(/"toc_entry":\s*(\[[\s\S]*?}\s*])/);
    if (match) {
      try {
        const toc = JSON.parse(match[1]) as GoogleBookTocEntry[];
        logger.debug(`Parsed Table of Contents entries: ${toc.length}`);
        return toc;
      } catch (err) {
        // Fallback to empty array
      }
    }
    return [];
  }

  /**
   * Extracts and deciphers the AES decryption key.
   */
  getKey(html: string): Buffer {
    const match = html.match(/<body[\s\S]*?<[^>]+src\s*=\s*["']data:.*?base64,([^"']+)["']/);
    if (!match) {
      throw new Error("Could not find the base64-encoded decryption key in the HTML page. You might need to update your cookies.");
    }
    logger.debug(`Extracted Base64 Key ciphertext length: ${match[1].length}`);
    const raw = Buffer.from(match[1], "base64").toString("utf-8");
    const key = decipherKey(raw);
    logger.debug(`Deciphered AES Key (Hex): ${key.toString("hex")}`);
    return key;
  }

  /**
   * Log messages.
   */
  log(message: string) {
    logger.info(message);
  }

  /**
   * Log warnings.
   */
  logWarn(message: string) {
    logger.warn(message);
  }

  /**
   * Log errors.
   */
  logError(message: string) {
    logger.error(message);
  }

  /**
   * Main download runner.
   */
  abstract run(): Promise<void>;
}
