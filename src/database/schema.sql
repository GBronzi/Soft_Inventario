CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT,
    marca TEXT,
    notas TEXT,
    imagen_path_local TEXT,
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
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS movimientos_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventario_id INTEGER NOT NULL,
    tipo_movimiento TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    stock_resultante INTEGER,
    fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
    motivo TEXT,
    referencia TEXT,
    FOREIGN KEY (inventario_id) REFERENCES inventario (id) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (nombre);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos (categoria);
CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos (marca);
CREATE INDEX IF NOT EXISTS idx_inventario_producto_id ON inventario (producto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_codigo_barras ON inventario (codigo_barras);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_fecha ON movimientos_stock (inventario_id, fecha_movimiento DESC);
CREATE INDEX IF NOT EXISTS idx_plantillas_movimientos_inventario ON plantillas_movimientos (inventario_id, actualizado_en DESC);