import fs from "fs";
import path from "path";
import { BaseDownloader, DownloaderOptions } from "./base";
import { decryptSegment, decryptPage } from "../utils/crypto";
import { buildEpub, Chapter, Cover, EpubImage } from "../utils/epub-builder";
import { logger } from "../utils/logger";
import { GoogleBookSegment } from "../types";
import { safeName, delay } from "../utils/helpers";

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
    const urlRegex = /(?:src|href|xlink:href)=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    const urls = new Set<string>();

    while ((match = urlRegex.exec(html)) !== null) {
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
   * Ensures the XHTML has a link to its stylesheet.
   */
  linkStylesheet(xhtml: string, label: string): string {
    const linkTag = `<link rel="stylesheet" type="text/css" href="${label}.css" />`;
    if (xhtml.includes("</head>")) {
      return xhtml.replace("</head>", `${linkTag}\n</head>`);
    } else if (xhtml.includes("<head>")) {
      return xhtml.replace("<head>", `<head>\n${linkTag}`);
    } else {
      const htmlMatch = xhtml.match(/<html[^>]*>/i);
      if (htmlMatch) {
        return xhtml.replace(htmlMatch[0], `${htmlMatch[0]}\n<head>${linkTag}</head>`);
      }
      return `<head>${linkTag}</head>\n${xhtml}`;
    }
  }

  /**
   * Downloads the book cover image from Google's content server.
   */
  async downloadCover(): Promise<Cover | undefined> {
    try {
      const coverUrl = `https://books.google.com/books/content?id=${this.bookId}&printsec=frontcover&img=1&zoom=3`;
      logger.info("Downloading book cover image...");
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
      this.logWarn(`Could not download book cover: ${msg}. EPUB will be built without a cover page.`);
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
    let resultHtml = segmentHtml;
    if (!segmentObj.page || segmentObj.page.length === 0) {
      return resultHtml;
    }

    for (const p of segmentObj.page) {
      if (p.src) {
        try {
          logger.debug(`Downloading segment page image: ${p.pid}`);
          const pageUrl = new URL(p.src);
          pageUrl.searchParams.set("w", "10000");
          pageUrl.searchParams.set("h", "10000");
          pageUrl.searchParams.set("zoom", "3");
          pageUrl.searchParams.set("enc_all", "1");
          pageUrl.searchParams.set("img", "1");

          const response = await fetch(pageUrl.toString(), { headers: this.headers });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const contentType = response.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpeg";
          const filename = `images/${p.pid}.${ext}`;

          const arrayBuffer = await response.arrayBuffer();
          const decryptedImage = decryptPage(Buffer.from(arrayBuffer), aesKey);

          this.epubImages.push({
            filename,
            data: decryptedImage,
            mimeType: contentType,
          });

          // Embed the image inside the segment container div
          const imgTag = `<img src="${filename}" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: -1;" />`;
          const matchSegment = resultHtml.match(/<div[^>]*class="[^"]*gb-segment[^"]*"[^>]*>/i);
          if (matchSegment) {
            const insertIndex = resultHtml.indexOf(matchSegment[0]) + matchSegment[0].length;
            resultHtml = resultHtml.slice(0, insertIndex) + "\n" + imgTag + resultHtml.slice(insertIndex);
          } else {
            resultHtml = imgTag + "\n" + resultHtml;
          }
        } catch (imgErr) {
          const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
          logger.warn(`Failed to download page image ${p.pid} for segment ${label}: ${msg}`);
        }
      }
    }
    return resultHtml;
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
      logger.info(`[${i + 1}/${total}] Skipped segment ${label} (missing link)`);
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

      // Inject the link to stylesheet in the xhtml head
      const finalHtml = this.linkStylesheet(segmentHtml, label);

      const displayTitle = chapterTitle && chapterTitle !== "Untitled" ? ` (${chapterTitle})` : "";
      logger.progress(i + 1, total, `Saved segment ${label}${displayTitle}`);

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
    logger.info("Fetching book details...");
    const html = await this.getBookHtml();
    const aesKey = this.getKey(html);
    const manifest = await this.getManifest();
    const metadata = manifest.metadata;

    if (!manifest.segment || manifest.segment.length === 0) {
      throw new Error("This book does not contain reflowable text segments (EPUB format is unavailable). Try downloading as PDF.");
    }

    if (metadata.preview && metadata.preview !== "full") {
      throw new Error(`The book is in preview mode ('${metadata.preview}'). Please refresh or update your cookies in cookies.txt to download the full book.`);
    }

    const missingSegments = manifest.segment.filter((s) => !s.link);
    if (missingSegments.length > 0) {
      const pct = ((missingSegments.length / manifest.segment.length) * 100).toFixed(2);
      const listStr = logger.showDebug
        ? ` List of missing segments: [${missingSegments.map(s => s.label).join(", ")}].`
        : "";
      logger.warn(`Could not find a download link for ${missingSegments.length} text segments (${pct}% missing, total: ${manifest.segment.length}).${listStr} You might need to update your cookies.`);
    }

    const title = metadata.title || metadata.volume_title || "Untitled";
    const safeTitle = safeName(title);
    const epubFilename = `${safeTitle}.epub`;
    const outputPath = path.join(this.options.outputDir, epubFilename);

    if (fs.existsSync(outputPath)) {
      logger.success(`Book already exists in downloads: ${outputPath}`);
      return;
    }

    const authors = metadata.authors || metadata.author || metadata.creator || "Unknown Author";
    const pub_date = metadata.pub_date || metadata.pubDate || metadata.date || metadata.publication_date || new Date().getFullYear().toString();
    const publisher = metadata.publisher || "Unknown Publisher";
    const segments = manifest.segment;
    const language = manifest.language || "en";

    logger.step(`Processing book: ${title}`);
    logger.info(`Authors     : ${Array.isArray(authors) ? authors.join(", ") : authors}`);
    logger.info(`Published   : ${pub_date}`);
    logger.info(`Segments    : ${segments.length}`);
    logger.info(`Publisher   : ${publisher}`);
    logger.info(`Language    : ${language}`);

    // Reset images cache
    this.epubImages = [];

    // Try downloading the cover
    const cover = await this.downloadCover();

    logger.step(`Downloading and decrypting ${segments.length} text segments...`);

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

    logger.step("Assembling EPUB book archive...");

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

    logger.success(`EPUB saved successfully: ${outputPath}`);

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
