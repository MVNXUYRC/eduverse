# EAD - Plataforma de Educacion a Distancia UNaM

Aplicacion web institucional para publicar y administrar la oferta academica de la UNaM. El sistema tiene dos superficies:

- sitio publico para consulta de carreras y cursos
- cPanel administrativo para gestionar propuestas, usuarios, configuracion, auditoria y backups

## Estado actual

La implementacion vigente usa:

- backend Node.js con servidor HTTP propio en [backend/server-standalone.js](/home/usr/Documentos/gci/devops_/ead/backend/server-standalone.js)
- frontend publico SPA en HTML/CSS/JS vanilla
- cPanel administrativo en HTML/CSS/JS vanilla
- persistencia con seleccion automatica:
  - PostgreSQL si hay configuracion de base o `PERSISTENCE_MODE=postgres`
  - JSON legado si `PERSISTENCE_MODE=json` o `PERSISTENCE_MODE=auto` sin DB

La documentacion funcional principal esta en:

- [docs/funcionalidades-sistema.md](/home/usr/Documentos/gci/devops_/ead/docs/funcionalidades-sistema.md)
- [docs/reglas-negocio.md](/home/usr/Documentos/gci/devops_/ead/docs/reglas-negocio.md)

## Estructura

```text
ead/
├── backend/
│   ├── admin/             # auth, router admin, backup
│   ├── config/            # carga de variables de entorno
│   ├── data/              # dataset JSON legado
│   ├── domain/            # constantes de dominio compartidas
│   ├── persistence/       # stores JSON/PostgreSQL, schema y tests
│   ├── repositories/      # fachada de estado
│   ├── scripts/           # migracion, import y smoke tests
│   └── server-standalone.js
├── frontend/
│   ├── css/
│   ├── js/
│   │   ├── cpanel-shared.js # modulo comun del cPanel y contrato de estado compartido
│   │   ├── cpanel-careers.js # modulo de gestion de carreras/cursos del cPanel
│   │   ├── cpanel-users.js # modulo de gestion de usuarios y claves del cPanel
│   │   ├── cpanel-config.js # modulo de configuracion operativa del cPanel
│   │   ├── cpanel-logs.js # modulo de auditoria/logs del cPanel
│   │   ├── cpanel-backup.js # modulo de export/import del cPanel
│   │   ├── cpanel-core.js # auth, shell, dashboard e inicializacion del cPanel
│   │   ├── cpanel-shared.test.js # tests del estado/utilidades compartidas del cPanel
│   │   ├── cpanel-modules.test.js # tests de contratos de modulos del cPanel
│   │   ├── cpanel-core.test.js # tests de flujos criticos del core del cPanel
│   │   ├── cpanel-careers.test.js # tests de reglas y validaciones del formulario de carreras
│   ├── e2e/
│   │   ├── cpanel-admin.e2e.test.js # E2E real de navegador para login admin y alta de curso EaD
│   ├── public/
│   ├── uploads/
│   ├── vendor/pdfjs/
│   ├── cpanel.html
│   └── index.html
├── docs/
├── scripts/
├── .env.example
└── package.json
```

## Requisitos

- Node.js 18+
- npm 8+
- PostgreSQL 14+ si vas a trabajar en modo DB

## Variables de entorno

Base:

```bash
NODE_ENV=development
PORT=3000
PERSISTENCE_MODE=auto
ADMIN_JWT_SECRET=changeme-super-secret
ROOT_EMAIL=root@unam.edu.ar
ROOT_LOGIN=root-unam
ROOT_PASSWORD=changeme-root-password
GOOGLE_CLIENT_ID=
ALLOWED_PUBLIC_EMAILS=
REQUIRE_HTTPS=false
TRUST_PROXY_HEADERS=true
```

El acceso `root` usa `ROOT_LOGIN` como identificador técnico de ingreso. El correo root queda como dato interno y no hace falta exponerlo para iniciar sesión.
Ademas, las superficies funcionales de auditoria y exportacion de backups muestran la identidad tecnica del `root` en lugar de su correo.
En producción, `ADMIN_JWT_SECRET` debe tener al menos 32 caracteres aleatorios; si no, el backend falla al arrancar.

PostgreSQL:

```bash
# opcion 1
DATABASE_URL=postgres://user:pass@localhost:5432/ead

# opcion 2
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=ead
DB_USER=postgres
DB_PASSWORD=postgres
PGSSL_DISABLE=true
```

JSON legado:

```bash
PERSISTENCE_MODE=json
# opcional
JSON_DB_PATH=backend/data/db.json
```

## Arranque rapido

Modo automatico recomendado:

```bash
npm install
cp .env.example .env.local
./scripts/ead-up.sh dev
```

Comandos utiles:

```bash
./scripts/ead-status.sh
./scripts/ead-down.sh
./scripts/install-systemd-user-service.sh
npm test
npm run test:e2e:cpanel
npm run backup:smoke
npm run security:review-content
```

`./scripts/ead-up.sh dev` ahora privilegia estabilidad para dejar el backend corriendo en segundo plano. Si necesitás reinicio automático por cambios de código, usá `./scripts/ead-up.sh watch`.

En Linux, la opción más robusta para evitar caídas del backend al cerrar terminal o sesión gráfica es instalar el servicio de usuario:

```bash
./scripts/install-systemd-user-service.sh
systemctl --user daemon-reload
systemctl --user enable --now ead-project.service
```

`npm test` cubre backend y una base de regresion del frontend admin para contratos de modulos, estado compartido, flujos criticos del core y reglas complejas del formulario de carreras del cPanel.

`npm run test:e2e:cpanel` ejecuta un flujo real de navegador con `chromedriver + chromium`: restaura sesión admin, crea un curso de EaD en un store JSON temporal y verifica su presencia en el listado del cPanel.

## Modos de persistencia

### PostgreSQL

Recomendado para trabajo normal, pruebas integrales y despliegue.

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

### JSON

Util para retomar rapido, revisar UI o trabajar sin base disponible.

```bash
PERSISTENCE_MODE=json npm run dev
```

## Endpoints principales

Publicos:

- `GET /api/health`
- `GET /api/access-mode`
- `POST /api/auth/verify`
- `GET /api/careers`
- `GET /api/careers/featured`
- `GET /api/careers/filters`
- `GET /api/careers/:id`

Admin:

- `POST /admin/api/auth/login`
- `GET /admin/api/auth/me`
- `POST /admin/api/auth/change-password`
- `GET|POST|PUT|PATCH|DELETE /admin/api/carreras`
- `GET|POST|PUT|DELETE /admin/api/usuarios`
- `GET /admin/api/config`
- `GET|POST /admin/api/audit`
- `GET|POST /admin/api/backup`

El login admin acepta `identifier + password`, donde `identifier` puede ser el `login` técnico del usuario administrativo y, para usuarios no-root, también su correo.

## Acceso restringido del sitio publico

Cuando `acceso_publico=false`, el frontend pide login con Google Identity Services.

- el backend publica `GOOGLE_CLIENT_ID` en `GET /api/access-mode`
- el frontend valida el email contra `POST /api/auth/verify`
- la validacion puede pasar por allow-list estatica y/o usuarios activos cargados en el sistema

Si `GOOGLE_CLIENT_ID` no esta configurado, el frontend muestra una advertencia y no intenta inicializar el login restringido.

## Uploads y documentos

- planes de estudio: `frontend/uploads/planes`
- documentos administrativos: `frontend/uploads/resoluciones`
- limite por archivo: 20 MB
- limite por request admin: 50 MB

Podés ajustar estos límites por entorno con:

- `ADMIN_MAX_UPLOAD_MB` (por archivo, admin)
- `ADMIN_MAX_REQUEST_MB` (por request admin)
- `ADMIN_MAX_CHUNK_MB` (por chunk en fallback de subida fragmentada)
- `MAX_REQUEST_MB` (límite global de request en servidor)

## Tests

Hoy existen tests de:

- asociacion de PDFs en carreras
- configuracion de PostgreSQL
- seleccion de store JSON/PostgreSQL

Ejecucion:

```bash
npm test
```

## Publicacion segura

Antes de exponer el sistema con dominio propio, completar esta secuencia:

```bash
npm run backup:export
npm run backup:smoke
npm run security:review-content
npm run smoke:public -- https://tu-dominio
```

- poner `NODE_ENV=production`, `REQUIRE_HTTPS=true` y secretos reales en variables de entorno
- rotar la contraseña `root` y las contraseñas administrativas para que el login exitoso migre hashes legacy a `scrypt`
- revisar manualmente PDFs, formularios y contenido enriquecido ya cargado
- validar en despliegue real login, export de backup, links PDF, errores 404 y rate limiting
- usar `journalctl --user -u ead-project.service -f` o logs del proveedor para monitoreo básico y eventos `[security]`

Existe una guía operativa más detallada en [docs/produccion-segura.md](/home/usr/Documentos/gci/devops_/ead/docs/produccion-segura.md).

## Fuente de verdad

Para retomar desarrollo, priorizar en este orden:

1. `docs/funcionalidades-sistema.md`
2. `docs/reglas-negocio.md`
3. codigo en `backend/server-standalone.js`, `backend/admin/router.js`, `frontend/js/app.js` y `frontend/cpanel.html`

El `README` intenta resumir el estado actual, pero la validacion final siempre debe hacerse contra esos archivos.
