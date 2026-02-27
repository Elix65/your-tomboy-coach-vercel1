# Yumiko 100% (web + overlay de escritorio)

## Probar `/widget`
1. Desde la raíz: `python3 -m http.server 4173`
2. Abrir: `http://localhost:4173/widget/`

## Ejecutar Electron en desarrollo
1. `cd electron`
2. `npm i`
3. `npm run dev`

## Publicar release Windows
1. Crear tag semántico: `git tag vX.Y.Z`
2. Push del tag: `git push origin vX.Y.Z`
3. El workflow `release-windows.yml` compila y publica el instalador en GitHub Releases.

También podés correr la release manualmente con `workflow_dispatch`.

## Configurar link de descarga (`<OWNER>/<REPO>`)
Editar estas constantes en `public/script.v2.js`:
- `YUMIKO_RELEASE_OWNER`
- `YUMIKO_RELEASE_REPO`

El botón “Yumiko 100%” usa:
`https://github.com/<OWNER>/<REPO>/releases/latest/download/Yumiko-Overlay-Setup.exe`
