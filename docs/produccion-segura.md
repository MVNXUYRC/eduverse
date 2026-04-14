# Produccion Segura

Esta guía concentra la capa operativa mínima para publicar EAD en internet con un dominio propio sin depender de memoria informal.

## 1. Variables obligatorias

Definir en el entorno de despliegue:

```bash
NODE_ENV=production
PORT=3000
PERSISTENCE_MODE=postgres
ADMIN_JWT_SECRET=<minimo 32 caracteres aleatorios>
ROOT_EMAIL=<correo institucional real>
ROOT_LOGIN=<login tecnico root>
ROOT_PASSWORD=<clave temporal fuerte solo para bootstrap>
GOOGLE_CLIENT_ID=<si aplica acceso restringido>
ALLOWED_PUBLIC_EMAILS=<lista separada por comas si aplica>
REQUIRE_HTTPS=true
TRUST_PROXY_HEADERS=true
DATABASE_URL=<o DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD>
```

Notas:

- `ADMIN_JWT_SECRET` corto o ausente hace fallar el arranque en producción.
- `ROOT_PASSWORD` queda como vía de bootstrap; al primer login exitoso de `root`, el sistema persiste un hash `scrypt` en configuración.
- si el deploy está detrás de proxy TLS, `TRUST_PROXY_HEADERS=true` permite respetar `x-forwarded-proto`.

## 2. TLS y dominio

- terminar TLS en nginx, Caddy, Render, Railway o el proveedor elegido
- activar redirección HTTP -> HTTPS en el proxy
- mantener `REQUIRE_HTTPS=true` en la app para redirigir tráfico plano cuando llegue por el balanceador
- verificar certificado válido y renovación automática

## 3. Rotación de credenciales

Objetivo: sacar a `root` y admins de hashes legacy.

Pasos:

1. iniciar sesión con `root`
2. cambiar contraseña desde el cPanel
3. hacer login con cada usuario administrativo activo
4. pedir cambio de contraseña a quienes sigan con credenciales antiguas

Comportamiento actual:

- el backend rehashea automáticamente a `scrypt` cuando un usuario con hash legacy inicia sesión correctamente
- los eventos relevantes quedan marcados en logs del servicio con prefijo `[security]`

## 4. Backup y rollback

Exportar backup antes de tocar producción:

```bash
npm run backup:export
```

Probar consistencia del circuito:

```bash
npm run backup:smoke
```

Restaurar desde un backup:

```bash
npm run backup:restore -- backups/archivo.json
```

El restore genera automáticamente un backup previo en `backups/rollback-before-restore-*.json`.

Plan mínimo de rollback:

1. exportar backup actual
2. restaurar último backup sano
3. reiniciar servicio
4. validar `GET /api/health`
5. validar login admin y un PDF público

## 5. Revisión manual de contenido cargado

Ejecutar revisión asistida:

```bash
npm run security:review-content
```

Luego revisar manualmente:

- descripciones enriquecidas
- requisitos y programa
- enlaces externos de formularios
- PDFs de plan de estudio
- documentos administrativos asociados

Si el script reporta hallazgos, corregirlos desde el cPanel o mediante import limpio antes de publicar.

## 6. Smoke test sobre el deploy público

Con el dominio ya apuntando:

```bash
SMOKE_ADMIN_IDENTIFIER=<usuario-admin> \
SMOKE_ADMIN_PASSWORD=<clave-admin> \
npm run smoke:public -- https://tu-dominio
```

Cobertura actual del smoke:

- `/api/health`
- `/api/access-mode`
- `featured`
- error 404 controlado
- detalle de carrera
- lectura de PDF público si existe
- login admin
- `auth/me`
- export de backup
- rate limiting de login

Validaciones manuales adicionales recomendadas:

- upload real de PDF desde cPanel
- import de backup en staging
- flujo visual del visor PDF en navegador
- respuesta de nginx/proxy ante errores 502/504

## 7. Monitoreo básico

Si usás el servicio local persistente:

```bash
systemctl --user status ead-project.service
journalctl --user -u ead-project.service -f
```

Alertas mínimas a observar:

- fallos repetidos de login
- eventos `[security]`
- reinicios inesperados del proceso
- errores de conexión a PostgreSQL
- respuestas 5xx en proxy o proveedor

## 8. Checklist de salida

- [ ] secretos fuertes cargados en entorno
- [ ] `REQUIRE_HTTPS=true`
- [ ] PostgreSQL migrado y accesible
- [ ] backup exportado y smoke de backup OK
- [ ] revisión de contenido sin hallazgos pendientes
- [ ] smoke público OK
- [ ] contraseñas admin/root rotadas o rehasheadas
- [ ] monitoreo básico activo
