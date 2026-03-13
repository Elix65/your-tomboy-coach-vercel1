# HANDOFF


## Update: cleanup final (modelo legacy restaurado)
- El chat opera con modelo legacy y una única fuente de verdad: `public.messages`.
- Se eliminó dependencia de `conversation_id`, `public.conversations` y lógica de conversación default.
- Endpoints vigentes en cliente Electron:
  - `GET /api/get-messages`
  - `POST /api/yumiko`


## Update: Real chat mode (Yumiko Overlay + 21-moon backend)

### Configuración nueva (`settings.json` en `userData`)
Se agregaron estos campos persistidos:
- `chatBaseUrl` (default: `https://21-moon.com`)
- `authToken` (string, por ahora en settings para dev)

> Override por entorno: `YUMIKO_CHAT_URL` pisa `chatBaseUrl` al resolver llamadas de chat.

### Endpoints placeholder implementados
- `GET  ${baseUrl}/api/get-messages`
- `POST ${baseUrl}/api/yumiko` body `{ message, audio_mode, summary, messages[] }`
- Fuente de verdad de historial: `public.messages` (sin `conversation_id`, sin `public.conversations`).

Archivo principal del cliente de API: `electron/chatClient.js`.

### Cómo activar chat real
1. Abrí el `settings.json` del app data de Electron (ruta de `app.getPath('userData')`).
2. Seteá:
   - `authToken`: token válido del backend
   - `chatBaseUrl`: opcional si no querés usar el default
3. (Opcional) Exportá env en runtime:
```bash
export YUMIKO_CHAT_URL="https://21-moon.com"
```
4. Iniciá Electron y verificá logs `[yumiko][chatClient]`.

### Fallback demo
Si falta token, falta baseUrl, o falla la API (timeout/HTTP/error red), el widget entra en modo demo automáticamente:
- historial vacío inicial
- respuesta demo/local al enviar mensaje


## 1) Qué cambié en este último prompt (resumen en 10 bullets)
1. Creé este `HANDOFF.md` en la raíz del repo para dejar contexto operativo inmediato.
2. Documenté el alcance exacto del cambio: **solo documentación**, sin tocar código funcional.
3. Consolidé los comandos reales para correr la app web estática (`/widget`) según README.
4. Consolidé los comandos reales para correr la app Electron en desarrollo.
5. Consolidé el comando de build de escritorio disponible actualmente (`build:win`).
6. Dejé explícito que en la raíz no hay scripts npm definidos para run/build del frontend.
7. Relevé y documenté issues/errores esperables con ejemplos de logs existentes en código.
8. Armé un TODO corto priorizado (P0/P1/P2) para continuidad inmediata.
9. Dejé un estado actual detallado de la ventana de Yumiko (always-on-top, transparencia, click-through, hotkeys, posicionamiento, voz/audio).
10. Registré la lista de archivos tocados en este prompt (únicamente este archivo).

## 2) Lista de archivos tocados con explicación
- `HANDOFF.md` (nuevo): Documento de traspaso operativo con resumen del último cambio, comandos de ejecución/build, issues conocidos, TODO priorizado y estado funcional actual de la ventana de Yumiko.

## 3) Cómo correr la app (comandos exactos) y cómo buildear

### Web estática (`/widget`)
Desde la raíz del repo:
```bash
python3 -m http.server 4173
```
Luego abrir:
```text
http://localhost:4173/widget/
```

### Electron (desarrollo)
```bash
cd electron
npm i
npm run dev
```

### Build desktop (Windows)
```bash
cd electron
npm i
npm run build:win
```

### Nota importante sobre scripts del repo
En la raíz (`package.json`) **no hay `scripts`** de npm para `start/build/dev`; los comandos válidos de ejecución/build están hoy en `electron/package.json`.

## 4) Issues conocidos / errores actuales (logs relevantes)

### 4.1 Chat en modo mock si falta variable de entorno
Si no está definida `YUMIKO_CHAT_URL`, el chat funciona en modo demo (no pega API real).
Log esperado:
```text
[yumiko][chat] Running in MOCK mode (set YUMIKO_CHAT_URL for real API responses).
```

### 4.2 Fallo de request a API de chat (timeout/red/HTTP)
Si falla la llamada o vence timeout, se registra error y el UI muestra fallback.
Logs relevantes:
```text
[yumiko][chat] API request failed: <reason>
```

### 4.3 Fallo de carga del renderer
Ante problemas de carga del HTML del renderer:
```text
[yumiko] did-fail-load { errorCode, errorDescription, validatedURL }
```

### 4.4 Caída del proceso de render
Si el proceso renderer se cae:
```text
[yumiko] render-process-gone { reason: ... }
```

### 4.5 Error enviando mensaje desde widget
Si falla la capa puente/IPC o envío:
```text
[yumiko][widget] sendMessage failed: <error>
```

## 5) TODO inmediato (máx 8 items)
1. **P0** — Definir y documentar `YUMIKO_CHAT_URL` para ambientes de dev/staging/prod y validar respuesta real del chat.
2. **P0** — Probar flujo de recuperación con `panic safe mode` (Ctrl+Alt+Shift+S) en QA y dejar checklist de soporte.
3. **P1** — Agregar script(s) npm en raíz para estandarizar arranque de web/widget y evitar fricción de onboarding.
4. **P1** — Documentar matriz de hotkeys y colisiones potenciales con OS/apps (Windows/macOS).
5. **P1** — Validar persistencia de `bounds` en setups multi-monitor y escalado DPI alto.
6. **P2** — Revisar UX de modo focus/chat para minimizar cambios de foco inesperados al activar/desactivar click-through.
7. **P2** — Definir estrategia de audio/voz (si será TTS/STT local o API) y su roadmap técnico.
8. **P2** — Incorporar troubleshooting breve en README para errores de red/chat y fallback esperado.

## 6) Estado actual de la ventana de Yumiko

### Always-on-top
- Implementado y controlado por `overlayEnabled`.
- Si está activo, la ventana se marca `always on top`; si se desactiva, vuelve a comportamiento normal.

### Transparencia
- **Actualmente desactivada** en la ventana principal Electron (`transparent: false`).
- Se usa `backgroundColor: '#121212'` y frame oculto (`frame: false`).

### Click-through
- Implementado con `setIgnoreMouseEvents(enableClickThrough, { forward: true })`.
- Solo se activa si se cumplen todas estas condiciones:
  - `hasCompletedFirstRun === true`
  - `overlayEnabled === true`
  - `clickThroughEnabled === true`
  - `mode === 'focus'`
- Si no, la ventana vuelve a interactiva (show/focus).

### Hotkeys globales
- Siempre registradas:
  - `Ctrl/Cmd+Shift+Q` → force quit.
  - `Ctrl/Cmd+Alt+Shift+S` → panic safe mode (desactiva overlay + click-through).
- Condicionadas a `shortcutsEnabled`:
  - `Ctrl/Cmd+Shift+Y` → mostrar/ocultar.
  - `Ctrl/Cmd+Shift+M` → alternar focus/chat.

### Posicionamiento y tamaño
- Tamaño default: `560x380`.
- Posición inicial: esquina inferior derecha del monitor principal con margen de 16px.
- `bounds` se persiste en `settings.json` (userData) y se guarda en eventos `move`/`resize`.
- Ventana `resizable` con mínimos `420x320`.

### Visibilidad/comportamiento de cierre
- Si se intenta cerrar y no es quit explícito, la app se oculta al tray (no termina proceso).
- `skipTaskbar: true`, con control por ícono de tray y menú contextual.

### Audio / voz
- No hay pipeline explícito de voz (STT/TTS) en el overlay actual.
- El chat es textual por input + respuesta en UI.
- En este estado, “voz” depende de futuras integraciones (pendiente de roadmap).

### Deep link
- Soporta protocolo `yumiko://`.
- Acción `yumiko://open` muestra ventana y enfoca chat.


## Update: conexión de token + prueba de chat real
### Setear token por deeplink
- Ejecutar: `yumiko://auth?token=TU_TOKEN`
- Efecto: guarda `settings.authToken`, persiste `settings.json` y abre overlay en modo chat sin robar foco (`showInactive`).

- Deeplink soportado: `yumiko://auth?token=...` (guarda `settings.authToken` automáticamente).
- IPC de chat del overlay:
  - `yumiko:chat-history` -> `GET /api/get-messages`
  - `yumiko:chat-send` -> `POST /api/yumiko`
- Persistencia Supabase REST integrada exclusivamente sobre `public.messages`.
- Variables opcionales:
  - `YUMIKO_CHAT_URL` (default `https://21-moon.com`)
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (fallback al `public/supabase.js` del sitio)

### QA rápido
1. Abrir app Electron.
2. Ejecutar deeplink `yumiko://auth?token=TOKEN_VALIDO`.
3. Verificar en logs:
   - `[yumiko][auth] token updated from deeplink`
   - `[yumiko][chatClient] GET history .../api/get-messages`
   - `[yumiko][chatClient] POST send .../api/yumiko`
4. Confirmar filas nuevas en `messages` (sender `user`/`yumiko`) para el `user_id` autenticado.
