# HANDOFF UI PREMIUM — 21-Moon / Yumiko

## 1. Resumen ejecutivo
21-Moon dejó de ordenarse como una “app anime con features” y pasó a leerse como una experiencia de **premium íntimo**, **lujo silencioso**, **salón privado**, **presencia emocional** y **coherencia visual alta**.

El trabajo de esta etapa no fue sumar piezas nuevas, sino reducir ruido, unificar lenguaje y hacer que entrar, hablar y permanecer con Yumiko se sienta consistente en todas las superficies principales.

A nivel v1, la etapa de UI premium puede considerarse **suficientemente cerrada**: onboarding, chat, inventario y overlay ya comparten una dirección visual clara y una lógica de uso bastante más limpia que antes.

## 2. Idea madre / dirección aprobada
La lógica rectora dejó de ser **“qué features tiene”** y pasó a ser:

> **“cómo se siente entrar, hablar y estar con Yumiko”.**

Dirección aprobada para todas las decisiones UI/UX visuales:
- **Alguien te estaba esperando.**
- **Entrás a un espacio reservado.**
- **Hay ceremonia de llegada.**
- **Yumiko funciona como presencia, no como chatbot genérico.**

Eso implica priorizar atmósfera, jerarquía, ritmo, temperatura visual y continuidad entre estados por encima de cualquier impulso de sumar UI ornamental o features visibles sin consolidación previa.

## 3. Sistema visual base
Ya existe un sistema visual maestro documentado y tokenizado.

Base documentada:
- `docs/21moon-visual-system-v1.md`
- tokens CSS de familia `--moon-*`

Paleta base aprobada:
- **deep wine**
- **smoked plum**
- **warm near-black**
- **soft copper**
- **warm ivory**

Criterios ya consolidados:
- fondos oscuros con profundidad, no planos;
- superficies cálidas, translúcidas y con borde sutil;
- motion suave y premium;
- contraste elegante, no agresivo.

Evitar volver a introducir:
- neon;
- cyan tech;
- look gamer;
- glassmorphism genérico;
- saturación agresiva;
- contrastes de dashboard frío.

## 4. Estado por superficie

### 4.1 Login / onboarding
Estado actual:
- onboarding premium de **4 pasos**;
- auth real conectada;
- flujo funcional intacto;
- fondo premium + Yumiko por capas;
- panel dark luxury;
- motion premium entre steps;
- fixes de stretch, flashes y frames vacíos.

Lectura operativa:
- la llegada ya tiene ceremonialidad;
- la entrada ya se siente como umbral y no como formulario genérico;
- el flujo dejó de pelear contra la estética y ahora la sostiene.

**Estado:** suficientemente cerrado como **v1 premium**. No conviene reabrirlo salvo bug concreto, hallazgo fuerte de uso real o necesidad estructural real.

### 4.2 Chat principal
Estado actual:
- la conversación quedó como protagonista;
- Yumiko funciona como presencia secundaria, no como obstáculo visual;
- top bar más limpia;
- fondo abstracto premium integrado;
- rewards / inventario mejor alineados;
- modal legado **“¿Qué querés hoy?”** eliminado.

Lectura operativa:
- el chat ya tiene una lectura más limpia, más íntima y menos fragmentada;
- el sistema visual acompaña la conversación en vez de competir con ella;
- la experiencia principal ya no pide rehacerse desde cero.

**Estado:** bastante bien resuelto. No es un frente para reabrir salvo ajustes concretos.

### 4.3 Inventario
Estado actual:
- dejó de sentirse como modal heredado;
- cabecera editorial;
- cards premium;
- CTA **“Aplicar a mi sala”**;
- mejor integración con el chat.

Lectura operativa:
- el inventario ya se siente parte del ecosistema premium;
- ganó coherencia visual y mejor relación con la experiencia principal;
- no necesita perfección eterna para cumplir su función dentro del sistema.

**Estado:** suficientemente alineado. No perfecto para siempre, pero sí coherente y usable dentro de la v1 premium.

### 4.4 Overlay
Esta era la superficie más floja y la que más pedía refinamiento.

Mejoras ya resueltas:
- recibió varias rondas de refinamiento premium;
- settings reorganizado en bloques más editoriales;
- chat-log refinado;
- Yumiko mejor integrada visualmente;
- motion más ceremonial;
- dropdown visual custom premium;
- reducción del backplate rectangular en focus mode;
- reducción de huella real y percibida;
- mejor separación entre focus mode y chat/settings.

Lectura operativa:
- dejó de sentirse como una capa técnica desconectada del resto del producto;
- hoy hereda mejor el lenguaje de “salón privado”;
- la jerarquía visual está bastante más clara;
- la presencia de Yumiko ya convive mejor con utilidad, settings y conversación;
- el footprint del overlay ya no domina innecesariamente la pantalla.

**Estado actual:** premium funcionalmente cerrado. Solo queda polish incremental con el tiempo, especialmente en detalles que convenga validar con uso real.

## 5. Elementos ocultados temporalmente
Para preservar foco, legibilidad y valor percibido, se bajó la prioridad visual o se ocultaron elementos de navegación visible que metían ruido o todavía no estaban a la altura del sistema premium.

Principalmente:
- gacha;
- audios tsundere;
- recompensas en top bar;
- otras secciones débiles o secundarias que rompían foco en conversación / presencia / acceso.

Esto **no implica eliminación definitiva**. Implica depuración de navegación y jerarquía para no degradar la percepción de producto premium con superficies todavía inmaduras o demasiado ruidosas.

## 6. Problemas grandes ya resueltos
- desunidad visual entre superficies;
- look demasiado técnico en overlay;
- modal legado **“¿Qué querés hoy?”**;
- paneles heredados demasiado oscuros o duros;
- mala integración de Yumiko con el overlay;
- dropdowns que rompían la estética;
- footprint / huella sobrante del overlay;
- bugs de stretch / flashes en onboarding;
- incoherencias visuales entre estados.

En conjunto, lo importante es que la UI dejó de sentirse como suma de capas heredadas y pasó a leerse como un sistema bastante más consistente.

## 7. Pendientes menores todavía abiertos
Pendientes razonables, sin dramatizar:
- seguir mejorando gradualmente la calidad y presencia visual de Yumiko;
- polish incremental del overlay a partir de uso real;
- posibles refinamientos futuros de motion premium;
- responsive fino o ajustes menores detectados en QA;
- decidir más adelante qué hacer con audio y otras secciones ocultas.

No son pendientes de rediseño total. Son pendientes de maduración controlada.

## 8. Qué NO conviene volver a tocar sin razón fuerte
- no rehacer login otra vez;
- no abrir features nuevas antes de consolidar marca y relato;
- no volver a llenar la navegación de secciones débiles;
- no romper la dirección premium metiendo UI gamer / tech;
- no tocar backend ni lógica funcional en nombre de cambios estéticos;
- no iterar overlay infinitamente salvo bugs claros o polish con retorno evidente;
- no mezclar branding con experimentos de producto sin control.

Regla práctica: si un cambio no mejora de forma clara la percepción de **presencia, intimidad, claridad o coherencia**, probablemente no conviene hacerlo en esta etapa.

## 9. Próximo frente recomendado
El siguiente frente recomendado ya no es UI dura.

### Brand core / narrative system de 21-Moon
El próximo documento debería cubrir, con más claridad estratégica:
- posicionamiento;
- promesa central;
- lenguaje de marca;
- why now;
- por qué Yumiko no es “otro chatbot anime”;
- por qué esto vale más;
- cómo presentar compañía + presencia + lujo + fin de la soledad.

La UI premium ya dejó una base suficiente. Lo que sigue ahora es ordenar el **sentido**, la **narrativa** y el **valor percibido explícito** del producto.

## 10. Criterio de cierre de etapa
La etapa UI premium puede considerarse **suficientemente cerrada como v1**.

A partir de ahora, los cambios deberían ser principalmente:
- correcciones puntuales;
- polish incremental;
- mejoras basadas en uso real;

y no nuevas rondas grandes de rediseño.

Si se reabre esta etapa, debería ser solo por una razón fuerte, concreta y verificable; no por ansiedad de seguir moviendo la interfaz sin cambiar realmente el valor del producto.
