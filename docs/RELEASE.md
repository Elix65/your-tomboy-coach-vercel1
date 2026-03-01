# Release de Windows con firma Authenticode

Este proyecto firma el instalador de Windows con `electron-builder` usando secretos de GitHub Actions.

## 1) Preparar el certificado (.pfx/.p12)

Debes contar con un certificado de firma de código para Windows exportado como `.pfx` (o `.p12`) con contraseña.

## 2) Convertir el certificado a base64

> El secreto debe contener el contenido base64 del archivo, no una ruta.

### PowerShell (Windows)

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\certificado.pfx"))
```

### macOS / Linux

```bash
base64 -w 0 ./certificado.pfx
```

Si `-w` no está disponible en tu `base64`:

```bash
base64 ./certificado.pfx | tr -d '\n'
```

## 3) Cargar GitHub Secrets

En `Settings > Secrets and variables > Actions` del repositorio, configura una de estas parejas:

- Opción A (preferida):
  - `WIN_CSC_LINK`: base64 del `.pfx/.p12`
  - `WIN_CSC_KEY_PASSWORD`: contraseña del certificado
- Opción B (fallback estándar de electron-builder):
  - `CSC_LINK`: base64 del `.pfx/.p12`
  - `CSC_KEY_PASSWORD`: contraseña del certificado

El workflow detecta automáticamente estas variables. Si no existen, compila y publica sin intentar firmar.

## 4) Verificar firma en Windows

1. Descarga `Yumiko-Overlay-Setup.exe` desde la release.
2. Click derecho sobre el `.exe` → **Propiedades**.
3. Abrir pestaña **Firmas digitales**.
4. Verifica que aparezca tu certificado y estado válido.
