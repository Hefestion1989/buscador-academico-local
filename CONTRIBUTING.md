# Contribuir

Las sugerencias, correcciones y pull requests son bienvenidos.

## Antes de enviar un cambio

- Abrí un issue o explicá claramente el problema que resolvés.
- Mantené el cambio acotado y documentá cómo lo verificaste.
- No incluyas claves, datos personales, historiales, archivos de usuarios ni material que no pueda publicarse.
- Respetá el enfoque local, la privacidad y el propósito declarado del proyecto.

Para cambios en la edición web:

```powershell
cd web
npm install
npm test
npm run build
npm audit --omit=dev
```

Para cambios en el motor Python:

```powershell
python -m compileall -q app tests
python -m unittest discover -s tests -v
```

Al enviar una contribución, aceptás que se publique bajo la licencia MIT del repositorio.
