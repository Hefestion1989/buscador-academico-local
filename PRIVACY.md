# Privacy

Buscador Academico Local is designed to run on your own computer.

- It reads only the folder that you choose.
- It creates a local search index under `data/`.
- It does not upload your documents to a cloud service.
- It does not require an external LLM to search.
- If you enable or run a local OpenAI-compatible server, only local requests to `localhost` are attempted.

The repository intentionally ignores common document formats such as PDF, DOCX
and RTF so personal study materials are not committed by accident.

Before publishing a fork or release, check that these folders are not included:

- `.venv/`
- `data/`
- `logs/`
- `dist/`
- any folder containing personal documents

