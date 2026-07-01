export interface LicenseStatus {
  isValid: boolean;
  holder: string | null;
  expiresAt: string | null;
  mode: string;
  message: string;
}

export interface AuthStatus {
  configured: boolean;
  username: string | null;
  recoveryConfigured?: boolean;
}

export interface DashboardStats {
  totalProductos: number;
  totalVariantes: number;
  stockTotal: number;
  variantesBajoStock: number;
  movimientosHoy: number;
  totalInvertido: number;
  totalVentasSalidas: number;
}

export interface StockAlert {
  inventarioId: number;
  productoId: number;
  nombre: string;
  marca: string | null;
  variante: string | null;
  capacidadMedida: string | null;
  sku: string | null;
  codigoBarras: string | null;
  stockActual: number;
  stockMinimo: number;
}

export interface CatalogoFilters {
  search?: string;
  categoria?: string;
  marca?: string;
  estado?: string;
  soloBajoStock?: boolean;
  soloConVariantes?: boolean;
}

export interface CatalogoFilterOptions {
  categorias: string[];
  marcas: string[];
}

export type EstadoInventario = "ACTIVO" | "PAUSADO" | "DISCONTINUADO";

export interface CatalogoItem {
  inventarioId: number;
  productoId: number;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  marca: string | null;
  notas: string | null;
  imagenPathLocal: string | null;
  imagenUrl: string | null;
  seoTitulo: string | null;
  seoDescripcion: string | null;
  tags: string | null;
  publicado: number;
  tnProductId: number | null;
  tnVariantId: number | null;
  variante: string | null;
  capacidadMedida: string | null;
  sku: string | null;
  codigoBarras: string | null;
  stockActual: number;
  stockMinimo: number;
  precioCompra: number;
  precioVenta: number;
  ubicacion: string | null;
  lote: string | null;
  vencimiento: string | null;
  estado: EstadoInventario;
  tnCategoryIds: number[];
}

export interface ProductoDetalle extends CatalogoItem {
  categorias?: CategoriaRef[];
}

export interface CategoriaRef {
  id: number;
  tnCategoryId: number | null;
  nombre: string;
}

export interface Categoria {
  id: number;
  tnCategoryId: number | null;
  nombre: string;
  tnParentId: number | null;
}

export interface CategoriaTreeNode extends Categoria {
  hijos: CategoriaTreeNode[];
}

export interface MovimientoListado {
  id: number;
  inventarioId: number;
  producto: string;
  variante: string | null;
  tipoMovimiento: string;
  cantidad: number;
  stockResultante: number | null;
  motivo: string | null;
  referencia: string | null;
  fechaMovimiento: string;
}

export type TipoMovimientoStock = "ENTRADA" | "SALIDA" | "AJUSTE";

export interface MovimientosFilters {
  inventarioId?: number;
  tipoMovimiento?: TipoMovimientoStock;
  search?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  limit?: number;
  offset?: number;
}

export interface InventarioMovimientoOption {
  inventarioId: number;
  producto: string;
  variante: string | null;
  capacidadMedida: string | null;
  sku: string | null;
  stockActual: number;
  stockMinimo: number;
  estado: EstadoInventario;
}

export interface MovimientoStockDraft {
  inventarioId: number;
  tipoMovimiento: TipoMovimientoStock;
  cantidad: number;
  motivo?: string;
  referencia?: string;
}

export interface MovimientoTemplate {
  id: number;
  inventarioId: number;
  nombre: string;
  tipoMovimiento: TipoMovimientoStock;
  cantidad: number;
  motivo: string | null;
  referencia: string | null;
  actualizadaEn: string;
}

export interface MovimientoTemplateDraft {
  inventarioId: number;
  nombre: string;
  tipoMovimiento: TipoMovimientoStock;
  cantidad: number;
  motivo?: string;
  referencia?: string;
}

export interface GastoDetalle {
  id: string;
  concepto: string;
  valor: number;
}

export interface GastoRegistro {
  id: string;
  nombre: string;
  fecha: string;
  descripcion?: string;
  items: GastoDetalle[];
  total: number;
  creadoEn: string;
}

export interface Contacto {
  id: number;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  cargo: string | null;
  email: string | null;
  emailAlternativo: string | null;
  telefono: string | null;
  telefonoAlternativo: string | null;
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  pais: string | null;
  sitioWeb: string | null;
  fechaNacimiento: string | null;
  notas: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface ContactoDraft {
  nombre: string;
  apellidos?: string;
  empresa?: string;
  cargo?: string;
  email?: string;
  emailAlternativo?: string;
  telefono?: string;
  telefonoAlternativo?: string;
  direccion?: string;
  ciudad?: string;
  provincia?: string;
  codigoPostal?: string;
  pais?: string;
  sitioWeb?: string;
  fechaNacimiento?: string;
  notas?: string;
}

export interface ContactosPage {
  items: Contacto[];
  total: number;
}

export interface ProductoDraft {
  nombre: string;
  descripcion?: string;
  categoria?: string;
  marca?: string;
  notas?: string;
  imagenPathLocal?: string;
  imagenUrl?: string;
  seoTitulo?: string;
  seoDescripcion?: string;
  tags?: string;
  publicado?: boolean;
  variante?: string;
  capacidadMedida?: string;
  codigoBarras?: string;
  sku?: string;
  precioCompra?: number;
  precioVenta?: number;
  stockInicial?: number;
  stockMinimo?: number;
  ubicacion?: string;
  lote?: string;
  vencimiento?: string;
  fechaIngreso?: string;
  estado?: EstadoInventario;
}

export interface ConfiguracionEmpresa {
  nombreEmpresa: string | null;
  logoPathLocal: string | null;
  moneda: string;
}

export interface ConfiguracionEmpresaDraft {
  nombreEmpresa: string;
  logoPathLocal: string;
  moneda: string;
}

export interface TiendanubeSyncStatus {
  connected: boolean;
  lastSync: string | null;
  message: string;
}
