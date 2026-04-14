# Funcionalidades del Sistema (Descripción Pormenorizada)

Este documento describe, de forma funcional y técnica, qué hace hoy el sistema EAD y cómo se conectan sus módulos.

## 1) Vista general

La plataforma ofrece dos grandes superficies:
- Sitio público (índice/buscador/detalle de propuestas).
- cPanel administrativo (ABM de carreras/usuarios/configuración y operación del sistema).

Arquitectura principal:
- Backend Node.js (`backend/server-standalone.js`) con API pública y API admin.
- Frontend SPA público (`frontend/index.html` + `frontend/js/app.js`).
- Frontend cPanel (`frontend/cpanel.html`).
- Persistencia con selección automática:
  - PostgreSQL si hay configuración DB disponible o `PERSISTENCE_MODE=postgres`.
  - JSON legado si `PERSISTENCE_MODE=json` o si `PERSISTENCE_MODE=auto` sin configuración DB.

## 2) Módulo público (índice y detalle)

## 2.1 Home/landing
- Muestra bloques destacados: cursos, nuevas propuestas, disciplinas y métricas.
- Permite entrada por búsqueda general y navegación por categorías.

## 2.2 Búsqueda avanzada de oferta
- Endpoint principal: `GET /api/careers`.
- Filtros combinados:
  - texto (`q`),
  - tipo/subtipo,
  - disciplina,
  - modalidad,
  - unidad académica,
  - regional,
  - estado (`activo`),
  - inscripción abierta.
- Incluye paginación y ordenamiento.
- UI con debounce, chips de filtros activos, estados de carga/empty/error.

## 2.3 Detalle de propuesta
- Endpoint: `GET /api/careers/:id`.
- Tabs principales:
  - Descripción.
  - Requisitos.
  - Plan/Programa.
  - Documentación.
  - Inscripción (si corresponde).
- Documentación asociada:
  - Plan de estudios PDF (visor basado en `pdfjs-dist`).
  - Documentación administrativa (`documentos[]` con enlaces PDF).
- La documentación también se presenta en contexto de requisitos para mejorar trazabilidad funcional.

## 2.4 Visor PDF
- Implementado con `pdfjs-dist` local (sin dependencia de visor del navegador).
- Funciones:
  - render por canvas,
  - paginación,
  - zoom,
  - modo expandido,
  - fallback de apertura en nueva pestaña.

## 3) Módulo de autenticación pública

- Endpoint `POST /api/auth/verify` para validación de acceso (modo restringido).
- Puede validar contra allow-list estática y usuarios activos en base.
- Endpoint `GET /api/access-mode` informa estado de acceso público y sitio en construcción.
- En modo restringido, el frontend usa Google Identity Services y toma `GOOGLE_CLIENT_ID` desde la respuesta de `GET /api/access-mode`.

## 4) cPanel administrativo

## 4.1 Autenticación y sesión
- Login por usuario técnico o correo + contraseña (`/admin/api/auth/login`).
- `root` ingresa con un `login` técnico configurable, sin requerir exponer su correo como credencial de acceso.
- Perfil (`/admin/api/auth/me`), logout, cambio de contraseña.
- Protección por JWT y controles por rol.

## 4.2 Gestión de carreras/cursos (ABM)
- Alta, edición, activación/finalización y eliminación (soft/hard según rol).
- Soporte de carreras interinstitucionales (múltiples unidades académicas).
- Campos de contenido enriquecido:
  - descripción,
  - requisitos,
  - programa (cursos),
  - tags/disertantes.
- Carga documental:
  - `planEstudiosPDF`,
  - múltiples documentos administrativos con metadatos y PDF.

## 4.3 Flujo de guardado robusto (incluye recuperación de 413)
- Primer intento: request normal (multipart si hay archivos).
- Si hay `HTTP 413`:
  - guarda modo liviano (sin binarios nuevos),
  - sube adjuntos en pasos para completar asociación sin perder vínculo.
- Evita inconsistencias en carreras nuevas con documentación pesada.

## 4.4 Gestión de usuarios administrativos
- Cada usuario administrativo posee un `login` único además del correo institucional.
- CRUD con reglas de rol.
- Reactivación/desactivación.
- Reset/cambio de contraseña.
- Registro de último acceso.

## 4.5 Configuración operativa
- Activar/desactivar acceso público.
- Activar/desactivar “sitio en construcción”.
- Configurar imagen de construcción.
- Gestión de catálogos de soporte.

## 4.6 Auditoría y backup
- Auditoría de acciones críticas (incluye inicios de sesión).
- Export/import de backup completo.
- Las vistas funcionales de auditoría y los backups exportados reemplazan el correo del `root` por su identidad técnica (`ROOT_LOGIN`).
- Limpieza de logs (solo root).

## 5) API y contratos funcionales

## 5.1 API pública
- `GET /api/health`
- `GET /api/access-mode`
- `POST /api/auth/verify`
- `GET /api/careers`
- `GET /api/careers/featured`
- `GET /api/careers/filters`
- `GET /api/careers/:id`

## 5.2 API admin (prefijo `/admin/api`)
- Auth: login, me, logout, change-password.
- Usuarios: listado/alta/edición/baja.
- Carreras: listado/detalle/alta/edición/patch estado/baja.
- Configuración, auditoría, backup.

## 6) Persistencia y modo de ejecución

## 6.1 Modo JSON
- Fuente principal: `backend/data/db.json` o `JSON_DB_PATH`.
- Útil para desarrollo rápido, recuperación local o arranque sin base.

## 6.2 Modo PostgreSQL
- Activado al definir `DATABASE_URL`, `DB_*` o `PERSISTENCE_MODE=postgres`.
- Esquema normalizado con tablas de carreras, documentos, usuarios, auditoría y catálogos.
- Se reconstruye objeto de dominio para mantener contrato API estable.

## 7) Seguridad y validaciones

- Sanitización de HTML/texto para prevenir XSS.
- Restricción de subida a PDFs válidos.
- Límites:
  - 20 MB por archivo.
  - 50 MB por request admin.
- Controles de autorización por rol/unidad.
- Encabezados de seguridad HTTP en respuestas.

## 8) Flujos críticos (end-to-end)

## 8.1 Alta de carrera nueva con documentación
1. Admin completa formulario en cPanel.
2. Se envían metadatos + archivos.
3. Backend crea carrera y guarda rutas de archivos.
4. API pública devuelve carrera enriquecida con `documentos` y `planEstudiosPDF`.
5. Índice/detalle renderizan requisitos y documentación asociada.

## 8.2 Consulta desde índice
1. Usuario busca en listado.
2. Abre detalle de carrera.
3. Visualiza requisitos y documentación desde tabs correspondientes.
4. Puede abrir PDFs en visor o en nueva pestaña.

## 9) Operación diaria recomendada

- Levantar:
  - `./scripts/ead-up.sh dev` o `./scripts/ead-up.sh prod`
- Ver estado:
  - `./scripts/ead-status.sh`
- Bajar:
  - `./scripts/ead-down.sh`

## 10) Contexto para futuras iteraciones

Puntos a priorizar si se extiende el sistema:
- Consolidar documentación técnica de endpoints admin por payload real.
- Agregar más tests de integración para flujo cPanel -> API pública.
- Añadir observabilidad de eventos funcionales (errores 413, asociaciones incompletas, fallos de render PDF).
- Definir versionado de contrato API para integraciones externas.
t