# App de preventa (Flutter, Android)

App del preventista: toma pedidos y registra clientes con GPS **sin necesidad de señal**. Todo se guarda en el teléfono (SQLite) y se envía al servidor cuando hay conexión.

## Cómo funciona la sincronización

1. Cada acción (alta de cliente, pedido, cancelación, posición GPS) se guarda localmente y entra a una **cola de salida** con un identificador único (`device_operation_id`).
2. La app envía la cola al recuperar señal, cada 2 minutos y al tocar "Sincronizar".
3. El servidor procesa cada operación una sola vez: si la respuesta se pierde y la app reenvía, el servidor la reconoce y no la duplica.
4. Una operación solo sale de la cola cuando el servidor la confirma. Si la rechaza (por ejemplo, un pedido ya atendido que se intenta cancelar), queda visible con el motivo y el usuario decide descartarla.
5. Después de enviar, la app descarga catálogo, precios de referencia, stock, clientes y el estado de sus pedidos (por ejemplo, "Atendido · V-000031").

Los clientes y pedidos se crean con UUID generados en el teléfono, así un pedido puede referirse a un cliente creado sin conexión.

## Ejecutar

```bash
flutter pub get
flutter run                      # con un emulador o teléfono Android conectado
flutter build apk --debug        # APK en build/app/outputs/flutter-apk/app-debug.apk
```

En la pantalla de ingreso, **Servidor** permite configurar la API:

- Emulador de Android: `http://10.0.2.2:3000/api` (valor por defecto)
- Teléfono real en la misma red Wi-Fi que la PC: `http://IP-DE-LA-PC:3000/api` (el firewall de Windows debe permitir el puerto 3000)
- Servidor en la nube: `https://su-dominio/api`

Usuario de demo: `preventista` / `Demo123!`.

### Si la compilación falla con `PKIX path building failed`

Un antivirus que inspecciona HTTPS (por ejemplo, Avast Web Shield) firma las conexiones con su propio certificado, en el que Java no confía. Para compilar sin desactivarlo, indique a Java que use los certificados de Windows:

```powershell
$env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT'
flutter build apk --debug
```

`android/gradle.properties` desactiva la compilación incremental de Kotlin porque falla cuando el proyecto y la caché de pub están en unidades distintas (por ejemplo, `E:` y `C:`).

## Pruebas

```bash
flutter analyze
flutter test test/sync_integration_test.dart       # requiere el backend en localhost:3000
flutter test --update-goldens --tags golden        # regenera capturas en test/goldens/
```

Verificado también en el emulador de Android 16: inicio de sesión, pedido tomado sin red y envío automático al recuperar la conexión.

La prueba de integración usa el mismo código de la app contra el servidor real: pedido sin señal, reenvío tras una respuesta perdida (sin duplicar) y rechazo del servidor.

## Límites de la demo

- El GPS periódico funciona mientras la app está abierta (no hay servicio en segundo plano).
- La app usa HTTP en red local (`usesCleartextTraffic`); en producción el servidor debe usar HTTPS y se quita ese permiso.
