# Edición web · Rastreador de Ideas

Aplicación estática para GitHub Pages. Todo el procesamiento ocurre en el
navegador.

## Formatos

- documentos: PDF, DOCX, TXT, Markdown, RTF, HTML y XML;
- OCR opcional y local para páginas PDF escaneadas, con idioma, progreso y
  cancelación;
- datos: CSV, TSV, JSON, JSONL y NDJSON;
- bases portables: exportación e importación
  `rastreador-de-ideas/v1`.

La demostración usa psicología del aprendizaje, pero el buscador no presupone
un área: funciona con el contenido que cada persona incorpora.

## Desarrollo

```powershell
npm install
npm test
npm run build
npm run dev
```

## Privacidad

Los archivos elegidos no se suben a GitHub ni a un backend. IndexedDB guarda la
base en el navegador. La búsqueda conceptual descarga el modelo público
multilingüe y calcula embeddings localmente en un Web Worker.

El OCR descarga Tesseract.js y los datos del idioma solo cuando se acepta
procesar páginas escaneadas. Las imágenes se reconocen localmente.

## Diseño de recuperación

Ver [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
