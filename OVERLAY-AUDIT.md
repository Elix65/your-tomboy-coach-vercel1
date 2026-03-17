# OVERLAY-AUDIT · 21-Moon

## Objetivo
Auditar el estado visual actual del overlay (sin rediseño todavía) y definir una dirección clara para la próxima fase.

## 1) Problemas visuales actuales
- **Inconsistencia de lenguaje visual**: conviven estilos oscuros cálidos con variantes rojas más agresivas en componentes del overlay/mobile, lo que rompe unidad de marca.
- **Superficies demasiado “planas” o utilitarias**: varias capas del overlay se perciben como bloques funcionales (fondo oscuro + borde simple), sin suficiente profundidad premium.
- **Jerarquía visual débil**: acciones principales y secundarias compiten entre sí; falta una lectura inmediata de “qué hacer primero”.
- **Sensación de UI técnica, no editorial**: estructura correcta, pero con poco refinamiento en ritmo, aire y detalles de acabado.
- **Motion genérico**: transiciones presentes pero sin una firma clara de “movimiento premium íntimo”.

## 2) Qué lo hace sentirse fuera del sistema premium
- **Acentos de color demasiado intensos/fríos en contexto** (sobre todo rojos saturados), alejados de la paleta cobre/champagne/plum.
- **Bordes y fondos de estilo “app estándar”** en vez de cristal oscuro cálido con profundidad controlada.
- **Falta de continuidad con el tono “salón privado”**: el overlay se siente más como capa técnica de navegación que como extensión de experiencia.
- **Escala de radios/sombras irregular** respecto al resto de 21-Moon.
- **Estados interactivos poco curatoriales**: hover/focus/active funcionales, pero no suficientemente elegantes.

## 3) Cómo debería heredar el ADN “premium íntimo / lujo silencioso”
- **Base nocturna con calidez**: oscuridad profunda + acentos cálidos de baja saturación.
- **Capas con aire**: overlay, panel y elementos internos con separación clara por transparencia, blur y borde fino.
- **Editorial sutil**: tipografía y spacing que transmitan calma, no urgencia.
- **Un protagonista por vista**: CTA principal claro; secundarios en modo “quiet action”.
- **Microinteracciones refinadas**: desplazamientos cortos, easing suave, sin rebotes ni dramatismo.
- **Consistencia transversal**: mismo vocabulario visual que onboarding/chat/inventario.

## 4) Prioridades visuales para la próxima fase
1. **Unificar tokens visuales del overlay** (color, radios, bordes, sombras, focus).
2. **Reordenar jerarquía de acciones** (primaria, secundaria, terciaria) para lectura en 3 segundos.
3. **Elevar calidad de superficies** (menos bloque opaco, más profundidad premium controlada).
4. **Alinear motion del overlay con el resto del sistema** (curva y timing premium).
5. **Pulir estados interactivos** (hover/focus/active/disabled) con lenguaje consistente y accesible.

## 5) Qué no conviene hacer
- **No rediseñar todo de golpe**: evitar cambios amplios sin cerrar primero la capa de tokens y jerarquía.
- **No introducir nuevos colores protagonistas** fuera de la familia cálida actual.
- **No aumentar ornamento/animación por ansiedad de “verse premium”**: lujo silencioso = sutileza.
- **No mezclar patrones de UI de dashboard genérico** (cards blancas, contrastes duros, CTAs chillones).
- **No resolver solo con “más blur/más sombra”**: primero consistencia, luego detalle.

## Resultado esperado de esta auditoría
Entrar a la siguiente fase con un **brief visual operativo**: mejorar percepción premium del overlay sin romper continuidad de marca ni sobrediseñar la experiencia.
