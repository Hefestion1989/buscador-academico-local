# Rastreador de Ideas / Buscador Académico Local

Herramienta privada para buscar palabras, ideas y respuestas respaldadas dentro
de documentos o datos propios. Cada resultado vuelve al fragmento y conserva su
procedencia: archivo, página, párrafo, línea o fila.

El proyecto tiene dos ediciones complementarias:

- **Edición web:** funciona en GitHub Pages sin instalar nada. Importa PDF,
  DOCX, TXT, Markdown, CSV, TSV, JSON, JSONL, RTF y HTML. Los datos se procesan
  y guardan en el navegador.
- **Edición de escritorio:** usa Python, Streamlit, embeddings locales y
  ChromaDB para indexar carpetas completas y mantener un índice incremental.

## Usar la edición web

[Abrir Rastreador de Ideas](https://hefestion1989.github.io/buscador-academico-local/)

La base de ejemplo permite probar una pregunta concreta:

```text
¿Cuándo sacó la APA la homosexualidad del DSM, quién participó y en qué momento?
```

La respuesta muestra la fecha, los actores y el lugar exacto de cada mención.
No genera una afirmación sin enseñar primero la evidencia recuperada.

## Why This Exists

Muchas búsquedas empiezan con una idea incompleta: se recuerda un cambio, una
persona o una relación, pero no la frase exacta. El buscador combina coincidencia
literal, ranking por intención de la pregunta y similitud conceptual multilingüe.

El objetivo no es reemplazar la lectura ni inventar una síntesis, sino acortar el
camino entre una pregunta y el pasaje verificable que puede responderla.

## Features

- Buscar palabras y frases sin descargar un modelo.
- Activar embeddings multilingües locales para buscar ideas y paráfrasis.
- Priorizar fechas, personas y acciones cuando la pregunta las pide.
- Mostrar respuesta extractiva, fragmento completo, fuente y ubicación.
- Importar documentos y datos tabulares o estructurados.
- Crear varias bases, persistirlas en IndexedDB y exportarlas como JSON.
- Indexar carpetas completas con la edición Python.
- Usar opcionalmente un modelo generativo local compatible con OpenAI en
  `localhost`.

## Privacy Model

Por defecto, ninguna edición sube documentos a un servidor.

- En la web, los archivos se leen con APIs del navegador y la base queda en
  IndexedDB.
- Al activar búsqueda por ideas, el navegador descarga los archivos públicos
  del modelo desde Hugging Face; los textos no se envían al proveedor.
- En escritorio, embeddings e índice se generan localmente bajo `data/`.
- La integración generativa opcional solo acepta `localhost`, `127.0.0.1` o
  `::1`.

See [PRIVACY.md](PRIVACY.md) before publishing forks or releases.

## Edición web para desarrollo

```powershell
cd web
npm install
npm test
npm run build
npm run dev
```

El build estático queda en `web/dist/` y GitHub Actions lo publica en Pages.

## Edición de escritorio: requisitos

- Windows 10/11.
- Python 3.10 or newer.
- PowerShell.
- Internet for the initial dependency/model download.

The direct Python dependencies are pinned in `requirements.txt`, so setup uses
the same application versions on every fresh installation.

## Inicio rápido de escritorio

Open PowerShell in this folder and run:

```powershell
.\scripts\setup.ps1
```

Then start the app:

```powershell
.\scripts\run_app.ps1
```

Or double-click:

```text
Abrir Buscador Academico.cmd
```

The app opens at:

```text
http://localhost:8501
```

## Primera prueba de escritorio

To test without personal files, index:

```text
sample_materials
```

Then search for:

```text
community psychology and territory
```

## Indexar materiales

In the app sidebar, paste the local folder you want to index, for example:

```text
C:\Users\TU_USUARIO\Documents\Materiales Facultad
C:\Users\TU_USUARIO\Google Drive\Facultad
D:\Biblioteca
```

Press `Actualizar indice`.

The folder may contain subfolders. The original documents are not modified.

## Uso por PowerShell

Index a folder:

```powershell
.\scripts\index.ps1 -Root "C:\ruta\a\materiales"
```

Force a full reindex:

```powershell
.\scripts\index.ps1 -Root "C:\ruta\a\materiales" -Reindex
```

Search fragments:

```powershell
.\scripts\search.ps1 -Query "intervencion comunitaria" -TopK 8
```

Answer with local sources:

```powershell
.\scripts\answer.ps1 -Query "territorio y demanda" -TopK 8
```

Answer without trying a local LLM:

```powershell
.\scripts\answer.ps1 -Query "construccion de la demanda" -TopK 8 -NoLocalLlm
```

## Sincronizar desde una carpeta local de nube

If Google Drive Desktop, OneDrive or another sync client exposes files locally,
you can copy supported documents into a dedicated folder:

```powershell
.\scripts\sync_drive_docs.ps1 -Source "G:\Mi unidad" -Destination "$env:USERPROFILE\Documents\Materiales Facultad Buscador"
```

You can override the default material folder for helper scripts with:

```powershell
$env:ACADEMIC_SEARCH_ROOT = "D:\Biblioteca academica"
```

## Modelo local opcional

The search engine works without a generative model. If you want more fluent
answers, run a local OpenAI-compatible server, for example LM Studio, at:

```text
http://127.0.0.1:1234/v1/chat/completions
```

The app refuses non-local LLM URLs.

## Qué no se debe subir

Do not commit:

- `data/`
- `logs/`
- `.venv/`
- `dist/`
- personal PDFs, DOCX files or notes

The `.gitignore` is configured defensively to avoid this.

## Limitations

- Scanned image PDFs need OCR before they can be searched.
- Page/paragraph locations are approximate.
- Large PDFs can take time during first indexing.
- `.doc` and spreadsheet files are not indexed yet.
- En la edición web, Excel debe exportarse a CSV o JSON.
- El primer uso de búsqueda conceptual web descarga aproximadamente 135 MB,
  además del runtime WebAssembly incluido en el sitio.
- La capacidad de una base web depende de la memoria y cuota del navegador.
- The default embedding model is lightweight:
  `paraphrase-multilingual-MiniLM-L12-v2`.

## Create a Clean ZIP

```powershell
.\scripts\package_release.ps1
```

The ZIP is created under:

```text
dist\academic-semantic-search.zip
```

## Development Checks

The core tests use Python's standard library and do not download the embedding
model:

```powershell
python -m compileall -q app tests
python -m unittest discover -s tests -v
```

GitHub Actions repeats these checks on Windows, installs the pinned
dependencies and verifies their consistency with `pip check`. A second job
tests, audits and builds the edition under `web/`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete retrieval flow and the
boundary between evidence retrieval and optional generation.

## License

MIT. See [LICENSE](LICENSE).
