# google-play-book-downloader 📚

A command-line script to download and decrypt purchased Google Play Books into PDF or EPUB. Rewritten in TypeScript for Bun, using native web APIs for speed.

## How it works under the hood

1. **Auth**: Uses your browser's exported `cookies.txt` (Netscape format) to authenticate requests.
2. **Decryption Key**: Fetches the book reader HTML, extracts a base64 encoded payload, and deciphers the 16-byte AES key using Google's bit-shuffling logic.
3. **Manifest**: Downloads the book's JSON manifest.
4. **Download & Decrypt**:
   - **PDF Mode**: Downloads high-res encrypted page images, decrypts them via AES-128-CBC, and merges them into a PDF using `pdf-lib`. Automatically detects and handles right-to-left layout (Manga) page order.
   - **EPUB Mode**: Downloads encrypted XHTML chapters, decrypts them (IV + length + cipher blocks), downloads and embeds all inline resources (images) as zipped files within the EPUB structure for offline support, fetches the book cover, and packages them into a valid EPUB zip.

## Setup & Usage

Make sure you have [Bun](https://bun.sh) installed.

```bash
# Clone & install
git clone https://github.com/kuchingneko28/google-play-book-downloader.git
cd google-play-book-downloader
bun install

# Export cookies.txt (e.g. via browser extension) to this folder

# Download directly (defaults to pdf)
bun start [BOOK_ID]

# Or specify parameters
bun start [BOOK_ID] --format [pdf|epub|auto] --verbose
```

_To get the Book ID, grab the `id` value from the URL when reading in your browser: `https://play.google.com/books/reader?id=BOOK_ID`._

## Options

- `-f, --format <format>`: Output format (pdf, epub, or auto) (default: `pdf`)
- `-c, --cookies <path>`: Path to your cookies.txt file (default: `./cookies.txt`)
- `-o, --output <dir>`: Directory to save downloaded books (default: `./downloads`)
- `-t, --temp <dir>`: Directory for caching temporary files (default: `./temp`)
- `-p, --pace <ms>`: Pacing delay in milliseconds between requests (default: `300`)
- `-v, --verbose`: Enable verbose output logging (default: `false`)

## Running Tests

You can run the unit test suite using Bun's built-in test runner:

```bash
bun run test
```

## Project Structure

- `src/index.ts` - Binary shebang entry point.
- `src/cli.ts` - CLI configuration, argument parser, and format detector.
- `src/downloader/` - Main download classes (`base.ts` orchestrator, `pdf.ts` for PDF pages, `epub.ts` for EPUB segments).
- `src/utils/` - Utility scripts (`cookie.ts` for auth parsing, `crypto.ts` for AES decryption, `epub-builder.ts` for zip generation, `logger.ts` for colored icons/progress logs, and `helpers.ts` for general filesystem/pacing functions).
- `tests/` - Unit tests for cookie parser and crypto key generation routines.
