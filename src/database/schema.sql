CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT,
    marca TEXT,
    notas TEXT,
    imagen_path_local TEXT,
    imagen_url TEXT,
    seo_titulo TEXT,
    seo_descripcion TEXT,
    tags TEXT,
    publicado INTEGER NOT NULL DEFAULT 1,
    tn_product_id INTEGER,
    tn_updated_at TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    variante TEXT,
    capacidad_medida TEXT,
    codigo_barras TEXT UNIQUE,
    sku TEXT UNIQUE,
    precio_compra REAL NOT NULL DEFAULT 0,
    precio_venta REAL NOT NULL DEFAULT 0,
    stock_actual INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 0,
    ubicacion TEXT,
    lote TEXT,
    vencimiento DATETIME,
    estado TEXT NOT NULL DEFAULT 'ACTIVO',
    tn_variant_id INTEGER,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tn_category_id INTEGER,
    nombre TEXT NOT NULL,
    tn_parent_id INTEGER,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS producto_categorias (
    producto_id INTEGER NOT NULL,
    categoria_id INTEGER NOT NULL,
    PRIMARY KEY (producto_id, categoria_id),
    FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS movimientos_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventario_id INTEGER NOT NULL,
    tipo_movimiento TEXT NOT NULL,
    concepto TEXT NOT NULL DEFAULT 'SIN_CLASIFICAR',
    cantidad INTEGER NOT NULL,
    stock_resultante INTEGER,
    fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
    motivo TEXT,
    referencia TEXT,
    precio_unitario REAL NOT NULL DEFAULT 0,
    costo_unitario REAL NOT NULL DEFAULT 0,
    importe_total REAL NOT NULL DEFAULT 0,
    operacion_id TEXT,
    anulado_en DATETIME,
    anulacion_motivo TEXT,
    anulacion_operacion_id TEXT,
    FOREIGN KEY (inventario_id) REFERENCES inventario (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    medio_pago TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'CONFIRMADA',
    nota TEXT,
    creada_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS venta_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    inventario_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    anulada_en DATETIME,
    anulacion_motivo TEXT,
    FOREIGN KEY (venta_id) REFERENCES ventas (id) ON DELETE CASCADE,
    FOREIGN KEY (inventario_id) REFERENCES inventario (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS plantillas_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventario_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    tipo_movimiento TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    motivo TEXT,
    referencia TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (inventario_id, nombre),
    FOREIGN KEY (inventario_id) REFERENCES inventario (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS configuracion_empresa (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre_empresa TEXT,
    logo_path_local TEXT,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    creada_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizada_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contactos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellidos TEXT,
    empresa TEXT,
    cargo TEXT,
    email TEXT,
    email_alternativo TEXT,
    telefono TEXT,
    telefono_alternativo TEXT,
    direccion TEXT,
    ciudad TEXT,
    provincia TEXT,
    codigo_postal TEXT,
    pais TEXT,
    sitio_web TEXT,
    fecha_nacimiento TEXT,
    notas TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (nombre);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos (categoria);
CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos (marca);
CREATE INDEX IF NOT EXISTS idx_inventario_producto_id ON inventario (producto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_codigo_barras ON inventario (codigo_barras);
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_tn_product_id ON productos (tn_product_id) WHERE tn_product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_tn_variant_id ON inventario (tn_variant_id) WHERE tn_variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_tn_category_id ON categorias (tn_category_id) WHERE tn_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_producto_categorias_categoria ON producto_categorias (categoria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_fecha ON movimientos_stock (inventario_id, fecha_movimiento DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_concepto_fecha ON movimientos_stock (concepto, fecha_movimiento DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_operacion ON movimientos_stock (operacion_id) WHERE operacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas (creada_en DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_medio_pago_fecha ON ventas (medio_pago, creada_en DESC);
CREATE TABLE IF NOT EXISTS venta_registro_comentarios (
    registro_key TEXT PRIMARY KEY,
    comentario TEXT NOT NULL DEFAULT '',
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_venta_registro_comentarios_fecha ON venta_registro_comentarios (actualizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta ON venta_detalle (venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_detalle_inventario ON venta_detalle (inventario_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_movimientos_inventario ON plantillas_movimientos (inventario_id, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_contactos_nombre ON contactos (nombre, apellidos);
CREATE INDEX IF NOT EXISTS idx_contactos_email ON contactos (email);
CREATE INDEX IF NOT EXISTS idx_contactos_telefono ON contactos (telefono);

CREATE TABLE IF NOT EXISTS tiendanube_cambios_pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_key TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    tn_product_id INTEGER NOT NULL,
    tn_variant_id INTEGER,
    payload_json TEXT NOT NULL,
    product_payload_json TEXT,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    detectado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    aplicado_en DATETIME
);

CREATE INDEX IF NOT EXISTS idx_tn_cambios_estado_fecha ON tiendanube_cambios_pendientes (estado, detectado_en);
