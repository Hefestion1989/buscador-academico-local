# Privacidad

Rastreador de Ideas / Buscador Académico Local está diseñado para procesar
materiales en el dispositivo de quien lo usa.

## Edición web

- Solo lee archivos que la persona elige explícitamente.
- Procesa PDF, DOCX, texto y datos estructurados dentro del navegador.
- Guarda bases y embeddings en IndexedDB del mismo navegador.
- No tiene backend, cuentas, analítica ni telemetría.
- La búsqueda por palabras no necesita conexiones externas.
- Al activar búsqueda por ideas, descarga el modelo público
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2` y el runtime necesario. El
  contenido de la base y las consultas no se envían a Hugging Face.
- Exportar una base crea un archivo local sin embeddings.

Los enlaces de fuentes del ejemplo solo se abren cuando la persona decide
seguirlos.

## Edición de escritorio

- Lee únicamente la carpeta elegida.
- Crea un índice local bajo `data/`.
- No sube documentos a servicios de nube.
- No requiere un LLM externo para buscar.
- Si se habilita un servidor local compatible con OpenAI, solo se intentan
  solicitudes a `localhost`, `127.0.0.1` o `::1`.

El repositorio ignora formatos documentales comunes para evitar que materiales
personales se publiquen por accidente.

Before publishing a fork or release, check that these folders are not included:

- `.venv/`
- `data/`
- `logs/`
- `dist/`
- any folder containing personal documents
