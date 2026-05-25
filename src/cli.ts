import { cac } from 'cac';
import fs from 'fs';
import path from 'path';
import { EpubDownloader } from './downloader/epub';
import { PdfDownloader } from './downloader/pdf';
import { GoogleBookManifest } from './types';
import { getCookieHeader } from './utils/cookie';
import { logger } from './utils/logger';

interface CliOptions {
  format: 'pdf' | 'epub' | 'auto';
  cookies: string;
  output: string;
  temp: string;
  pace: string;
  verbose: boolean;
}

/**
 * Automatically detects the format by inspecting the book manifest content.
 */
async function detectFormat(
  bookId: string,
  cookiesPath: string
): Promise<{ format: 'pdf' | 'epub'; manifest: GoogleBookManifest }> {
  const cookieHeader = getCookieHeader(cookiesPath);
  const headers = {
    cookie: cookieHeader,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  };
  const url = `https://play.google.com/books/volumes/${bookId}/manifest?hl=en&source=ge-web-app`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch book manifest: ${res.statusText} (${res.status})`);
  }

  const manifest = (await res.json()) as GoogleBookManifest;
  if (manifest.segment && manifest.segment.length > 0) {
    return { format: 'epub', manifest };
  }
  if (manifest.page && manifest.page.length > 0) {
    return { format: 'pdf', manifest };
  }
  throw new Error('No readable segments or pages found in book manifest.');
}

async function main() {
  const cli = cac('playbook');

  cli
    .command('[book-id]', 'Download Google Play Book by ID')
    .option('-f, --format <format>', 'Output format (pdf, epub, or auto)', { default: 'pdf' })
    .option('-c, --cookies <path>', 'Path to your cookies.txt file', { default: './cookies.txt' })
    .option('-o, --output <dir>', 'Directory to save downloaded books', { default: './downloads' })
    .option('-t, --temp <dir>', 'Directory for caching temporary files', { default: './temp' })
    .option('-p, --pace <ms>', 'Pacing delay in milliseconds between requests', { default: '300' })
    .option('-v, --verbose', 'Enable verbose output logging', { default: false })
    .action(async (bookId: string | undefined, options: CliOptions) => {
      // If book-id is omitted, show the help menu
      if (!bookId) {
        cli.outputHelp();
        process.exit(0);
      }

      logger.showDebug = options.verbose;

      logger.step('Google Play Book Downloader');
      logger.info(`Book ID: ${bookId}`);

      // Resolve options paths
      const cookiesPath = path.resolve(options.cookies);
      const outputDir = path.resolve(options.output);
      const tempDir = path.resolve(options.temp);
      const paceMs = parseInt(options.pace, 10);

      // Validate inputs
      if (!fs.existsSync(cookiesPath)) {
        logger.error(
          `Cookies file not found at: ${cookiesPath}\nPlease export cookies.txt from Play Books in your browser and place it here.`
        );
        process.exit(1);
      }

      if (isNaN(paceMs) || paceMs < 0) {
        logger.error('Pacing delay must be a positive number.');
        process.exit(1);
      }

      let chosenFormat: 'pdf' | 'epub' = 'pdf';
      let preFetchedManifest: GoogleBookManifest | undefined;

      try {
        if (options.format === 'auto') {
          logger.info('Auto-detecting optimal format...');
          const detected = await detectFormat(bookId, cookiesPath);
          chosenFormat = detected.format;
          preFetchedManifest = detected.manifest;
        } else if (options.format === 'pdf' || options.format === 'epub') {
          chosenFormat = options.format;
        } else {
          logger.error(`Invalid format '${options.format}'. Supported formats: pdf, epub, auto.`);
          process.exit(1);
        }

        const downloaderOptions = {
          cookiesPath,
          outputDir,
          tempDir,
          pace: paceMs,
          verbose: options.verbose,
          interactive: false,
          manifest: preFetchedManifest,
        };

        if (chosenFormat === 'pdf') {
          const downloader = new PdfDownloader(bookId, downloaderOptions);
          await downloader.run();
        } else {
          const downloader = new EpubDownloader(bookId, downloaderOptions);
          await downloader.run();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Execution Failed: ${msg}`);
        process.exit(1);
      }
    });

  cli.help();
  cli.version('2.0.0');
  cli.parse();
}

main();
