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

## Link de descarga
El botón “Yumiko 100%” usa la constante `DOWNLOAD_URL` en `public/script.v2.js`:
`https://github.com/Elix65/your-tomboy-coach-vercel1/releases/latest/download/Yumiko-Overlay-Setup.exe`

## Windows Defender false positives
- Algunas versiones de Windows Defender pueden marcar el instalador/portable con alertas heurísticas (ej: `Program:Win32/Contebrew.A!ml`) aunque el binario sea legítimo.
- Verificá siempre el SHA256 antes de ejecutar: cada release publica `*.sha256` y `checksums.txt` junto al `.exe` y al `.zip` portable.
- Releases oficiales: https://github.com/Elix65/your-tomboy-coach-vercel1/releases
- Código fuente oficial: https://github.com/Elix65/your-tomboy-coach-vercel1
- Si tu antivirus alerta, compará el hash del archivo descargado con el publicado en el release correspondiente.

