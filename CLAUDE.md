# CLAUDE.md — Proyecto web TAIS Jewelry Bar

Instrucciones para Claude al trabajar en este proyecto. Leer completo antes de editar cualquier archivo.

## Qué es este proyecto

Sitio web e-commerce de **TAIS Jewelry Bar**, marca de joyería con significado (joyas, charms, bolsos, llaveros y peluches con el símbolo de la esfera mágica). La estructura de la página se basa en la arquitectura de joyeriaoronegro.com (Shopify de joyería): announcement bar → nav por colecciones → hero → colecciones → grid de productos con precio → sección de símbolo/historia → FAQ → bienvenida → newsletter → footer con políticas. Se construyó con el skill `missyera-web-builder` como landing B2B de cliente (Tipo F): misma arquitectura de conversión, piel 100% TAIS.

## Archivos

| Archivo | Qué es |
|---|---|
| `tais-jewelry-bar.html` | Home/landing completa (HTML estático standalone, Tailwind por CDN, un solo archivo) |
| `brand-config.tais.json` | Variables de marca. Los campos vacíos están PENDIENTES de confirmar |
| `index.html` | Copia de `tais-jewelry-bar.html` servida como entrypoint de hosting estático. Hoy es idéntica al template (sigue con los `{{PLACEHOLDERS}}` sin llenar); debe regenerarse con `build_page.py` en cuanto haya datos confirmados |
| `Staticfile` | Archivo vacío que le indica al build system (Railpack/Railway u otro buildpack estilo Heroku) que este repo es un sitio estático, no una app con backend |
| `CLAUDE.md` | Este archivo |

## Brandbook TAIS (fuente: brandbook oficial en imágenes)

- **Nombre**: TAIS Jewelry Bar. **Lema**: "Tu magia vive aquí."
- **Símbolo**: la esfera mágica. Representa el universo interior de cada mujer: sus sueños, su intuición y la magia de atraer aquello que está destinada a vivir. Debe aparecer en toda pieza de comunicación.
- **Valores**: Intuición · Magia · Sueños · Energía.
- **Paleta**: lila `#C8B4EB` (primario), crema `#F4EEE6` (fondos suaves), dorado `#D4AF37` (acento/CTAs). El violeta profundo `#4A3A6A` (títulos/footer) es PROPUESTO por nosotros, no está en el brandbook: confirmar con la marca.
- **Tipografía**: Cinzel (principal, títulos) + Montserrat (secundaria, cuerpo). Cargadas por Google Fonts.
- **Líneas de producto**: Joyas TAIS, Charm Esfera, Bolso TAIS, Llavero TAIS, Peluche Esfera Mágica, Packaging de regalo.
- **Voz**: femenina, cálida, mágica pero elegante; español de Perú; sin em dashes.

## Reglas de trabajo (no negociables)

1. **Nunca inventes datos de marca.** WhatsApp, email, dirección, redes, precios, costos de envío, plazos, materiales y métodos de pago viven como `{{VARIABLES}}` en el HTML y se llenan solo vía `brand-config.tais.json` con datos confirmados por la marca. Si un dato no está confirmado, se queda como placeholder y se reporta como pendiente.
2. **Aplica variables con el script del skill**, no a mano:
   ```bash
   python /mnt/skills/user/missyera-web-builder/scripts/build_page.py tais-jewelry-bar.html brand-config.tais.json index.html
   ```
3. **Valida siempre antes de entregar**:
   ```bash
   python /mnt/skills/user/missyera-web-builder/scripts/validate_page.py index.html --dominio [dominio de TAIS]
   ```
   Corrige todo FAIL; justifica los WARN que queden.
4. **FAQ visible = FAQ del JSON-LD FAQPage**, palabra por palabra. Si editas una, edita la otra. Los bloques JSON-LD van como `@type` top-level (Organization y FAQPage separados), no dentro de `@graph`, porque el validador no lee `@graph`.
5. **Seguridad**: solo `https://`, `rel="noopener noreferrer"` en todo `target="_blank"`, cero API keys en el HTML, honeypot en formularios (campo `website` oculto que el backend descarta), scripts solo de CDNs confiables (cdn.tailwindcss.com, fonts.googleapis.com). No agregar GTM/pixel sin autorización de TAIS (dejar el comentario `<!-- GTM / PIXEL DEL CLIENTE AQUÍ -->`).
6. **UTMs en todo link saliente**: `utm_source=tais&utm_medium=cta|cta_mid|footer&utm_campaign=[slug]`. Los wa.me llevan texto pre-llenado que nombra el producto o la página de origen.
7. **Mobile-first**: todo debe verse bien a 375px antes que en desktop. Grids de producto: 2 columnas en móvil, 4 en desktop.
8. **GEO**: cada H2 en forma de pregunta se responde completo en la primera oración del párrafo siguiente (oración citable por sí sola).
9. **No usar el rosa Miss Yera** ni tracking de Miss Yera en nada de TAIS. La arquitectura de conversión se mantiene; la piel es TAIS.

## Convenciones de diseño

- CTAs primarios en dorado (`--brand-accent`), pill, uppercase, tracking amplio.
- Fondos alternados: blanco / crema `--brand-soft` / gradiente lila para bloques destacados.
- Cards de producto: imagen cuadrada arriba (hoy son placeholders SVG/emoji con comentario `<!-- IMG: ... -->`), nombre, descripción de 1-2 líneas, precio dorado, link "Pedir →" a WhatsApp con el nombre del producto en el texto.
- Carruseles (testimonios/logos): duplicar el set de items dentro de `.marquee-track` para el loop infinito CSS.
- La conversión principal es **pedido por WhatsApp** (no hay pasarela de pago por ahora). Si TAIS migra a Shopify u otra pasarela, los links "Pedir →" pasan a ser páginas de producto.

## Pendientes (estado al 2026-07-04)

- [ ] Dominio canónico de TAIS (`{{DOMINIO}}`)
- [ ] WhatsApp, email, teléfono, dirección y horario
- [ ] Redes: Instagram, TikTok, Facebook
- [ ] Precios de los 7 productos (`{{PRECIO_*}}`)
- [ ] Plazos y costos de envío Lima/provincias, métodos de pago, materiales
- [ ] Historia de la marca (`{{HISTORIA_MARCA}}`) y 3 testimonios reales (`{{T1..T3}}`)
- [ ] Endpoint del formulario de newsletter (`{{FORM_ENDPOINT}}`: Formspree, Tally o backend propio)
- [ ] Fotos reales de producto del brandbook (reemplazar los placeholders `card-img` + comentarios `<!-- IMG -->`)
- [ ] URLs de políticas de envío y privacidad
- [ ] Confirmar el violeta profundo #4A3A6A o recibir el oscuro oficial
- [ ] Al publicar: configurar en servidor/Cloudflare HSTS y una CSP básica que limite `script-src` a cdn.tailwindcss.com y fonts.googleapis.com

## Keyword y SEO

- Keyword primaria actual: **"joyería con significado Perú"** + variante EN "jewelry bar Peru". Si la marca define otra, actualizar title, meta description, H1 y keywords.
- Title ≤60 chars, description ≤155, canonical al dominio TAIS, OG completo, un solo H1.
