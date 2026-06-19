import fs from "fs";
import path from "path";
import { BaseDownloader, DownloaderOptions } from "./base";
import { decryptSegment, decryptPage } from "../utils/crypto";
import { buildEpub, Chapter, Cover, EpubImage } from "../utils/epub-builder";
import { logger } from "../utils/logger";
import { GoogleBookSegment } from "../types";
import { safeName, delay } from "../utils/helpers";
import { t } from "../utils/i18n";

export class EpubDownloader extends BaseDownloader {
  private epubImages: EpubImage[] = [];

  constructor(bookId: string, options: DownloaderOptions) {
    super(bookId, options);
  }

  /**
   * Processes the XHTML segment to find external resources (like images),
   * downloads them, and stores them in memory.
   */
  async processAndDownloadImages(html: string, segmentLabel: string): Promise<string> {
    let match;
    const urls = new Set<string>();

    // 1. Extract URLs from HTML <img> tags
    const imgRegex = /<img\s+[^>]*?src=["'](https?:\/\/[^"']+)["']/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      urls.add(match[1]);
    }

    // 2. Extract URLs from SVG <image> tags (which use href or xlink:href)
    const svgImageRegex = /<image\s+[^>]*?(?:href|xlink:href)=["'](https?:\/\/[^"']+)["']/gi;
    while ((match = svgImageRegex.exec(html)) !== null) {
      urls.add(match[1]);
    }

    let resultHtml = html;
    let imageCounter = 1;

    for (const url of urls) {
      try {
        logger.debug(`Downloading inline image: ${url}`);

        // Fix XML-escaped ampersands inside URL query parameters (e.g. &amp; -> &)
        const cleanUrl = url.replace(/&amp;/g, "&");
        const response = await fetch(cleanUrl, { headers: this.headers });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "image/jpeg";
        
        // Determine file extension
        let ext = "jpg";
        if (contentType.includes("png")) ext = "png";
        else if (contentType.includes("webp")) ext = "webp";
        else if (contentType.includes("gif")) ext = "gif";
        else if (contentType.includes("svg")) ext = "svg";

        const filename = `images/${segmentLabel}_${imageCounter}.${ext}`;
        imageCounter++;

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Store image data in memory
        this.epubImages.push({
          filename,
          data: buffer,
          mimeType: contentType,
        });

        // Replace absolute URL in HTML with relative image path
        resultHtml = resultHtml.split(url).join(filename);

        logger.debug(`Saved image inside EPUB memory under: ${filename}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logWarn(`Failed to download image ${url}: ${msg}`);
      }
    }

    return resultHtml;
  }

  /**
   * Wraps the segment HTML in a valid XHTML template and ensures it is well-formed.
   */
  toValidXhtml(html: string, label: string, chapterTitle: string): string {
    let bodyContent = html;
    
    // Remove XML declarations and DOCTYPE if present
    bodyContent = bodyContent.replace(/<\?xml[^>]*\?>/gi, "");
    bodyContent = bodyContent.replace(/<!DOCTYPE[^>]*>/gi, "");
    
    // Extract body content if <body> tag exists
    const bodyMatch = bodyContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      bodyContent = bodyMatch[1];
    } else {
      // Clean up other structural HTML tags if they exist at root level
      bodyContent = bodyContent
        .replace(/<html[^>]*>/gi, "")
        .replace(/<\/html>/gi, "")
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/<body[^>]*>/gi, "")
        .replace(/<\/body>/gi, "");
    }

    // Clean up empty closing tags for void elements before making them self-closing
    bodyContent = bodyContent.replace(/<\/(br|hr|img|link|meta)>/gi, "");

    // Convert self-closing HTML tags to XML-compliant self-closing tags
    bodyContent = bodyContent.replace(/<(br|hr|img|link|meta)([^>]*?)(?<!\/)>/gi, "<$1$2 />");

    // Escape title characters for XML safety
    const escapedTitle = chapterTitle
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapedTitle}</title>
    <meta charset="utf-8" />
    <link rel="stylesheet" type="text/css" href="${label}.css" />
  </head>
  <body>
    ${bodyContent.trim()}
  </body>
</html>`;
  }

  /**
   * Downloads the book cover image from Google's content server.
   */
  async downloadCover(): Promise<Cover | undefined> {
    try {
      const coverUrl = `https://books.google.com/books/content?id=${this.bookId}&printsec=frontcover&img=1&zoom=3`;
      logger.info(t("download_cover"));
      const response = await fetch(coverUrl, { headers: this.headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const mimeType = response.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await response.arrayBuffer();
      return {
        data: Buffer.from(arrayBuffer),
        mimeType,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logWarn(t("no_cover", { msg }));
      return undefined;
    }
  }

  /**
   * Downloads page background images for fixed-layout segments and embeds them.
   */
  private async embedFixedLayoutPageImages(
    segmentHtml: string,
    segmentObj: GoogleBookSegment,
    aesKey: Buffer,
    label: string
  ): Promise<string> {
    // In reflowable EPUB layout, we do NOT want to overlay the scanned page images behind the flowing text,
    // as it creates overlapping text/layouts and duplicate cover pages.
    return segmentHtml;
  }

  /**
   * Downloads and decrypts a single segment, processing fixed layout pages and inline images.
   */
  private async downloadAndProcessSegment(
    segment: { label: string; title?: string; link?: string },
    aesKey: Buffer,
    i: number,
    total: number
  ): Promise<Chapter | null> {
    const { label, title: chapterTitle, link } = segment;

    if (!link) {
      if (!logger.showDebug) process.stdout.write("\n");
      logger.info(`[${i + 1}/${total}] ` + t("skipped_segment", { label }));
      return null;
    }

    // Format URL correctly
    const segmentUrl = link.startsWith("http")
      ? link
      : `https://play.google.com${link}`;

    const urlObj = new URL(segmentUrl);
    urlObj.searchParams.set("enc_all", "1");
    urlObj.searchParams.set("hl", "en");

    try {
      logger.debug(`Downloading segment ${label} from: ${urlObj.toString()}`);
      const response = await fetch(urlObj.toString(), {
        headers: this.headers,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const encBuffer = Buffer.from(text, "base64");
      
      let decryptedText = "";
      try {
        decryptedText = decryptSegment(encBuffer, aesKey);
      } catch {
        throw new Error(`Decryption failed (BAD_DECRYPT). This usually indicates your cookies in cookies.txt are invalid or expired.`);
      }

      let segmentObj: GoogleBookSegment;
      try {
        segmentObj = JSON.parse(decryptedText) as GoogleBookSegment;
      } catch {
        throw new Error(`Failed to parse decrypted segment JSON. This usually indicates your cookies in cookies.txt are invalid or expired (Key mismatch).`);
      }
      
      let segmentHtml = segmentObj.content || "";
      const segmentCss = segmentObj.style || "";

      // If this is a fixed-layout page containing a page image definition, download and embed it.
      segmentHtml = await this.embedFixedLayoutPageImages(segmentHtml, segmentObj, aesKey, label);

      logger.debug(`Decrypted segment ${label} (${decryptedText.length} chars). Downloading inline images...`);

      // Download inline images, save them inside the zip, and point xhtml links to local files
      segmentHtml = await this.processAndDownloadImages(segmentHtml, label);

      // Wrap in a valid XHTML structure
      const finalHtml = this.toValidXhtml(segmentHtml, label, chapterTitle || label);

      const displayTitle = chapterTitle && chapterTitle !== "Untitled" ? ` (${chapterTitle})` : "";
      logger.progress(i + 1, total, t("saved_segment", { label, title: displayTitle }));
      this.options.onProgress?.(i + 1, total, t("saved_segment", { label, title: displayTitle }));

      return {
        label,
        title: chapterTitle || label,
        xhtml: finalHtml,
        css: segmentCss,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`\nFailed to download/decrypt segment ${label}: ${msg}`);
      return null;
    }
  }

  /**
   * Core download runner for EPUB.
   */
  async run(): Promise<void> {
    logger.info(t("fetching_details"));
    const html = await this.getBookHtml();
    const aesKey = this.getKey(html);
    const manifest = await this.getManifest();
    const metadata = manifest.metadata;

    if (!manifest.segment || manifest.segment.length === 0) {
      throw new Error(t("no_segments"));
    }

    if (metadata.preview && metadata.preview !== "full") {
      throw new Error(t("preview_mode", { preview: metadata.preview }));
    }

    const missingSegments = manifest.segment.filter((s) => !s.link);
    if (missingSegments.length > 0) {
      const pct = ((missingSegments.length / manifest.segment.length) * 100).toFixed(2);
      const listStr = logger.showDebug
        ? ` List of missing segments: [${missingSegments.map(s => s.label).join(", ")}].`
        : "";
      logger.warn(t("missing_segments", { count: missingSegments.length, pct, total: manifest.segment.length }) + listStr);
    }

    const title = metadata.title || metadata.volume_title || "Untitled";
    const safeTitle = safeName(title);
    const epubFilename = `${safeTitle}.epub`;
    const outputPath = path.join(this.options.outputDir, epubFilename);

    if (fs.existsSync(outputPath)) {
      logger.success(t("book_exists", { path: outputPath }));
      return;
    }

    const authors = metadata.authors || metadata.author || metadata.creator || "Unknown Author";
    const pub_date = metadata.pub_date || metadata.pubDate || metadata.date || metadata.publication_date || new Date().getFullYear().toString();
    const publisher = metadata.publisher || "Unknown Publisher";
    const segments = manifest.segment;
    const language = manifest.language || "en";

    logger.step(t("processing_book", { title }));
    logger.info(`${t("authors")}: ${Array.isArray(authors) ? authors.join(", ") : authors}`);
    logger.info(`${t("published")}: ${pub_date}`);
    logger.info(`${t("segments")}: ${segments.length}`);
    logger.info(`${t("publisher")}: ${publisher}`);
    logger.info(`${t("language")}: ${language}`);

    // Reset images cache
    this.epubImages = [];

    // Try downloading the cover
    const cover = await this.downloadCover();

    logger.step(t("downloading_segments", { count: segments.length }));

    const chapters: Chapter[] = [];

    for (let i = 0; i < segments.length; i++) {
      const chapter = await this.downloadAndProcessSegment(segments[i], aesKey, i, segments.length);
      if (chapter) {
        chapters.push(chapter);
      }

      if (this.options.pace > 0 && i < segments.length - 1) {
        await delay(this.options.pace);
      }
    }
    logger.clearProgress();

    logger.step(t("assembling_epub"));

    const epubMetadata = {
      title,
      authors: Array.isArray(authors)
        ? authors
        : typeof authors === "string"
        ? authors.split(",").map((a: string) => a.trim())
        : ["Unknown Author"],
      publisher: publisher || "Unknown Publisher",
      pubDate: pub_date || new Date().getFullYear().toString(),
      language,
      volumeId: this.bookId,
    };

    await buildEpub(outputPath, epubMetadata, chapters, cover, this.epubImages);

    logger.success(t("epub_saved", { path: outputPath }));

    // Cleanup temporary directory
    try {
      logger.info(t("cleanup_temp"));
      if (fs.existsSync(this.bookTempDir)) {
        fs.rmSync(this.bookTempDir, { recursive: true, force: true });
      }
      if (fs.existsSync(this.options.tempDir) && fs.readdirSync(this.options.tempDir).length === 0) {
        fs.rmSync(this.options.tempDir, { recursive: true, force: true });
      }
    } catch (err) {
      // Ignore cleanup error
    }
  }
}
