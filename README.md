# google-play-books-downloader 📚

Un script de línea de comandos para descargar y desencriptar libros comprados en Google Play Books a formatos PDF o EPUB. Reescripto en TypeScript para Bun, utilizando APIs web nativas para mayor velocidad.

## Cómo funciona bajo el capó

1. **Autenticación (Auth)**: Utiliza el archivo `cookies.txt` (en formato Netscape) exportado desde tu navegador para autenticar las peticiones.
2. **Clave de desencriptación**: Obtiene el HTML del lector de libros, extrae un payload codificado en base64 y descifra la clave AES de 16 bytes mediante la lógica de manipulación de bits (bit-shuffling) de Google.
3. **Manifiesto**: Descarga el manifiesto JSON del libro.
4. **Descarga y Desencriptación**:
   - **Modo PDF**: Descarga las imágenes en alta resolución de las páginas encriptadas, las desencripta a través de AES-128-CBC y las une en un PDF utilizando `pdf-lib`. Detecta y maneja automáticamente el orden de páginas con diseño de derecha a izquierda (RTL, como en el Manga).
   - **Modo EPUB**: Descarga los capítulos XHTML encriptados, los desencripta (vector de inicialización/IV + longitud + bloques de cifrado), descarga e integra todos los recursos en línea (imágenes) como archivos comprimidos dentro de la estructura del EPUB para soporte sin conexión, obtiene la portada del libro y los empaqueta en un archivo zip EPUB válido.

## Instalación de Bun

Para ejecutar este proyecto, necesitas tener instalado [Bun](https://bun.sh). A continuación se detallan las instrucciones de instalación oficial según tu sistema operativo:

### Windows
Para instalar Bun en Windows, abre **PowerShell** y ejecuta el siguiente comando oficial:
```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

### Linux
Para instalar Bun en Linux (y sistemas basados en Unix), abre tu terminal y ejecuta:
```bash
curl -fsSL https://bun.sh/install | bash
```

### macOS
> [!NOTE]
> Este proyecto **aún no ha sido probado en macOS / Mac**. Si lo utilizas en este sistema operativo, ten en cuenta que podrían surgir comportamientos inesperados, aunque en teoría debería funcionar al estar basado en Bun.

## Configuración y Uso

Asegúrate de tener Bun instalado antes de proceder.

```bash
# Clonar el repositorio e instalar dependencias
git clone https://github.com/tivp/google-play-books-downloader.git
cd google-play-books-downloader
bun install

# Exportar el archivo cookies.txt (por ejemplo, mediante una extensión del navegador) a esta carpeta
```

### Modo de línea de comandos (CLI)

```bash
# Descargar directamente (formato predeterminado: pdf)
bun start [BOOK_ID]

# O especificar parámetros detallados
bun start [BOOK_ID] --format [pdf|epub|auto] --verbose
```

_Para obtener el ID del libro (`BOOK_ID`), copia el valor del parámetro `id` de la URL al leer el libro en tu navegador: `https://play.google.com/books/reader?id=BOOK_ID`._

### Versión Web (Interfaz Gráfica)

Este proyecto también incluye una interfaz web interactiva que te permite gestionar y realizar las descargas de forma más visual.

Para iniciar la versión web, ejecuta el siguiente comando:
```bash
bun run server
```
Una vez iniciado el servidor, abre tu navegador web y accede a:
* **Local**: `http://localhost:3000`
* **Red Local**: `http://<TU_IP_LOCAL>:3000` (se mostrará en la terminal al iniciar el servidor)

## Opciones (CLI)

- `-f, --format <format>`: Formato de salida (pdf, epub o auto) (predeterminado: `pdf`)
- `-c, --cookies <path>`: Ruta a tu archivo cookies.txt (predeterminado: `./cookies.txt`)
- `-o, --output <dir>`: Directorio donde guardar los libros descargados (predeterminado: `./downloads`)
- `-t, --temp <dir>`: Directorio para la caché de archivos temporales (predeterminado: `./temp`)
- `-p, --pace <ms>`: Retraso en milisegundos entre peticiones para regular el ritmo (predeterminado: `300`)
- `-v, --verbose`: Habilitar registros de depuración detallados (predeterminado: `false`)

## Ejecutar Pruebas

Puedes ejecutar la suite de pruebas unitarias utilizando el ejecutor de pruebas integrado en Bun:

```bash
bun run test
```

## Estructura del Proyecto

- `src/index.ts` - Punto de entrada binario (con shebang).
- `src/cli.ts` - Configuración de la CLI, parseador de argumentos y detector de formato.
- `src/downloader/` - Clases principales de descarga (orquestador `base.ts`, `pdf.ts` para páginas PDF, `epub.ts` para segmentos EPUB).
- `src/utils/` - Scripts de utilidad (`cookie.ts` para el procesamiento de cookies, `crypto.ts` para la desencriptación AES, `epub-builder.ts` para la generación del archivo zip EPUB, `logger.ts` para iconos de colores y registro de progreso, y `helpers.ts` para funciones generales del sistema de archivos y control de ritmo).
- `tests/` - Pruebas unitarias para el parseador de cookies y las rutinas de generación de claves criptográficas.

## Licencia

Este proyecto está bajo la licencia **GNU GPLv3 (General Public License versión 3)**. Esta licencia prohíbe la comercialización del software de forma cerrada y garantiza que cualquier trabajo derivado siga siendo libre y de código abierto bajo las mismas condiciones.
