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
