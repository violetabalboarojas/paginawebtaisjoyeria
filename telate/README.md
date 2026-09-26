# Telate · App de gestión (MVP)

Aplicación web para **Telate** (tortas y tés de hojas secas con frutas secas): ventas, insumos, recetas, laboratorio de nuevos tés, tareas y reportes en Excel.
Hecha con HTML, CSS y JavaScript vanilla, sin frameworks ni build. Los datos se guardan en `localStorage`.

## Cómo abrirla

- **Opción rápida:** doble clic en `index.html` (se abre en el navegador).
- **Recomendado:** servir la carpeta con un servidor local para evitar restricciones del navegador:
  ```bash
  cd telate
  python3 -m http.server 8000
  # abrir http://localhost:8000
  ```
- Necesita internet para cargar Chart.js, SheetJS y las fuentes desde CDN.
- La primera vez carga **datos de ejemplo** (45 días de ventas). Bórralos en *Respaldo y datos → Borrar todo* antes de ingresar datos reales.
- Los datos viven **solo en ese navegador y ese equipo**. Descarga un respaldo `.json` seguido.

## Versión publicada (Artifact de claude.ai)

- Enlace: https://claude.ai/artifact/8vzJxTJPc5SehQucuaGchK (privado: compártelo desde el menú *Share*).
- `artifact.html` es `index.html` sin `<!doctype>`/`<head>` (el visor los agrega). Regenerarlo si cambia `index.html`.
- Ahí los datos se guardan en la **base compartida** del Artifact (capacidad `db`): `telate/<colección>` y las ventas en `ventas_mes/<AAAA-MM-pNN>` (partes de ≤ 200 KB). Se sincronizan entre dispositivos; `localStorage` queda como copia local.
- Las descargas de Excel y del respaldo usan la capacidad `downloads` (el visor pide confirmación).
- Fuera del visor (abriendo `index.html`) todo funciona igual, solo con `localStorage`.

## Estructura de archivos

```
telate/
├── index.html         Estructura, menú lateral y carga de scripts
├── css/styles.css     Paleta chocolate / crema / verde té, responsive
└── js/
    ├── storage.js     Util (fechas, soles, escape), Storage (localStorage) y datos de ejemplo
    ├── reportes.js    Calc (costos, consumo, stock) y definición de los 9 reportes
    ├── excel.js       Exportación .xlsx con SheetJS (formato S/, %, fechas, anchos, autofiltro)
    └── app.js         Navegación por hash, vistas, formularios, validación y confirmaciones
```

## Modelo de datos (localStorage, prefijo `telate_v1_`)

| Clave | Tipo | Campos |
|---|---|---|
| `productos` | array | `id, nombre, categoria ('Torta'｜'Té'), presentacion, precio, activo, creado` |
| `insumos` | array | `id, nombre, unidad ('g'｜'kg'｜'ml'｜'L'｜'unidad'), stock, minimo, costo (S/ por unidad), proveedor` |
| `recetas` | objeto | `{ [productoId]: [{ insumoId, cantidad }] }`: cantidad por **1 unidad vendida**, en la unidad del insumo |
| `ventas` | array | `id, fecha, canal, pago, total, creado, items: [{ productoId, nombre, presentacion, categoria, cantidad, precio, subtotal, costoUnit }], consumo: [{ insumoId, cantidad }]` |
| `compras` | array | `id, fecha, insumoId, cantidad, costoTotal, nota, creado`: entradas de insumos |
| `mezclas` | array | `id, nombre, estado ('idea'｜'en prueba'｜'aprobado'｜'descartado'), teBaseId, teBaseCantidad, componentes: [{ insumoId, cantidad }], notas, rendimiento, presentacion, precio, productoId, creado` |
| `tareas` | array | `id, titulo, descripcion, area, responsable, prioridad ('alta'｜'media'｜'baja'), fechaLimite, estado ('pendiente'｜'en proceso'｜'hecha'), creado` |

Decisiones clave:
- Cada venta guarda una **foto** del producto (nombre, precio) y del **consumo de insumos** del momento. Así el historial y el reporte de consumo no cambian si después editas una receta o borras un producto.
- Al **eliminar una venta** los insumos vuelven al stock; al **anular una entrada** se restan.
- Si no hay stock suficiente, la venta se puede registrar igual (con aviso) y el stock queda negativo hasta registrar la compra.

## Pantallas

1. **Inicio**: ventas del día y del mes, producto más vendido, insumos con stock bajo, tareas pendientes/vencidas; top 5 por unidades y por monto; línea de ventas de 30 días.
2. **Ventas**: registro con varios productos, canal y pago; aviso de stock en vivo; historial con filtros por fecha, producto, categoría y canal.
3. **Productos**: CRUD, activar/desactivar, costo y margen según receta.
4. **Insumos**: CRUD, alerta de stock bajo, registro de entradas (con opción de actualizar el costo por unidad) e historial.
5. **Recetas**: insumos por unidad, costo de producción y margen calculados en vivo.
6. **Laboratorio de tés**: mezclas (té base + frutas/especias), costo por lote y por unidad, verificación de stock y lotes posibles, **Pasar a catálogo** (crea el producto con receta = lote ÷ rendimiento + empaque y etiqueta).
7. **Tareas**: vista tablero (3 columnas, arrastrar o ◀ ▶) y vista lista con filtros; vencidas resaltadas.
8. **Reportes**: rango de fechas con atajos, vista previa, *Descargar Excel* por reporte y *Exportar todo* (una hoja por reporte):
   más vendidos · por categoría/canal/pago · ventas diarias · ventas mensuales · consumo de insumos · stock bajo y compras sugeridas (mínimo × 2 − stock) · rentabilidad · tareas por estado y responsable · detalle de tareas.
9. **Respaldo y datos**: descargar/restaurar JSON, cargar ejemplo, borrar todo.

## Limitaciones conocidas del MVP

- La versión gratuita de SheetJS no aplica estilos de celda (negritas, colores). Los Excel incluyen título, período, formato S/, %, fechas, anchos ajustados y autofiltro.
- Sin usuarios ni sincronización: cada navegador tiene sus propios datos.
- `localStorage` admite unos 5 MB (suficiente para varios miles de ventas).

## Ideas para la versión 2

1. **Base de datos real y multidispositivo**: Supabase o Firebase (auth + base de datos + tiempo real) para usar la app desde el celular del local y la laptop a la vez.
2. **Usuarios y roles**: dueña (todo), caja (solo ventas), producción (tareas e insumos).
3. **Producción por lotes**: registrar que horneaste 2 tortas (descuenta insumos al producir) y vender porciones de ese stock de producto terminado.
4. **Conversión de unidades** automática (comprar en kg, usar en g) y costo promedio ponderado.
5. **Mermas y vencimientos** de insumos (fecha de caducidad por lote).
6. **PWA offline**: instalable en el celular y funciona sin internet, con sincronización al volver la conexión.
7. **Integraciones**: pedidos por WhatsApp, catálogo público, boletas/facturas electrónicas (SUNAT).
8. **Metas y proyecciones**: meta mensual, estacionalidad y sugerencia de compras según las ventas previstas.
