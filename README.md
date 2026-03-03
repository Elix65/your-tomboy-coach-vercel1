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

## Firma de código opcional para Windows (Authenticode)
1. Generar un certificado de firma en formato `.pfx`/`.p12` (emitido por CA o de pruebas para entorno interno).
2. Convertir el certificado a base64 para GitHub Actions:
   - Linux/macOS: `base64 -w 0 cert.pfx > cert.pfx.base64`
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\cert.pfx")) | Set-Content .\cert.pfx.base64`
3. En GitHub → **Settings → Secrets and variables → Actions**, crear estos secrets del repositorio:
   - `WIN_CSC_LINK`: contenido base64 del `.pfx`/`.p12` (o URL segura al certificado).
   - `WIN_CSC_KEY_PASSWORD`: password del certificado.
4. El workflow de release usa esos secrets solo si existen; si faltan, la build continúa sin firma.



## Overlay chat real (21-moon + Supabase)
1. Configurá token por deeplink (recomendado): `yumiko://auth?token=TU_TOKEN`.
2. Alternativa: editar `settings.json` de Electron (`app.getPath('userData')`) y setear `authToken`.
3. Opcional: setear `YUMIKO_CHAT_URL` (default `https://21-moon.com`).
4. Opcional para Supabase REST: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (si no, usa fallback del sitio).

### Probar flujo real
1. Abrí overlay con token cargado.
2. Entrá al chat: se ejecuta `GET /api/get-messages`.
3. Enviá mensaje: se inserta en Supabase (`messages`), luego `POST /api/yumiko`, y si falta `yumiko_message_id` se inserta respuesta yumiko en Supabase.
4. Si falta token, la UI muestra: `No hay token. Conectá overlay con yumiko://auth?token=... o agregalo en Settings`.

## Pairing PRO: migración `public.overlay_links` en producción
Si en producción aparece el error `Could not find table public.overlay_links`, aplicá la migración nueva:

1. Abrí Supabase Dashboard → **SQL Editor**.
2. Abrí el archivo `supabase/migrations/20260303120000_overlay_links_rls_backfill.sql` de este repo.
3. Copiá y ejecutá todo el SQL en producción.
4. Verificá que exista la tabla con:
   ```sql
   select to_regclass('public.overlay_links');
   ```
5. Verificá RLS/policies con:
   ```sql
   select policyname, cmd
   from pg_policies
   where schemaname = 'public' and tablename = 'overlay_links';
   ```

Opcional (CLI): ejecutar `supabase db push` apuntando al proyecto de producción para aplicar esta migración.

## Vercel: variables de entorno requeridas para overlay exchange
Para que `POST /api/overlay/link/exchange` funcione correctamente en Vercel, configurá **sí o sí**:

- `OVERLAY_JWT_SECRET`
- `SUPABASE_URL` (o `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`

Si no está definida, el endpoint responde `500` con:

```json
{ "error": "Missing OVERLAY_JWT_SECRET" }
{ "error": "Missing SUPABASE_SERVICE_ROLE_KEY" }
```
