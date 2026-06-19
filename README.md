# google-play-books-downloader 📚

Un script de línea de comandos para descargar y desencriptar libros comprados en Google Play Books a formatos PDF o EPUB. Reescripto en TypeScript para Bun, utilizando APIs web nativas para mayor velocidad.

<a href="#%EF%B8%8F-licencia"><img src="https://img.shields.io/github/license/tivp/google-play-books-downloader?label=Licencia&labelColor=0c0d10&style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjRkZGIj48cGF0aCBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMiIgZD0ibTMgNiAzIDFtMCAwLTMgOWE1LjAwMiA1LjAwMiAwIDAgMCA2LjAwMiAwTTYgN2wzIDlNNiA3bDYtMm02IDIgMy0xbS0zIDEtMyA5YTUuMDAyIDUuMDAyIDAgMCAwIDYuMDAxIDBNMTggN2wzIDltLTMtOS02LTJtMC0ydjJtMCAxNlY1bTAgMTZIOW0zIDBoMyIvPjwvc3ZnPg==" alt="licencia"></a>

## ✨ Resumen
Un script moderno en TypeScript para Bun diseñado para descargar tus libros de Google Play Books comprados, desencriptarlos y compilarlos localmente en archivos PDF o EPUB listos para su lectura sin conexión.

> **Nota**: **Origen del proyecto**: Este proyecto es un *fork* desarrollado a partir del código original de [google-play-book-downloader de kuchingneko28](https://github.com/kuchingneko28/google-play-book-downloader) con el fin de mejorarlo, solucionar diversos fallos (bugs), e implementar soporte completo en español y una cómoda interfaz gráfica web interactiva.

### Características
* **Desencriptación rápida**: Utiliza la lógica de bit-shuffling de Google y descifra con claves AES-128 nativas de forma instantánea.
* **Formatos de descarga**: Descarga imágenes de alta resolución para PDFs y capítulos XHTML con recursos integrados para EPUBs.
* **Interfaz Dual**: Ejecución directa en consola (CLI) o a través de una interfaz web gráfica e interactiva.
* **Manga & RTL**: Detecta y procesa automáticamente páginas leídas de derecha a izquierda.
* **Multi-idioma**: Adaptación de interfaz y consola a español e inglés mediante configuración local.

## 🛠️ Cómo funciona bajo el capó

1. **Autenticación (Auth)**: Utiliza el archivo `cookies.txt` (en formato Netscape) exportado desde tu navegador para autenticar las peticiones.

2. **Clave de desencriptación**: Obtiene el HTML del lector de libros, extrae un payload codificado en base64 y descifra la clave AES de 16 bytes mediante la lógica de manipulación de bits (bit-shuffling) de Google.

3. **Manifiesto**: Descarga el manifiesto JSON del libro.

4. **Descarga y Desencriptación**:

    - **Modo PDF**: Descarga las imágenes en alta resolución de las páginas encriptadas, las desencripta a través de AES-128-CBC y las une en un PDF utilizando `pdf-lib`. Detecta y maneja automáticamente el orden de páginas con diseño de derecha a izquierda (RTL, como en el Manga).

    - **Modo EPUB**: Descarga los capítulos XHTML encriptados, los desencripta (vector de inicialización/IV + longitud + bloques de cifrado), descarga e integra todos los recursos en línea (imágenes) como archivos comprimidos dentro de la estructura del EPUB para soporte sin conexión, obtiene la portada del libro y los empaqueta en un archivo zip EPUB válido.

## 🚀 Instalación de Bun

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
> **Nota**: Este proyecto **aún no ha sido probado en macOS / Mac**. Si lo utilizas en este sistema operativo, ten en cuenta que podrían surgir comportamientos inesperados, aunque en teoría debería funcionar al estar basado en Bun.

## ⚙️ Configuración y Uso

Asegúrate de tener Bun instalado antes de proceder.

### 1. Clonar e Instalar
```bash
# Clonar el repositorio e instalar dependencias
git clone https://github.com/tivp/google-play-books-downloader.git
cd google-play-books-downloader
bun install
```

### 2. Obtener el archivo `cookies.txt` (Paso obligatorio)
Para poder descargar tus libros comprados, el script necesita autenticarse en Google Play Books usando tus cookies de sesión. Sigue estos pasos para obtenerlas:

1. Instala la extensión de Chrome llamada [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) (disponible en la Chrome Web Store).
2. Abre tu navegador, ve a [Google Play Books (Mis libros)](https://play.google.com/books) e inicia sesión con tu cuenta de Google.
3. Haz clic en el icono de la extensión **Get cookies.txt LOCALLY** en la barra de extensiones.
4. En el menú que aparece, haz clic en el botón **"Export"** o **"Export As"** para descargar el archivo de cookies.
5. Guarda o renombra el archivo descargado como `cookies.txt`.
6. Mueve el archivo `cookies.txt` dentro de la carpeta raíz de este proyecto (`google-play-books-downloader/`).

> [!WARNING]
> **Seguridad**: El archivo `cookies.txt` contiene tus credenciales de sesión activas de Google. **Nunca compartas ni subas este archivo a GitHub**. Por defecto, ya está añadido al archivo `.gitignore` de este proyecto para evitar exposiciones accidentales.

### 3. Configuración de Idioma (Opcional)
Por defecto, el proyecto se ejecuta en inglés (tanto en la línea de comandos como en la interfaz web). Si deseas cambiar el idioma de la aplicación a español:

1. Crea un archivo llamado `config.txt` en la raíz del proyecto.
2. Agrega la siguiente línea al archivo:

   ```text
   Language=ES
   ```

---

### Modo de línea de comandos (CLI)

```bash
# Descargar directamente (formato predeterminado: pdf)
bun start [BOOK_ID]

# O especificar parámetros detallados
bun start [BOOK_ID] --format [pdf|epub|auto] --verbose
```

_Para obtener el ID del libro (`BOOK_ID`), copia el valor del parámetro `id` de la URL al leer el libro en tu navegador: `https://play.google.com/books/reader?id=BOOK_ID`._

---

### Versión Web (Interfaz Gráfica)

Este proyecto también incluye una interfaz web interactiva que te permite gestionar y realizar las descargas de forma más visual.

Para iniciar la versión web, ejecuta el siguiente comando:
```bash
bun run server
```
Una vez iniciado el servidor, abre tu navegador web y accede a:
* **Local**: `http://localhost:3000`
* **Red Local**: `http://<TU_IP_LOCAL>:3000` (se mostrará en la terminal al iniciar el servidor)

---

## 🔧 Opciones (CLI)

- `-f, --format <format>`: Formato de salida (pdf, epub o auto) (predeterminado: `pdf`)
- `-c, --cookies <path>`: Ruta a tu archivo cookies.txt (predeterminado: `./cookies.txt`)
- `-o, --output <dir>`: Directorio donde guardar los libros descargados (predeterminado: `./downloads`)
- `-t, --temp <dir>`: Directorio para la caché de archivos temporales (predeterminado: `./temp`)
- `-p, --pace <ms>`: Retraso en milisegundos entre peticiones para regular el ritmo (predeterminado: `300`)
- `-v, --verbose`: Habilitar registros de depuración detallados (predeterminado: `false`)

## 🧪 Ejecutar Pruebas

Puedes ejecutar la suite de pruebas unitarias utilizando el ejecutor de pruebas integrado en Bun:

```bash
bun run test
```

## 📂 Estructura del Proyecto

- `src/index.ts` - Punto de entrada binario (con shebang).
- `src/cli.ts` - Configuración de la CLI, parseador de argumentos y detector de formato.
- `src/server.ts` - Servidor web Bun para la interfaz gráfica interactiva.
- `src/public/` - Interfaz frontend de la versión web (`index.html`).
- `src/downloader/` - Clases principales de descarga (orquestador `base.ts`, `pdf.ts` para páginas PDF, `epub.ts` para segmentos EPUB).
- `src/utils/` - Scripts de utilidad (`cookie.ts` para auth, `crypto.ts` para descifrado AES, `epub-builder.ts` para EPUB zip, `logger.ts` para registros con iconos de progreso, `helpers.ts` para el sistema de archivos, `args.ts` para procesar argumentos, `config.ts` para leer el idioma y `i18n.ts` para internacionalización).
- `tests/` - Pruebas unitarias completas (argumentos, configuración, cookies, criptografía y descargas de EPUB).

## ⚖️ Licencia
[![GNU GPLv3 Image](https://www.gnu.org/graphics/gplv3-127x51.png)](https://www.gnu.org/licenses/gpl-3.0.en.html)

google-play-books-downloader es software libre: puedes usarlo, estudiarlo, compartirlo y mejorarlo a voluntad. En particular, puedes redistribuirlo y/o modificarlo bajo los términos de la Licencia Pública General de GNU 3.0 (GNU General Public License) - consulta la licencia [aquí](./LICENSE) para obtener más detalles.
