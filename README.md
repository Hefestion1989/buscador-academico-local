# Buscador Academico Local

Buscador Academico Local is a private semantic search tool for study materials.
It indexes a local folder with PDFs, Word documents and notes, then lets you
search concepts and ask questions with references to your own files.

It is meant for students, teachers, researchers and anyone with a messy local
library of academic material.

## Why This Exists

Many academic workflows depend on folders full of PDFs, class notes, exams,
drafts and downloaded readings. Normal file search is useful when you remember
the exact word. This tool is for the other case: when you remember the concept,
author, problem or articulation you want to explore.

The project runs locally. Your documents stay on your computer.

## Features

- Index a local folder recursively.
- Read `.pdf`, `.docx`, `.txt`, `.md` and `.rtf`.
- Create local multilingual semantic embeddings.
- Store a reusable ChromaDB index under `data/`.
- Detect new, changed and removed files.
- Search concepts even when words do not match exactly.
- Answer with local sources: file, relative path and page/paragraph when available.
- Use an optional local OpenAI-compatible model server on `localhost`.
- Work offline after the first setup and model download.

## Privacy Model

By default, the app does not upload your documents anywhere.

- Search embeddings are generated locally.
- The index is stored locally in `data/`.
- The app only reads the folder you choose.
- Optional LLM answers are attempted only against local URLs such as
  `localhost` or `127.0.0.1`.

See [PRIVACY.md](PRIVACY.md) before publishing forks or releases.

## Requirements

- Windows 10/11.
- Python 3.10 or newer.
- PowerShell.
- Internet for the initial dependency/model download.

## Quick Start

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

## First Test

To test without personal files, index:

```text
sample_materials
```

Then search for:

```text
community psychology and territory
```

## Index Your Materials

In the app sidebar, paste the local folder you want to index, for example:

```text
C:\Users\TU_USUARIO\Documents\Materiales Facultad
C:\Users\TU_USUARIO\Google Drive\Facultad
D:\Biblioteca
```

Press `Actualizar indice`.

The folder may contain subfolders. The original documents are not modified.

## PowerShell Usage

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

## Sync From a Local Cloud Folder

If Google Drive Desktop, OneDrive or another sync client exposes files locally,
you can copy supported documents into a dedicated folder:

```powershell
.\scripts\sync_drive_docs.ps1 -Source "G:\Mi unidad" -Destination "$env:USERPROFILE\Documents\Materiales Facultad Buscador"
```

You can override the default material folder for helper scripts with:

```powershell
$env:ACADEMIC_SEARCH_ROOT = "D:\Biblioteca academica"
```

## Optional Local LLM

The search engine works without a generative model. If you want more fluent
answers, run a local OpenAI-compatible server, for example LM Studio, at:

```text
http://127.0.0.1:1234/v1/chat/completions
```

The app refuses non-local LLM URLs.

## What Not To Commit

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

## License

MIT. See [LICENSE](LICENSE).
