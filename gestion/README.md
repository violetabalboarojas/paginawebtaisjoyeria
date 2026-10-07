# TAIS Joyería · Gestión (MVP)

Aplicativo web interno para gestionar el negocio de joyería personalizada con grabado láser: productos, ventas, insumos, desarrollo de nuevos productos, tareas y reportes en Excel.

Funciona solo con HTML, CSS y JavaScript puro. No necesita servidor: se abre `index.html` directamente en el navegador.

## Cómo abrirla

1. Descarga o clona el repositorio.
2. Abre `gestion/index.html` con doble clic (Chrome, Edge, Safari o Firefox).
3. La primera vez verás una bienvenida: pulsa **Cargar datos de ejemplo** para recorrerla, o empieza registrando tus insumos.

> Se necesita internet para cargar Chart.js (gráficos), SheetJS (Excel) y las tipografías. Los datos en sí no salen del navegador.

En el celular: súbela a cualquier hosting estático (también vale el mismo sitio en `/gestion/`) y ábrela desde el navegador; usa “Agregar a pantalla de inicio” para tenerla como app.

## Estructura de archivos

```
gestion/
├── index.html            Esqueleto: menú lateral, contenedor de vistas, modal
├── styles.css            Estilos (paleta TAIS: lila, crema, dorado + gris carbón), mobile-first
├── app.js                Arranque, navegación por #hash y copias de seguridad
└── js/
    ├── utils.js          Formato S/ y dd/mm/aaaa, catálogos de opciones, modal, avisos, validación
    ├── store.js          Capa de datos (localStorage). ÚNICO archivo a cambiar para usar una BD
    ├── negocio.js        Reglas: margen, costo por receta, descuento de insumos, compras, estadísticas
    ├── seed.js           Datos de ejemplo (ficticios)
    └── modules/
        ├── dashboard.js  Tarjetas + 4 gráficos (Chart.js)
        ├── productos.js  CRUD + receta de insumos + margen automático
        ├── ventas.js     Pedidos, descuento automático de insumos, filtros
        ├── insumos.js    Inventario, compras (entradas), lista "a comprar"
        ├── desarrollo.js Kanban Idea → Prototipo → Prueba → Listo para vender
        ├── tareas.js     Tareas con prioridad, fecha límite y vencidas
        └── reportes.js   7 reportes + Excel (SheetJS) + Exportar todo
```

Los scripts son clásicos (no módulos ES) a propósito: los módulos ES no cargan desde `file://`.

## Modelo de datos

Todo se guarda en `localStorage` bajo la clave `tais_gestion_v1`. Fechas en ISO (`aaaa-mm-dd`), montos en soles como número.

| Colección | Campos principales |
|---|---|
| `productos` | nombre, categoria, material, personalizacion, ocasion, costo, precio, estado (`activo`/`desarrollo`/`descontinuado`), descripcion, **receta** `[{insumoId, cantidad}]` |
| `insumos` | nombre, categoria, unidad, stock, stockMin, costo, proveedor |
| `compras` | fecha, insumoId, cantidad, costoUnit, proveedor, nota |
| `ventas` | numero (P-0001), fecha, cliente, telefono, **items** `[{productoId, nombre, cantidad, precio}]`, descuento, subtotal, total, metodoPago, canal, ocasion, grabado, fechaEntrega, estado (`pendiente`/`produccion`/`listo`/`entregado`), notas, **consumo** `[{insumoId, cantidad}]` |
| `ideas` | nombre, descripcion, etapa (`idea`/`prototipo`/`prueba`/`listo`), receta, insumosTexto, costoEst, precioSug, notas, fecha, productoId |
| `tareas` | titulo, descripcion, responsable, prioridad (`alta`/`media`/`baja`), fechaLimite, categoria, completada, completadaEl |

Todas las colecciones llevan además `id`, `creado` y `actualizado`.

## Reglas del negocio

- **Margen** = (precio − costo) ÷ precio. Se marca en rojo si es menor a 30 %.
- **Costo desde receta**: suma de cantidad × costo unitario actual de cada insumo (el botón “Usar costo de la receta” lo copia; puedes sumarle a mano la mano de obra).
- **Al registrar una venta** se descuentan los insumos de la receta × cantidad. Se guarda una foto de lo consumido (`consumo`), así editar o eliminar la venta devuelve exactamente lo que se descontó, aunque la receta cambie después.
- Si falta stock, la app avisa y pide confirmar. El stock puede quedar negativo: eso significa que faltan materiales para pedidos pendientes.
- **Stock bajo** = stock ≤ mínimo. **Insumos a comprar** sugiere comprar hasta llegar al doble del mínimo.
- **Compras**: suman al stock y actualizan el costo unitario del insumo al último precio pagado.
- El descuento de un pedido se reparte entre sus productos en proporción a su subtotal (para los reportes por producto, categoría y ocasión).
- La ocasión de una venta es la elegida en el pedido; si queda en “Según el producto”, se usa la del producto.

## Datos

En el pie del menú lateral:
- **Exportar copia (JSON)**: descarga todos los datos. Hazlo seguido: si se borran los datos del navegador, se pierden.
- **Importar copia (JSON)**: reemplaza los datos actuales por los del archivo.
- **Cargar datos de ejemplo** / **Borrar todo** (ambos piden confirmación).

## Pruebas realizadas

Probada en Chromium (Playwright) a 1280 px y 375 px: carga de datos de ejemplo, venta con descuento automático de insumos, edición y eliminación con devolución de stock, aviso de stock insuficiente, compras, CRUD de insumos y productos con receta, filtros, Kanban y conversión a producto, tareas, los 7 reportes en Excel + Exportar todo (formatos S/ y dd/mm/aaaa verificados), exportar/borrar/importar copia, sin scroll horizontal en móvil y sin errores de JavaScript.
