# Arquitectura y criterio de respuesta

## Qué problema resuelve

El sistema parte de una pregunta normal y debe devolver dos cosas inseparables:

1. el pasaje que mejor responde;
2. la ubicación y fuente donde ese pasaje aparece.

La respuesta no se considera completa si solo enumera un documento o si formula
una conclusión sin mostrar evidencia.

## Flujo de la edición web

```text
PDF / DOCX / texto / CSV / JSON
        ↓
extracción con página, fila o línea
        ↓
fragmentos de hasta ~1.050 caracteres
        ↓
índice literal inmediato
        +
embeddings multilingües opcionales
        ↓
ranking híbrido
        ↓
pasajes priorizados por fecha, persona y acción
        ↓
respuesta extractiva + fuente + ubicación
```

### Ingesta

- PDF: PDF.js, una secuencia por página.
- DOCX: Mammoth, texto del documento.
- CSV/TSV: Papa Parse, un registro por fila.
- JSON/JSONL: objetos aplanados, un registro por elemento.
- TXT/MD/RTF/HTML/XML: bloques de texto con ubicación aproximada.

Cada fragmento conserva `sourceName`, `sourceType`, `sourceId`, `location`,
metadatos y un enlace opcional.

### Búsqueda literal

Normaliza mayúsculas y tildes, elimina palabras funcionales, aplica un stemming
ligero y combina cobertura de términos, densidad y frase exacta. Funciona apenas
se carga el archivo.

### Búsqueda por ideas

Transformers.js ejecuta
`Xenova/paraphrase-multilingual-MiniLM-L12-v2` en un Web Worker. El modelo se
descarga desde Hugging Face y queda en la caché del navegador. Los embeddings se
calculan localmente y se persisten junto con la base en IndexedDB.

La búsqueda híbrida combina puntaje literal y similitud coseno. La edición web
continúa funcionando por palabras si el modelo no está disponible.

### Respuesta respaldada

El sistema no genera prosa nueva. Extrae hasta tres pasajes:

- si la consulta pide “cuándo”, prioriza una fecha completa;
- si pide “quién”, prioriza el pasaje con actores nombrados;
- completa con el resultado de mayor relevancia y evita duplicados.

Después muestra todos los resultados, el fragmento completo y su procedencia.

## Flujo de la edición de escritorio

La aplicación Python recorre una carpeta, extrae texto, crea fragmentos y
embeddings con Sentence Transformers y los guarda en ChromaDB. El índice es
incremental: detecta archivos nuevos, modificados o eliminados.

La recuperación combina distancia semántica, términos, título y diversidad por
archivo. La respuesta por defecto es extractiva. Si existe un servidor local
compatible con OpenAI, puede producir una síntesis más fluida usando únicamente
los fragmentos recuperados.

## Límites honestos

- Una coincidencia no prueba que la fuente sea verdadera o suficiente.
- Los PDF escaneados requieren OCR.
- Página, párrafo o línea pueden ser aproximados según el formato.
- Un modelo de embeddings recupera cercanía conceptual; no razona ni verifica
  hechos por sí solo.
- La edición web no puede recorrer una carpeta del equipo sin que el usuario
  elija sus archivos.
