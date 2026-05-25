import fs from "fs";
import archiver from "archiver";

export interface BookMetadata {
  title: string;
  authors: string[];
  publisher: string;
  pubDate: string;
  language: string;
  volumeId: string;
}

export interface Chapter {
  label: string;
  title: string;
  xhtml: string;
  css: string;
}

export interface Cover {
  data: Buffer;
  mimeType: string;
}

export interface EpubImage {
  filename: string; // e.g. "images/img1.png"
  data: Buffer;
  mimeType: string;
}

function escapeXml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Builds a valid EPUB zip file from metadata, chapters, and optional cover image.
 */
export function buildEpub(
  outputPath: string,
  metadata: BookMetadata,
  chapters: Chapter[],
  cover?: Cover,
  images: EpubImage[] = []
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression for contents
    });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    // 1. mimetype (MUST be the first file, stored without compression)
    archive.append("application/epub+zip", { name: "mimetype", store: true });

    // 2. META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    archive.append(containerXml, { name: "META-INF/container.xml" });

    // Prepare variables for manifest and spine
    const coverExt = cover ? (cover.mimeType.split("/")[1] || "jpg") : "jpg";
    const coverImageFilename = `cover.${coverExt}`;

    // 3. OEBPS/cover.xhtml (if cover is provided)
    if (cover) {
      const coverXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Cover</title>
    <style type="text/css">
      body { margin: 0; padding: 0; text-align: center; background-color: #ffffff; }
      img { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    <div>
      <img src="${coverImageFilename}" alt="Cover" />
    </div>
  </body>
</html>`;
      archive.append(coverXhtml, { name: "OEBPS/cover.xhtml" });
      archive.append(cover.data, { name: `OEBPS/${coverImageFilename}` });
    }

    // 4. OEBPS/nav.xhtml (EPUB 3 Table of Contents)
    const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>${escapeXml(metadata.title)}</title>
    <meta charset="utf-8"/>
    <style>
      nav#toc ol { list-style-type: none; margin: 0; padding: 0; }
      nav#toc li { margin-bottom: 0.5em; }
      nav#toc a { text-decoration: none; color: #1a0dab; }
    </style>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
        ${chapters
          .map((ch) => `<li><a href="${ch.label}.xhtml">${escapeXml(ch.title)}</a></li>`)
          .join("\n        ")}
      </ol>
    </nav>
  </body>
</html>`;
    archive.append(navXhtml, { name: "OEBPS/nav.xhtml" });

    // 5. OEBPS/toc.ncx (EPUB 2 TOC fallback)
    const tocNcx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${metadata.volumeId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)}</text>
  </docTitle>
  <navMap>
    ${chapters
      .map(
        (ch, i) => `
    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${escapeXml(ch.title)}</text>
      </navLabel>
      <content src="${ch.label}.xhtml"/>
    </navPoint>`
      )
      .join("")}
  </navMap>
</ncx>`;
    archive.append(tocNcx, { name: "OEBPS/toc.ncx" });

    // 6. OEBPS/content.opf (Book manifest & spine metadata)
    const formattedPubDate = metadata.pubDate.replace(/\./g, "-") || new Date().getFullYear().toString();
    const modifiedDate = new Date().toISOString().split(".")[0] + "Z";

    const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${metadata.volumeId}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    ${metadata.authors
      .map(
        (author, idx) =>
          `<dc:creator id="creator-${idx}">${escapeXml(author)}</dc:creator>`
      )
      .join("\n    ")}
    <dc:publisher>${escapeXml(metadata.publisher)}</dc:publisher>
    <dc:date>${formattedPubDate}</dc:date>
    <dc:language>${metadata.language || "en"}</dc:language>
    <meta property="dcterms:modified">${modifiedDate}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    
    ${
      cover
        ? `<item id="cover-image" href="${coverImageFilename}" media-type="${cover.mimeType}" properties="cover-image"/>
    <item id="cover-xhtml" href="cover.xhtml" media-type="application/xhtml+xml"/>`
        : ""
    }
    
    ${chapters
      .map(
        (ch) => `
    <item id="xhtml-${ch.label}" href="${ch.label}.xhtml" media-type="application/xhtml+xml"/>
    <item id="css-${ch.label}" href="${ch.label}.css" media-type="text/css"/>`
      )
      .join("")}

    ${images
      .map(
        (img, idx) =>
          `<item id="epub-img-${idx}" href="${img.filename}" media-type="${img.mimeType}"/>`
      )
      .join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${cover ? '<itemref idref="cover-xhtml"/>' : ""}
    ${chapters.map((ch) => `<itemref idref="xhtml-${ch.label}"/>`).join("\n    ")}
  </spine>
</package>`;
    archive.append(contentOpf, { name: "OEBPS/content.opf" });

    // 7. Add chapters (XHTML and CSS files)
    for (const ch of chapters) {
      archive.append(ch.xhtml, { name: `OEBPS/${ch.label}.xhtml` });
      archive.append(ch.css, { name: `OEBPS/${ch.label}.css` });
    }

    // 8. Add inline images
    for (const img of images) {
      archive.append(img.data, { name: `OEBPS/${img.filename}` });
    }

    archive.finalize();
  });
}
