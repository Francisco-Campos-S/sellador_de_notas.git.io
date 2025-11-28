# Sellador de PDFs (esquina inferior derecha)

Página estática que permite subir un PDF y aplicar un sello en la esquina inferior derecha. El proceso se realiza completamente en el navegador usando `pdf-lib`.

Uso rápido:

1. Abre `index.html` en tu navegador (doble clic o arrastra al navegador), o despliega el repositorio en GitHub Pages.
2. Selecciona el PDF que quieres sellar.
3. No hace falta configurar nada más: el sello oficial `SELLO.jpeg` incluido en el repositorio se usa automáticamente y el script aplica el sello en la esquina inferior derecha de la última página.
5. Pulsa `Sellar y descargar PDF` — el archivo sellado se descargará localmente.

Notas:
- El procesamiento ocurre en el cliente; no se sube nada a ningún servidor.
- Si el PDF tiene muchas páginas, por defecto el sello se aplica a todas las páginas (puedes cambiar a "Solo última página").

Desplegar en GitHub Pages:

- Coloca el repositorio en GitHub (branch `main`).
- Asegúrate de que `index.html`, `styles.css`, `stamp.js` y `SELLO.jpeg` estén en la raíz del branch `main`.
- En la configuración del repositorio en GitHub, ve a **Pages** y selecciona la rama `main` y la carpeta `/ (root)` como fuente.
- Después de unos minutos, tu sitio estará disponible en `https://<tu-usuario>.github.io/<tu-repo>/`.

Consejos:
- `SELLO.jpeg` se usará como sello por defecto si no subes una imagen desde la interfaz.
- Puedes cambiar la opción para aplicar el sello solo en la última página o en todas las páginas, y ajustar la opacidad.
