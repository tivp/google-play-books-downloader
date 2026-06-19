import { cac } from 'cac';
import fs from 'fs';
import path from 'path';
import { EpubDownloader } from './downloader/epub';
import { PdfDownloader } from './downloader/pdf';
import { GoogleBookManifest } from './types';
import { getCookieHeader } from './utils/cookie';
import { logger } from './utils/logger';
import { preProcessArgs } from './utils/args';
import { t } from './utils/i18n';

interface CliOptions {
  format: 'pdf' | 'epub' | 'auto';
  cookies: string;
  output: string;
  temp: string;
  pace: string;
  verbose: boolean;
  '--'?: string[];
}

/**
 * Automatically detects the format by inspecting the book manifest content.
 */
export async function detectFormat(
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
      // Resolve book-id, including cases where it starts with a hyphen and was parsed under options['--']
      let activeBookId = bookId;
      if (!activeBookId && options['--'] && options['--'].length > 0) {
        activeBookId = options['--'][0];
      }

      // If book-id is omitted, show the help menu
      if (!activeBookId) {
        cli.outputHelp();
        process.exit(0);
      }

      logger.showDebug = options.verbose;

      logger.step(t('cli_title'));
      logger.info(`${t('book_id')}: ${activeBookId}`);

      // Resolve options paths
      const cookiesPath = path.resolve(options.cookies);
      const outputDir = path.resolve(options.output);
      const tempDir = path.resolve(options.temp);
      const paceMs = parseInt(options.pace, 10);

      // Validate inputs
      if (!fs.existsSync(cookiesPath)) {
        logger.error(t('cookies_missing_cli', { path: cookiesPath }));
        process.exit(1);
      }

      if (isNaN(paceMs) || paceMs < 0) {
        logger.error(t('invalid_pace'));
        process.exit(1);
      }

      let chosenFormat: 'pdf' | 'epub' = 'pdf';
      let preFetchedManifest: GoogleBookManifest | undefined;

      try {
        if (options.format === 'auto') {
          logger.info(t('detecting_format_cli'));
          const detected = await detectFormat(activeBookId, cookiesPath);
          chosenFormat = detected.format;
          preFetchedManifest = detected.manifest;
        } else if (options.format === 'pdf' || options.format === 'epub') {
          chosenFormat = options.format;
        } else {
          logger.error(t('invalid_format', { format: options.format }));
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
          const downloader = new PdfDownloader(activeBookId, downloaderOptions);
          await downloader.run();
        } else {
          const downloader = new EpubDownloader(activeBookId, downloaderOptions);
          await downloader.run();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(t('execution_failed', { error: msg }));
        process.exit(1);
      }
    });

  cli.help();
  cli.version('2.0.0');
  cli.parse(preProcessArgs(process.argv));
}

const isCliEntry = process.argv[1] && (
  process.argv[1].endsWith('cli.ts') || 
  process.argv[1].endsWith('index.ts') || 
  process.argv[1].endsWith('cli.js') || 
  process.argv[1].endsWith('index.js')
);
if (isCliEntry) {
  main();
}
