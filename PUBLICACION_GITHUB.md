# Publicacion en GitHub

Checklist antes de publicar:

- Verificar que no haya documentos personales dentro del proyecto.
- Verificar que `.venv/`, `data/`, `logs/` y `dist/` no se incluyan.
- Ejecutar una busqueda de privacidad:

```powershell
rg -n "C:\\Users\\|correo@|NombrePropio|TU_NOMBRE" .
```

- Probar instalacion:

```powershell
.\scripts\setup.ps1
```

- Probar indexado de ejemplo:

```powershell
.\scripts\index.ps1 -Root ".\sample_materials" -Reindex
.\scripts\search.ps1 -Query "community psychology territory" -TopK 3
```

- Crear ZIP limpio:

```powershell
.\scripts\package_release.ps1
```

El repositorio debe publicar solo codigo, scripts y documentacion. Los indices,
logs, entornos virtuales y materiales de estudio quedan siempre locales.

## Edición web y GitHub Pages

Validar:

```powershell
cd web
npm install
npm test
npm run build
npm audit --omit=dev
```

El workflow `.github/workflows/pages.yml` publica `web/dist/`. Pages debe estar
configurado con `build_type=workflow`.

URL esperada:

```text
https://hefestion1989.github.io/buscador-academico-local/
```
