import { LANGUAGE } from "./config";

const translations = {
  EN: {
    fetching_details: "Fetching book details...",
    no_scanned_pages: "This book does not contain scanned pages (PDF format is unavailable). Try downloading as EPUB.",
    preview_mode: "The book is in preview mode ('{preview}'). Please refresh or update your cookies in cookies.txt to download the full book.",
    missing_links: "Could not find a download link for {count} pages ({pct}% missing, total: {total}). You might need to update your cookies.",
    book_exists: "Book already exists in downloads: {path}",
    processing_book: "Processing book: {title}",
    authors: "Authors     ",
    published: "Published   ",
    total_pages: "Total Pages ",
    publisher: "Publisher   ",
    rtl_adjust: "Book is marked as right-to-left (RTL). Adjusting page pairs order.",
    downloading_pages: "Downloading {count} pages...",
    saved_page: "Saved page {pid}",
    skipped_page: "Skipped page {pid} (missing link)",
    merging_pages: "Merging {count} pages into PDF...",
    merging_page_file: "Merging page {file}",
    pdf_saved: "PDF saved successfully: {path}",
    toc_saved: "Table of contents saved to: {path}",
    cleanup_temp: "Cleaning up temporary files...",
    
    // EPUB specific
    download_cover: "Downloading book cover image...",
    no_cover: "Could not download book cover: {msg}. EPUB will be built without a cover page.",
    no_segments: "This book does not contain reflowable text segments (EPUB format is unavailable). Try downloading as PDF.",
    missing_segments: "Could not find a download link for {count} text segments ({pct}% missing, total: {total}). You might need to update your cookies.",
    segments: "Segments    ",
    language: "Language    ",
    downloading_segments: "Downloading and decrypting {count} text segments...",
    skipped_segment: "Skipped segment {label} (missing link)",
    saved_segment: "Saved segment {label}{title}",
    assembling_epub: "Assembling EPUB book archive...",
    epub_saved: "EPUB saved successfully: {path}",
    
    // Server specific
    server_success: "Server started successfully",
    local_ip: "Local Network IP",
    localhost_url: "Localhost URL",
    cookies_missing: "cookies.txt not found on server. Please put your cookies.txt in {path}.",
    detecting_format: "Detecting book format and loading metadata...",
    starting_download: "Starting {format} download...",
    download_success: "Download and processing completed successfully!",
    download_failed: "Failed: {error}",
    
    // CLI specific
    cli_title: "Google Play Books Downloader",
    book_id: "Book ID",
    cookies_missing_cli: "Cookies file not found at: {path}\nPlease export cookies.txt from Play Books in your browser and place it here.",
    invalid_pace: "Pacing delay must be a positive number.",
    invalid_format: "Invalid format '{format}'. Supported formats: pdf, epub, auto.",
    execution_failed: "Execution Failed: {error}",
    detecting_format_cli: "Auto-detecting optimal format...",
  },
  ES: {
    fetching_details: "Obteniendo detalles del libro...",
    no_scanned_pages: "Este libro no contiene páginas escaneadas (el formato PDF no está disponible). Intenta descargarlo como EPUB.",
    preview_mode: "El libro está en modo de vista previa ('{preview}'). Por favor, actualiza tus cookies en cookies.txt para descargar el libro completo.",
    missing_links: "No se pudo encontrar un enlace de descarga para {count} páginas ({pct}% faltante, total: {total}). Es posible que debas actualizar tus cookies.",
    book_exists: "El libro ya existe en las descargas: {path}",
    processing_book: "Procesando libro: {title}",
    authors: "Autores     ",
    published: "Publicado   ",
    total_pages: "Páginas Totales",
    publisher: "Editorial   ",
    rtl_adjust: "El libro está marcado como derecha a izquierda (RTL). Ajustando el orden de las páginas.",
    downloading_pages: "Descargando {count} páginas...",
    saved_page: "Página guardada {pid}",
    skipped_page: "Página omitida {pid} (falta enlace)",
    merging_pages: "Uniendo {count} páginas en un archivo PDF...",
    merging_page_file: "Uniendo página {file}",
    pdf_saved: "PDF guardado con éxito: {path}",
    toc_saved: "Índice de contenidos guardado en: {path}",
    cleanup_temp: "Limpiando archivos temporales...",
    
    // EPUB specific
    download_cover: "Descargando la imagen de portada...",
    no_cover: "No se pudo descargar la portada: {msg}. El EPUB se creará sin portada.",
    no_segments: "Este libro no contiene segmentos de texto fluido (el formato EPUB no está disponible). Intenta descargarlo como PDF.",
    missing_segments: "No se pudo encontrar un enlace de descarga para {count} segmentos de texto ({pct}% faltantes, total: {total}). Es posible que debas actualizar tus cookies.",
    segments: "Segmentos   ",
    language: "Idioma      ",
    downloading_segments: "Descargando y desencriptando {count} segmentos de texto...",
    skipped_segment: "Segmento omitido {label} (falta enlace)",
    saved_segment: "Segmento guardado {label}{title}",
    assembling_epub: "Ensamblando el archivo de libro EPUB...",
    epub_saved: "EPUB guardado con éxito: {path}",
    
    // Server specific
    server_success: "Servidor iniciado con éxito",
    local_ip: "IP de Red Local",
    localhost_url: "URL Localhost",
    cookies_missing: "cookies.txt no encontrado en la carpeta del servidor. Por favor, coloca tu cookies.txt en {path}.",
    detecting_format: "Detectando formato del libro y cargando metadatos...",
    starting_download: "Iniciando descarga de {format}...",
    download_success: "¡Descarga y procesamiento completados con éxito!",
    download_failed: "Fallo: {error}",
    
    // CLI specific
    cli_title: "Google Play Books Downloader",
    book_id: "ID del Libro",
    cookies_missing_cli: "Archivo de cookies no encontrado en: {path}\nPor favor, exporta cookies.txt de Play Books en tu navegador y colócalo aquí.",
    invalid_pace: "El retraso de ritmo (pace) debe ser un número positivo.",
    invalid_format: "Formato no válido '{format}'. Formatos admitidos: pdf, epub, auto.",
    execution_failed: "Fallo de ejecución: {error}",
    detecting_format_cli: "Detectando formato óptimo automáticamente...",
  }
};

export function t(key: keyof typeof translations.EN, params: Record<string, string | number> = {}): string {
  const lang = LANGUAGE === 'ES' ? 'ES' : 'EN';
  let str = translations[lang][key] || translations.EN[key] || String(key);
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}
