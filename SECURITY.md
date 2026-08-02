# Política de seguridad

Si encontrás una vulnerabilidad, no publiques detalles explotables en un issue abierto.

Usá la opción de reporte privado de vulnerabilidades de GitHub para este repositorio. Si no está disponible, contactá al mantenedor de forma privada desde su perfil de GitHub e incluí una descripción breve, el impacto y pasos para reproducirla.

No se ofrecen garantías de tiempos de respuesta, pero los reportes serán revisados de buena fe.

## Frontera local y excepción temporal de Chroma

La edición de escritorio debe mantenerse enlazada a `127.0.0.1`. El almacén
vectorial usa `chromadb.PersistentClient` dentro del mismo proceso: no se debe
iniciar `chroma run`, publicar el puerto de Chroma ni sustituirlo por un cliente
HTTP sin una revisión de seguridad.

`chromadb 1.5.9` está alcanzado por
[GHSA-f4j7-r4q5-qw2c](https://github.com/advisories/GHSA-f4j7-r4q5-qw2c),
que afecta a su API de servidor. Al 2 de agosto de 2026 no existe una versión
corregida publicada. La mitigación de este proyecto consiste en no ejecutar esa
API y conservar el uso embebido; el pin debe revisarse en cuanto se publique un
parche.
