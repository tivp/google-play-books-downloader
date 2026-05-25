import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { BaseDownloader, DownloaderOptions } from "./base";
import { decryptPage } from "../utils/crypto";
import { logger } from "../utils/logger";
import { GoogleBookMetadata, GoogleBookPageManifest, GoogleBookTocEntry } from "../types";
import { safeName, unescapeHtml, delay } from "../utils/helpers";

export class PdfDownloader extends BaseDownloader {
  private cachedFiles: Set<string> = new Set();

  constructor(bookId: string, options: DownloaderOptions) {
    super(bookId, options);
  }

  /**
   * Downloads a single encrypted page and decrypts it.
   */
  async downloadAndDecryptPage(
    src: string,
    aesKey: Buffer,
    pid: string,
    order: number,
    totalPages: number
  ): Promise<string> {
    const url = new URL(src);
    const params = url.searchParams;

    // Force highest resolution and standard parameters
    params.set("w", "10000");
    params.set("h", "10000");
    params.set("zoom", "3");
    params.set("enc_all", "1");
    params.set("img", "1");
    url.search = params.toString();

    logger.debug(`Downloading page pid: ${pid}, order: ${order} from URL: ${url.toString()}`);

    // Check if file already exists in cache
    const existingFile = [...this.cachedFiles].find((file) => file.startsWith(pid));
    if (existingFile) {
      logger.debug(`Page ${pid} already exists in cache, skipping download`);
      return path.join(this.bookTempDir, existingFile);
    }

    // Set Accept header to prioritize JPEG/PNG so we don't get WebP (which pdf-lib doesn't support)
    const headers = {
      ...this.headers,
      accept: "image/png,image/jpeg,image/*;q=0.8",
    };

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`Failed to download page: ${response.statusText} (${response.status})`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpeg";
    const filename = `${pid}.${ext}`;
    const filepath = path.join(this.bookTempDir, filename);

    const arrayBuffer = await response.arrayBuffer();
    try {
      const decrypted = decryptPage(Buffer.from(arrayBuffer), aesKey);
      await Bun.write(filepath, decrypted);
    } catch {
      throw new Error(`Decryption failed (BAD_DECRYPT). This usually indicates your cookies in cookies.txt are invalid or expired.`);
    }

    this.cachedFiles.add(filename);

    logger.debug(`Decrypted page ${pid} and saved to: ${filepath}`);

    return filepath;
  }

  /**
   * Merges all downloaded images into a single PDF with metadata.
   */
  async createPdf(imagePaths: string[], metadata: GoogleBookMetadata): Promise<string> {
    const pdfDoc = await PDFDocument.create();

    const title = metadata.title || "Untitled";
    const authorString = Array.isArray(metadata.authors)
      ? metadata.authors.join(", ")
      : metadata.authors || "Unknown Author";

    // Set PDF standard metadata
    pdfDoc.setTitle(title);
    pdfDoc.setAuthor(authorString);
    pdfDoc.setProducer(metadata.publisher || "Unknown Publisher");
    pdfDoc.setSubject("Downloaded from Google Play Books");
    pdfDoc.setKeywords(["Google Play", "eBook", title]);
    pdfDoc.setCreationDate(new Date());

    const total = imagePaths.length;
    logger.step(`Merging ${total} pages into PDF...`);

    for (let i = 0; i < total; i++) {
      const imagePath = imagePaths[i];
      try {
        const bytes = fs.readFileSync(imagePath);
        const isPng = imagePath.endsWith(".png");
        const image = isPng
          ? await pdfDoc.embedPng(bytes)
          : await pdfDoc.embedJpg(bytes);

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });

        logger.progress(i + 1, total, `Merging page ${path.basename(imagePath)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`\nFailed to embed page ${i + 1} (${imagePath}): ${msg}`);
      }
    }
    logger.clearProgress();

    const pdfBytes = await pdfDoc.save();
    const safeTitle = safeName(title);
    const pdfFilename = `${safeTitle}.pdf`;
    const outputPath = path.join(this.options.outputDir, pdfFilename);

    fs.writeFileSync(outputPath, pdfBytes);
    return outputPath;
  }

  /**
   * Reorders pages to adjust for Right-to-Left (RTL) reading layouts.
   */
  private adjustRtlPages(pages: GoogleBookPageManifest[]): GoogleBookPageManifest[] {
    if (pages.length <= 2) return pages;

    const front = pages[0];
    const back = pages[pages.length - 1];
    const middle = pages.slice(1, pages.length - 1);
    const reversedMiddle: GoogleBookPageManifest[] = [];

    for (let i = 0; i < middle.length; i += 2) {
      const chunk = middle.slice(i, i + 2);
      chunk.reverse();
      reversedMiddle.push(...chunk);
    }

    return [front, ...reversedMiddle, back];
  }

  /**
   * Generates and saves a human-readable table of contents text file.
   */
  private saveToc(toc: GoogleBookTocEntry[], title: string): void {
    const formattedToc = toc
      .map((t) => {
        const indent = "  ".repeat(t.depth || 0);
        const label = unescapeHtml(t.label);
        return `${indent}${label}`.padEnd(60, ".") + ` p.${(t.page_index || 0) + 1}`;
      })
      .join("\n");

    const tocPath = path.join(this.options.outputDir, `${safeName(title)}_TOC.txt`);
    fs.writeFileSync(tocPath, formattedToc);
    logger.info(`Table of contents saved to: ${tocPath}`);
  }

  /**
   * Core download runner for PDF.
   */
  async run(): Promise<void> {
    logger.info("Fetching book details...");
    const html = await this.getBookHtml();
    const aesKey = this.getKey(html);
    const manifest = await this.getManifest();
    const metadata = manifest.metadata;
    const toc = this.getToc(html);

    if (!manifest.page || manifest.page.length === 0) {
      throw new Error("This book does not contain scanned pages (PDF format is unavailable). Try downloading as EPUB.");
    }

    if (metadata.preview && metadata.preview !== "full") {
      throw new Error(`The book is in preview mode ('${metadata.preview}'). Please refresh or update your cookies in cookies.txt to download the full book.`);
    }

    const missingPages = manifest.page.filter((p) => !p.src);
    if (missingPages.length > 0) {
      const pct = ((missingPages.length / manifest.page.length) * 100).toFixed(2);
      const listStr = logger.showDebug
        ? ` List of missing pages: [${missingPages.map((p) => p.pid).join(", ")}].`
        : "";
      logger.warn(`Could not find a download link for ${missingPages.length} pages (${pct}% missing, total: ${manifest.page.length}).${listStr} You might need to update your cookies.`);
    }

    // Populate existing cached files
    this.cachedFiles = new Set(fs.readdirSync(this.bookTempDir));

    const title = metadata.title || metadata.volume_title || "Untitled";
    const safeTitle = safeName(title);
    const pdfFilename = `${safeTitle}.pdf`;
    const outputPath = path.join(this.options.outputDir, pdfFilename);

    if (fs.existsSync(outputPath)) {
      logger.success(`Book already exists in downloads: ${outputPath}`);
      return;
    }

    const authors = metadata.authors || metadata.author || metadata.creator || "Unknown Author";
    const pub_date = metadata.pub_date || metadata.pubDate || metadata.date || metadata.publication_date || new Date().getFullYear().toString();
    const publisher = metadata.publisher || "Unknown Publisher";
    const num_pages = metadata.num_pages || manifest.page?.length || 0;
    let pages = manifest.page;

    logger.step(`Processing book: ${title}`);
    logger.info(`Authors     : ${Array.isArray(authors) ? authors.join(", ") : authors}`);
    logger.info(`Published   : ${pub_date}`);
    logger.info(`Total Pages : ${num_pages}`);
    logger.info(`Publisher   : ${publisher}`);

    // Handle RTL pages layout if specified in manifest
    if (manifest.is_right_to_left) {
      logger.warn("Book is marked as right-to-left (RTL). Adjusting page pairs order.");
      pages = this.adjustRtlPages(pages);
    }

    logger.step(`Downloading ${pages.length} pages...`);

    const imagePaths: string[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { pid, src, order } = page;
      if (!src) {
        if (!logger.showDebug) process.stdout.write("\n");
        logger.info(`[${i + 1}/${pages.length}] Skipped page ${pid} (missing link)`);
        continue;
      }

      const imagePath = await this.downloadAndDecryptPage(
        src,
        aesKey,
        pid,
        order,
        pages.length
      );
      imagePaths.push(imagePath);
      
      logger.progress(i + 1, pages.length, `Saved page ${pid}`);

      if (this.options.pace > 0 && i < pages.length - 1) {
        await delay(this.options.pace);
      }
    }
    logger.clearProgress();

    const pdfPath = await this.createPdf(imagePaths, metadata);
    logger.success(`PDF saved successfully: ${pdfPath}`);

    // Save Table of Contents if available
    if (toc && toc.length > 0) {
      this.saveToc(toc, title);
    }

    // Cleanup temporary directory
    try {
      logger.info("Cleaning up temporary files...");
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
