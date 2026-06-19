import { expect, test, describe } from "bun:test";
import { EpubDownloader } from "../src/downloader/epub";

describe("EpubDownloader XHTML generation", () => {
  const mockOptions = {
    cookiesPath: "dummy.txt",
    outputDir: "dummy-out",
    tempDir: "dummy-temp",
    pace: 0,
  };

  // We can write a subclass of EpubDownloader or just cast it, or instantiate it directly.
  // We mock the constructor properties so we don't try to access nonexistent cookies.txt on construction.
  // Wait, let's create a temporary cookies.txt or mock the file system if needed. But in the constructor:
  // "const cookieHeader = getCookieHeader(this.options.cookiesPath);"
  // That will read the cookies file, which throws an error if it doesn't exist.
  // So let's write a simple temporary file or mock.
  
  test("toValidXhtml wraps raw html fragment in single html root", () => {
    // Write temporary cookies.txt file for constructor
    const fs = require("fs");
    fs.writeFileSync("dummy_cookies.txt", "# Netscape HTTP Cookie File\n.google.com\tTRUE\t/\tTRUE\t2147483647\tSID\tvalue\n");

    const downloader = new EpubDownloader("test-id", {
      ...mockOptions,
      cookiesPath: "dummy_cookies.txt"
    });

    const rawHtml = "<div>Hello World</div><p>Para <br> another tag</p><img src='test.jpg'>";
    const xhtml = downloader.toValidXhtml(rawHtml, "ch1", "Chapter 1");

    expect(xhtml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xhtml).toContain('<html xmlns="http://www.w3.org/1999/xhtml">');
    expect(xhtml).toContain('<title>Chapter 1</title>');
    expect(xhtml).toContain('<link rel="stylesheet" type="text/css" href="ch1.css" />');
    
    // Check closed tags
    expect(xhtml).toContain('<br />');
    expect(xhtml).toContain("<img src='test.jpg' />");
    expect(xhtml).toContain('<div>Hello World</div>');

    fs.unlinkSync("dummy_cookies.txt");
  });

  test("toValidXhtml cleans unclosed empty tag formats like img/img mismatch", () => {
    const fs = require("fs");
    fs.writeFileSync("dummy_cookies.txt", "# Netscape HTTP Cookie File\n.google.com\tTRUE\t/\tTRUE\t2147483647\tSID\tvalue\n");

    const downloader = new EpubDownloader("test-id", {
      ...mockOptions,
      cookiesPath: "dummy_cookies.txt"
    });

    const rawHtml = "<div><img src='cover.jpg'></img></div>";
    const xhtml = downloader.toValidXhtml(rawHtml, "cover", "Cover");

    expect(xhtml).toContain("<img src='cover.jpg' />");
    expect(xhtml).not.toContain("</img>");

    fs.unlinkSync("dummy_cookies.txt");
  });

  test("processAndDownloadImages ignores standard hyperlinks but detects images", async () => {
    const fs = require("fs");
    fs.writeFileSync("dummy_cookies.txt", "# Netscape HTTP Cookie File\n.google.com\tTRUE\t/\tTRUE\t2147483647\tSID\tvalue\n");

    const downloader = new EpubDownloader("test-id", {
      ...mockOptions,
      cookiesPath: "dummy_cookies.txt"
    });

    const originalFetch = global.fetch;
    const requestedUrls: string[] = [];
    global.fetch = async (url: any) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        headers: new Map([["content-type", "image/png"]]),
        arrayBuffer: async () => new ArrayBuffer(8)
      } as any;
    };

    const rawHtml = `
      <div>
        <a href="https://example.com/some-link">Visit Website</a>
        <img src="https://example.com/logo.png" alt="logo" />
        <svg>
          <image xlink:href="https://example.com/vector.svg" width="10" height="10" />
        </svg>
      </div>
    `;

    const result = await downloader.processAndDownloadImages(rawHtml, "ch1");

    expect(requestedUrls).toContain("https://example.com/logo.png");
    expect(requestedUrls).toContain("https://example.com/vector.svg");
    expect(requestedUrls).not.toContain("https://example.com/some-link");

    expect(result).toContain("images/ch1_1.png");
    expect(result).toContain("images/ch1_2.png");
    expect(result).toContain("https://example.com/some-link");

    global.fetch = originalFetch;
    fs.unlinkSync("dummy_cookies.txt");
  });
});
