# Publicación de actualizaciones

## Configuración inicial en GitHub

1. Abrir `Settings > Secrets and variables > Actions` en el repositorio.
2. Crear el secreto `TAURI_SIGNING_PRIVATE_KEY` con el contenido de:
   `C:\Users\giuse\.tauri\soft-inventario-updater.key`.
3. Crear `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` vacío únicamente si GitHub lo permite. La clave actual no tiene contraseña, por lo que el workflow también funciona omitiendo este secreto.
4. Guardar una copia externa segura de la clave privada. No debe añadirse al repositorio.

## Publicar una versión

1. Cambiar la versión en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`.
2. Ejecutar las pruebas y compilar localmente.
3. Crear y subir una etiqueta, por ejemplo `v1.0.5`.
4. GitHub Actions creará un Release en borrador con el instalador `.exe`, la firma y `latest.json`.
5. Revisar el Release y pulsar **Publish release**.

Los programas instalados sólo detectan Releases publicados. Los commits y Releases en borrador no se ofrecen a los clientes.
