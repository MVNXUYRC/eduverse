# Registro de Modificaciones

Este archivo se usa para llevar trazabilidad funcional y técnica de los cambios aplicados al sistema.

## Convención de uso
- Registrar una entrada por cada cambio relevante (feature, fix, hardening, refactor).
- Usar fecha en formato `YYYY-MM-DD`.
- Incluir impacto funcional y archivos afectados.
- Marcar estado de validación (`Pendiente` / `Validado`).

## Plantilla

```md
## YYYY-MM-DD - Título corto del cambio
- Tipo: `Feature | Fix | Refactor | Seguridad | Docs | Infra`
- Módulo: `Público | cPanel | Backend | Persistencia | DevOps`
- Resumen: descripción breve del cambio.
- Motivo: problema o necesidad que resuelve.
- Impacto funcional:
  - qué mejora/corrige para el usuario.
- Archivos modificados:
  - ruta/archivo1
  - ruta/archivo2
- Riesgos/consideraciones:
  - posibles efectos secundarios o notas de compatibilidad.
- Validación:
  - tests/comandos/chequeos manuales ejecutados.
- Estado: `Pendiente | Validado`
```

---

## 2026-04-09 - Cobertura inicial del frontend admin y contrato de estado compartido
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se formalizó el estado compartido del cPanel en `cpanel-shared.js` y se agregaron tests automatizados para sus módulos y contratos base.
- Motivo: luego de la modularización completa del panel faltaba una capa mínima de seguridad para evitar regresiones en navegación, filtros y APIs modulares.
- Impacto funcional:
  - el cPanel mantiene el mismo comportamiento visible, pero ahora su estado compartido se gestiona desde una API explícita.
  - `npm test` también valida que los módulos del frontend admin expongan las factories y métodos esperados.
- Archivos modificados:
  - `frontend/js/cpanel-shared.js`
  - `frontend/js/cpanel-core.js`
  - `frontend/js/cpanel-shared.test.js`
  - `frontend/js/cpanel-modules.test.js`
  - `package.json`
  - `README.md`
- Riesgos/consideraciones:
  - la cobertura nueva valida contratos y estado base, no reemplaza pruebas end-to-end del flujo completo en navegador.
- Validación:
  - `node --check frontend/js/cpanel-shared.js`
  - `node --check frontend/js/cpanel-core.js`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - Cobertura de flujos críticos del cPanel core
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se agregaron tests de comportamiento para `cpanel-core.js`, cubriendo login, navegación, cambio de contraseña y permisos por rol.
- Motivo: después de separar el shell/auth del cPanel faltaba validar sus flujos de mayor riesgo con una regresión automatizada específica.
- Impacto funcional:
  - el core del cPanel mantiene el mismo comportamiento visible, pero ahora cuenta con cobertura sobre autenticación y control de acceso.
  - `npm test` detecta regresiones en login, navegación entre módulos y cierre de sesión tras cambio de contraseña.
- Archivos modificados:
  - `frontend/js/cpanel-core.test.js`
  - `package.json`
  - `README.md`
- Riesgos/consideraciones:
  - los tests usan un harness DOM liviano; todavía no reemplazan pruebas E2E en navegador real.
- Validación:
  - `node --check frontend/js/cpanel-core.test.js`
  - `node --test frontend/js/cpanel-core.test.js`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - Cobertura de reglas del formulario de carreras del cPanel
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se agregaron tests específicos para `cpanel-careers.js`, cubriendo reglas de EaD, autocompletado académico, tags/disertantes, documentos y validaciones de guardado.
- Motivo: el formulario de propuestas concentra la mayor complejidad funcional del admin y necesitaba una regresión automatizada más profunda.
- Impacto funcional:
  - `npm test` ahora detecta regresiones en reglas críticas del alta/edición de propuestas.
  - quedan cubiertos escenarios de normalización de datos y armado del payload de guardado sin depender de navegador real.
- Archivos modificados:
  - `frontend/js/cpanel-careers.test.js`
  - `package.json`
  - `README.md`
- Riesgos/consideraciones:
  - la cobertura nueva sigue usando harness liviano; los flujos con uploads binarios y editor enriquecido todavía conviene validarlos con E2E real.
- Validación:
  - `node --check frontend/js/cpanel-careers.test.js`
  - `node frontend/js/cpanel-careers.test.js`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - E2E real del cPanel para login admin y alta de curso EaD
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se incorporó una prueba E2E con navegador real (`chromedriver + chromium`) para validar el flujo crítico de administración sobre un store JSON temporal.
- Motivo: complementar los harness livianos con una verificación punta a punta del panel en entorno real de navegador.
- Impacto funcional:
  - se valida que el cPanel pueda restaurar sesión admin, abrir gestión de propuestas, crear un curso de EaD y mostrarlo en el listado.
  - la prueba no toca datos persistentes del repo porque trabaja con una copia temporal de `db.json`.
- Archivos modificados:
  - `frontend/e2e/cpanel-admin.e2e.test.js`
  - `package.json`
  - `README.md`
- Riesgos/consideraciones:
  - la autenticación del E2E se bootstrappea desde la API real y luego continúa en UI para evitar inestabilidades del formulario de login bajo WebDriver.
  - requiere `chromedriver` y `chromium-browser` disponibles en el sistema.
- Validación:
  - `node --check frontend/e2e/cpanel-admin.e2e.test.js`
  - `npm run test:e2e:cpanel`
- Estado: `Validado`

## 2026-04-09 - Login técnico para root y usuarios administrativos
- Tipo: `Seguridad`
- Módulo: `Backend + cPanel + Persistencia + Docs`
- Resumen: se incorporó `login`/usuario técnico como credencial administrativa y `root` pasó a ingresar con `ROOT_LOGIN` en lugar de exponer el correo como identificador visible.
- Motivo: reducir exposición del correo root, separar identidad operativa de dato personal y preparar un modelo de autenticación administrativa más robusto.
- Impacto funcional:
  - el login admin ahora acepta `identifier + password`, usando `login` técnico y, para usuarios no-root, compatibilidad con correo.
  - `root` ingresa con `root-unam` por defecto, configurable vía `ROOT_LOGIN`.
  - el cPanel de usuarios permite crear/editar `login` único por usuario.
  - la persistencia y backups conservan el nuevo campo `login`.
- Archivos modificados:
  - `backend/admin/auth.js`
  - `backend/admin/router.js`
  - `backend/admin/router.test.js`
  - `backend/admin/backup-utils.js`
  - `backend/persistence/schema.sql`
  - `backend/persistence/pg-store.js`
  - `backend/server-standalone.js`
  - `frontend/cpanel.html`
  - `frontend/js/cpanel-core.js`
  - `frontend/js/cpanel-core.test.js`
  - `frontend/js/cpanel-users.js`
  - `frontend/e2e/cpanel-admin.e2e.test.js`
  - `.env.example`
  - `README.md`
  - `docs/funcionalidades-sistema.md`
  - `docs/reglas-negocio.md`
- Riesgos/consideraciones:
  - en PostgreSQL existente hace falta aplicar esquema para agregar columna `login`.
  - usuarios legados sin `login` se normalizan derivándolo del correo cuando se cargan o serializan.
- Validación:
  - `npm test`
  - `npm run test:e2e:cpanel`
- Estado: `Validado`

## 2026-04-09 - Robustez de carga de documentación en carreras nuevas
- Tipo: `Fix`
- Módulo: `cPanel + Backend`
- Resumen: se corrigió el flujo de guardado cuando ocurre `HTTP 413`, evitando pérdida de asociación de PDFs.
- Motivo: la documentación cargada podía no verse luego en índice/detalle por asociación incompleta tras fallback liviano.
- Impacto funcional:
  - las carreras nuevas conservan correctamente plan/documentación incluso con cargas pesadas.
  - mejora la visualización en requisitos/documentación.
- Archivos modificados:
  - `frontend/cpanel.html`
  - `backend/admin/router.js`
  - `frontend/js/app.js`
- Riesgos/consideraciones:
  - mantener controlado el tamaño de request y número de adjuntos por propuesta.
- Validación:
  - chequeo de sintaxis frontend/backend.
  - pruebas de guardado con fallback y verificación visual en detalle.
  - pruebas automatizadas `npm test`.
- Estado: `Validado`

## 2026-04-09 - Incorporación de visor PDF con pdf.js
- Tipo: `Feature`
- Módulo: `Público (detalle de propuesta)`
- Resumen: reemplazo del visor embebido por `pdfjs-dist` con canvas, paginación y zoom.
- Motivo: mejorar compatibilidad y control del render de plan de estudios.
- Impacto funcional:
  - visualización más estable del PDF dentro del detalle.
  - mantiene enlace de apertura directa como fallback.
- Archivos modificados:
  - `package.json`
  - `frontend/index.html`
  - `frontend/js/app.js`
  - `frontend/vendor/pdfjs/pdf.min.js`
  - `frontend/vendor/pdfjs/pdf.worker.min.js`
- Riesgos/consideraciones:
  - vigilar cache del navegador tras despliegues.
- Validación:
  - `node --check frontend/js/app.js`
  - prueba manual de navegación de páginas y zoom.
- Estado: `Validado`

## 2026-04-09 - Migración de persistencia a PostgreSQL y configuración operativa
- Tipo: `Refactor`
- Módulo: `Persistencia + Backend + DevOps`
- Resumen: se reemplazó la persistencia en JSON por PostgreSQL como backend principal de datos.
- Motivo: eliminar dependencia de archivos planos para operación real y robusta en producción.
- Impacto funcional:
  - las operaciones CRUD pasan a persistir en base de datos PostgreSQL.
  - se agregan scripts de migración/importación para inicializar esquema y datos.
  - se mantiene compatibilidad funcional del flujo de administración y consulta pública.
- Archivos modificados:
  - `backend/persistence/index.js`
  - `backend/persistence/pg-store.js`
  - `backend/persistence/db-config.js`
  - `backend/scripts/migrate.js`
  - `backend/scripts/import-db-json.js`
  - `backend/server-standalone.js`
  - `backend/server.js`
  - `package.json`
  - `README.md`
  - `.env.example`
- Riesgos/consideraciones:
  - requiere variables de entorno de DB válidas y disponibilidad del servicio PostgreSQL.
  - para entorno local se usa `PGSSL_DISABLE=true` cuando la instancia no soporta SSL.
- Validación:
  - `npm run db:migrate`
  - `npm run db:seed`
  - `npm run backup:smoke`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - Autoarranque de servicios al iniciar sistema
- Tipo: `Infra`
- Módulo: `DevOps`
- Resumen: `ead-up.sh` ahora intenta iniciar el contenedor PostgreSQL y espera disponibilidad antes de arrancar backend.
- Motivo: evitar fallas de arranque tras reinicio cuando Node sube antes que la base.
- Impacto funcional:
  - al ejecutar `./scripts/ead-up.sh start|prod` se autoarranca `ead-postgres` si existe.
  - mejora la estabilidad del inicio automático al reiniciar la PC.
- Archivos modificados:
  - `scripts/ead-up.sh`
- Riesgos/consideraciones:
  - requiere Docker instalado y permisos del usuario para usarlo.
  - se puede desactivar con `AUTO_START_DB=false`.
- Validación:
  - chequeo de sintaxis `bash -n scripts/ead-up.sh`
  - arranque manual con `./scripts/ead-up.sh prod`
- Estado: `Validado`

## 2026-04-09 - Alineación técnica de persistencia, acceso restringido y documentación
- Tipo: `Refactor`
- Módulo: `Backend + Frontend + Docs + DevOps`
- Resumen: se eliminaron contradicciones entre documentación y runtime, se agregó fallback real a JSON, y el acceso restringido pasó a tomar `GOOGLE_CLIENT_ID` desde backend.
- Motivo: el proyecto mezclaba supuestos viejos (solo PostgreSQL, README desactualizado, Client ID hardcodeado) con comportamiento real distinto.
- Impacto funcional:
  - el sistema puede iniciar en modo `json`, `postgres` o `auto` sin inconsistencias.
  - el frontend público deja de depender de editar `frontend/js/auth.js` para configurar Google.
  - backup/import vuelve a conservar credenciales administrativas al restaurar.
  - el cPanel toma disciplinas desde la configuración servida por backend.
- Archivos modificados:
  - `backend/domain/constants.js`
  - `backend/persistence/index.js`
  - `backend/persistence/json-store.js`
  - `backend/persistence/index.test.js`
  - `backend/admin/auth.js`
  - `backend/admin/router.js`
  - `backend/admin/backup-utils.js`
  - `backend/server-standalone.js`
  - `frontend/js/auth.js`
  - `frontend/cpanel.html`
  - `scripts/ead-up.sh`
  - `.env.example`
  - `README.md`
  - `docs/funcionalidades-sistema.md`
  - `docs/reglas-negocio.md`
- Riesgos/consideraciones:
  - el modo JSON queda orientado a trabajo local y recuperación rápida; para operación sostenida se recomienda PostgreSQL.
  - los backups exportados ahora incluyen `passwordHash`; deben tratarse como material sensible.
- Validación:
  - `npm test`
  - revisión manual de arranque y consistencia documental
- Estado: `Validado`

## 2026-04-09 - Inicio de modularización del cPanel
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se extrajeron constantes y utilidades transversales del script inline de `cpanel.html` a un módulo compartido.
- Motivo: reducir acoplamiento del HTML, facilitar mantenimiento y preparar una extracción progresiva por dominios.
- Impacto funcional:
  - el cPanel mantiene el mismo comportamiento, pero ahora comparte en un archivo separado la infraestructura común.
  - se simplifica `frontend/cpanel.html` y queda listo para futuras extracciones de auth, carreras y usuarios.
- Archivos modificados:
  - `frontend/cpanel.html`
  - `frontend/js/cpanel-shared.js`
  - `README.md`
- Riesgos/consideraciones:
  - todavía queda lógica de pantallas y formularios dentro de `cpanel.html`; esta iteración no completa toda la modularización.
- Validación:
  - `node --check frontend/js/cpanel-shared.js`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - Extracción del módulo de carreras del cPanel
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se movió la lógica de gestión de carreras/cursos desde `frontend/cpanel.html` hacia `frontend/js/cpanel-careers.js`.
- Motivo: el formulario y listado de propuestas concentraban la mayor parte de la complejidad del cPanel y bloqueaban futuras mejoras.
- Impacto funcional:
  - se mantienen listados, formulario, WYSIWYG, documentos, estados y fallback por `413`.
  - `frontend/cpanel.html` queda significativamente más chico y enfocado en shell + módulos.
- Archivos modificados:
  - `frontend/cpanel.html`
  - `frontend/js/cpanel-careers.js`
  - `README.md`
- Riesgos/consideraciones:
  - la lógica de usuarios, configuración, logs y backup sigue inline; la modularización del cPanel todavía no está completa.
- Validación:
  - `node --check frontend/js/cpanel-careers.js`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - Extracción del módulo de usuarios del cPanel
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se movió la gestión de usuarios y los helpers de contraseñas/copiado desde `frontend/cpanel.html` hacia `frontend/js/cpanel-users.js`.
- Motivo: reducir el tamaño del script inline y separar el dominio de administración de usuarios del resto del panel.
- Impacto funcional:
  - se mantienen listado, alta, edición, activación/desactivación, reseteo de contraseña y eliminación definitiva.
  - las utilidades de visualización/copiadо de contraseñas quedan encapsuladas junto con el flujo de usuarios.
- Archivos modificados:
  - `frontend/cpanel.html`
  - `frontend/js/cpanel-users.js`
  - `README.md`
- Riesgos/consideraciones:
  - siguen inline los módulos de configuración, logs, backup y shell/auth del cPanel.
- Validación:
  - `node --check frontend/js/cpanel-users.js`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - Extracción de configuración, logs y backup del cPanel
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se movieron los bloques de configuración, auditoría y backup desde `frontend/cpanel.html` a módulos dedicados.
- Motivo: terminar de convertir `cpanel.html` en una shell liviana y desacoplar la lógica administrativa restante por responsabilidad.
- Impacto funcional:
  - se mantienen modo construcción, consulta de auditoría y export/import de propuestas y usuarios.
  - `frontend/cpanel.html` pasa a actuar casi exclusivamente como orquestador de módulos.
- Archivos modificados:
  - `frontend/cpanel.html`
  - `frontend/js/cpanel-config.js`
  - `frontend/js/cpanel-logs.js`
  - `frontend/js/cpanel-backup.js`
  - `README.md`
- Riesgos/consideraciones:
  - todavía quedan auth/shell inline en `cpanel.html`; ese sería el siguiente cierre lógico si se quiere completar la modularización.
- Validación:
  - `node --check frontend/js/cpanel-config.js`
  - `node --check frontend/js/cpanel-logs.js`
  - `node --check frontend/js/cpanel-backup.js`
  - `npm test`
- Estado: `Validado`

## 2026-04-09 - Cierre de modularización del cPanel con core separado
- Tipo: `Refactor`
- Módulo: `cPanel`
- Resumen: se movieron autenticación, shell, dashboard e inicialización del panel a `frontend/js/cpanel-core.js`.
- Motivo: completar la separación por módulos y eliminar la lógica inline restante de `frontend/cpanel.html`.
- Impacto funcional:
  - `frontend/cpanel.html` queda como plantilla shell con includes de módulos.
  - el estado compartido del panel pasa a vivir en el core y se inyecta a los módulos de carreras, usuarios, configuración, logs y backup.
- Archivos modificados:
  - `frontend/cpanel.html`
  - `frontend/js/cpanel-core.js`
  - `README.md`
- Riesgos/consideraciones:
  - cualquier futuro cambio de estado global del cPanel debe canalizarse por `cpanel-core.js` para mantener el desacople actual.
- Validación:
  - `node --check frontend/js/cpanel-core.js`
  - `npm test`
- Estado: `Validado`
