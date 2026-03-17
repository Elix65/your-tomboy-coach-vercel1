# 21-Moon · Visual System v1

> Documento maestro visual basado en lo que ya está implementado en onboarding (`login.v2.css`), chat principal (`style.v2.css`) e inventario/rewards.

## 1) Idea madre de marca

**21-Moon es un “salón privado premium”**: íntimo, cálido, nocturno, con lujo silencioso.

Traducción visual directa del ADN actual:
- Fondos oscuros con capas suaves (radiales + gradientes), nunca planos.
- Brillos cálidos (cobre/champagne/plum), no neones agresivos.
- Cristal oscuro con blur y bordes finos, no bloques opacos pesados.
- Micro-ornamento editorial (shimmer/pétalos) sutil y lento.

## 2) Principios visuales

1. **Dark first, warm second**: base profunda + acentos cálidos.
2. **Contraste elegante**: legibilidad alta sin blanco puro duro.
3. **Capas con aire**: panel > subpanel > contenido, separadas por transparencia y borde.
4. **Movimiento premium**: easing suave, entradas cortas, nada “snappy app”.
5. **Acción clara, ruido bajo**: un CTA principal por bloque; el resto quiet.

## 3) Paleta principal (nombres + uso)

### Base
- **Obsidian Plum** `#120c12` / **Night Plum** `#1b1118`: fondo raíz y degradado base.
- **Soft Ivory** `#f3eadf`: titulares y texto importante.
- **Muted Ivory** `rgba(230,216,203,0.76)`: texto secundario.

### Superficies
- **Surface Deep** `rgba(19,13,19,0.88)`: paneles principales.
- **Surface Lifted** `rgba(29,19,28,0.74)`: capas secundarias.

### Acentos
- **Copper Veil** `rgba(189,138,113,0.68)`: bordes/hover/focus premium.
- **Rose Mist** `rgba(183,128,121,0.16)`: radial cálido.
- **Plum Mist** `rgba(95,70,98,0.14)`: radial de profundidad.

### Aplicación rápida
- CTA principal: gradientes cobre/cacao del chat y onboarding.
- Estados activos: realce con borde cálido + sombra corta.
- Éxito (rewards unlocked): verde suave solo en estado positivo puntual.

## 4) Colores a evitar

- Azules saturados tipo SaaS y rojos puros de alerta para acciones normales.
- Blanco puro `#fff` sobre paneles grandes (rompe el tono íntimo).
- Negros planos sin textura (`#000` sólido como superficie principal).
- Neones magenta/cyan con glow intenso.

## 5) Reglas de superficies

## Panel principal
- Gradiente oscuro, blur 10–16px, borde cálido de baja opacidad.
- Radio grande (22–28).
- Sombra profunda + posible inset suave.

## Panel secundario
- Más translúcido, borde más tenue, menor elevación.
- Radio 14–18.

## Dropdown
- Mismo lenguaje del panel principal pero más compacto.
- Entrada con `translateY` + `scale` sutil.
- Borde cálido visible y profundidad alta (shadow larga).

## Modal
- Overlay oscuro con blur.
- Card central cálida, borde fino claro, radio ~22.
- Cerrar en botón circular discreto.

## Badge
- Formato píldora (`999px`) para editorial/status.
- Fondo oscuro translúcido + borde fino cálido.
- Texto uppercase pequeño con tracking positivo.

## 6) Radios, bordes, sombras y glow

- **Radios**
  - 28: contenedores mayores de chat.
  - 22–24: modales/cards principales.
  - 16–18: subpaneles y bloques internos.
  - 12–14: inputs/botones/listas.
  - 999: chips, badges, icon buttons circulares.

- **Bordes**
  - Siempre 1px.
  - Opacidad típica: 0.08–0.34 en gama cálida marfil/cobre.

- **Sombras**
  - Externa larga y blanda para elevación (Y 20–34, blur 40–78).
  - Inset opcional muy suave para efecto vidrio premium.

- **Glow**
  - Solo acento puntual (botón activo, reward activo, focus).
  - Intensidad baja-media; evitar halos rojos dramáticos en UI normal.

## 7) Tipografía y jerarquía textual

- Familia base implementada: `Segoe UI` (fallback sans).
- **H1/Hero**: 34–52, peso 760–800.
- **Title de sección/panel**: 20–32, peso 600–700.
- **Body principal**: 14–17.
- **Auxiliar/meta**: 11–13 con opacidad reducida.
- **Eyebrow/editorial**: 11–12, uppercase, `letter-spacing` alto (0.08em–0.18em).

## 8) Botones: primario / secundario / quiet actions

## Primario
- Gradiente cálido oscuro (cobre/cacao/plum).
- Texto marfil claro.
- Hover: `translateY(-1px)` + leve brightness + sombra más rica.

## Secundario
- Mantiene estilo premium, menor protagonismo.
- Puede usar fondo translúcido con borde más visible.

## Quiet actions
- Fondo casi transparente (`~0.02–0.03`) + borde tenue.
- Uso: utilidades topbar, acciones no críticas.

## 9) Inputs y composer

- Input sobre superficie translúcida clara/templada, no gris web estándar.
- Radio 13 aprox, borde cálido tenue.
- Focus: anillo suave (3–4px) en cobre/violeta, con ligera elevación Y.
- Composer del chat vive dentro de subpanel con borde superior y padding generoso.

## 10) Burbujas de chat

- Base bubble: radio 16, sombra corta, borde tenue.
- Usuario: gradiente rosa/cobre, cola implícita por radio inferior derecho reducido.
- Asistente: fondo marfil translúcido muy bajo + línea lateral cálida.
- Animación de entrada de Yumiko: reveal suave, no pop abrupto.

## 11) Badges editoriales

- Usar formato `subtitle-badge`/pill: oscuro translúcido + borde cálido.
- Texto breve, uppercase, tracking amplio.
- Evitar badges de color plano saturado salvo estados funcionales.

## 12) Rewards lateral

- Panel fijo lateral en desktop con mismo lenguaje del chat.
- Lista en subcaja con borde tenue y densidad compacta.
- Gift card con variante:
  - normal: sobria,
  - unlocked: verde suave,
  - CTA activa: pulso cálido cada ~2.8s.

## 13) Inventario / modal

- Dropdown de inventario = “sala privada”: gradiente multicapa, borde cobre, blur.
- Items: tarjetas compactas con thumbnail, metadata cálida y botón pill “usar”.
- Modal/overlay: fondo oscuro + blur y card con borde sutil (misma familia).

## 14) Reglas de motion premium

- Curvas recomendadas ya usadas:
  - `cubic-bezier(0.22, 1, 0.36, 1)` para transiciones principales.
  - ease 160–320ms en microinteracciones.
- Duraciones largas solo para paneles complejos (inventory open/close).
- Usar `prefers-reduced-motion` para desactivar animaciones decorativas.
- Evitar rebotes, elasticidad y movimientos amplios.

## 15) Do / Don’t visual

## Do
- Mantener contraste cálido y atmósfera nocturna.
- Reusar gradientes/bordes/sombras ya presentes.
- Priorizar una acción principal por vista.
- Cuidar spacing y aire entre capas.

## Don’t
- No introducir paletas frías brillantes como base.
- No usar cards blancas/plenas estilo dashboard genérico.
- No saturar de glows/animaciones simultáneas.
- No mezclar radios inconsistentes en un mismo bloque.

## 16) Checklist breve para nuevas pantallas

- [ ] ¿Se siente “salón privado premium” en 3 segundos?
- [ ] ¿Fondo con profundidad (capas), no plano?
- [ ] ¿Superficies oscuras translúcidas con borde cálido sutil?
- [ ] ¿Jerarquía textual clara (hero/título/body/meta)?
- [ ] ¿Solo 1 CTA principal y secundarios quiet?
- [ ] ¿Inputs con foco premium (ring suave + elevación leve)?
- [ ] ¿Motion con easing suave, sin rebotes?
- [ ] ¿Estados especiales (error/success/unlocked) usados con moderación?
- [ ] ¿Coherencia con chat, onboarding e inventario ya existentes?
