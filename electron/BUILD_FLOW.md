# Yumiko Overlay Electron: flujo de source y build

## Source real
El source activo del overlay es esta carpeta `electron/`.

Archivos clave:
- `main.js`
- `renderer.html`
- `renderer.js`
- `widget.js`
- `widget.css`

## Desarrollo (usa source real)
Desde `electron/`:

```bash
npm run dev
```

Esto lanza Electron directo sobre esta carpeta (`electron .`) y **no** sobre una instalación previa empaquetada.

Verificación rápida en consola:
- En proceso main verás log `[yumiko][bootstrap] source` con `runtimeSource: "electron-source"`.
- En DevTools del renderer verás `SOURCE_WIDGET_JS_RUNNING` (sale de `electron/widget.js`).

## Build / empaquetado

### Build sin instalador (directorio unpacked)
```bash
npm run build
```

### Build final distribuible (instalador + zip)
```bash
npm run dist
```

`dist` usa `electron-builder` y empaqueta los archivos listados en `package.json > build.files`, incluyendo:
- `renderer.html`
- `renderer.js`
- `widget.js`
- `widget.css`

Por lo tanto, si cambias `electron/widget.js` y vuelves a correr `npm run dist`, el nuevo `app.asar` se genera con ese contenido actualizado.

## Evitar ejecutar por accidente una build vieja
Si abrís el ejecutable instalado previamente (por ejemplo en `C:/.../resources/app.asar`), vas a seguir viendo código viejo.

Para evitar confusión:
1. Para desarrollo, siempre ejecutá `npm run dev` desde `electron/`.
2. Para validar build nueva, abrí el ejecutable recién generado en `electron/dist/`.
3. Si hace falta, desinstalá o no uses el acceso directo de la versión vieja instalada.
