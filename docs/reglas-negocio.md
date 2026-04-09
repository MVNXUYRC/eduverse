# Reglas de Negocio

Este documento resume las reglas funcionales y operativas vigentes del sistema EAD (UNaM), según el comportamiento implementado en backend y frontend.

## 1) Dominio y entidades

## 1.1 Carrera/Curso
- Una propuesta académica puede ser `Carrera` o `Curso` (`esCurso` booleano).
- Campos principales: nombre, tipo, subtipo, disciplina, modalidad, duración, descripción, requisitos, programa, unidad/es académica/s, regional, estado de actividad, estado de inscripción, documentación y metadatos.
- Documentación institucional por propuesta:
  - `planEstudiosPDF` (archivo principal para carreras).
  - `documentos[]` (múltiples entradas con tipo, organismo, número, año y PDF opcional).

## 1.2 Usuario administrativo
- Roles: `root`, `institucional`, `unidades`.
- Jerarquía: `root > institucional > unidades`.
- `root` tiene privilegios globales.
- `institucional` administra usuarios y carreras.
- `unidades` administra carreras de sus unidades asignadas.

## 1.3 Configuración de sistema
- Incluye, entre otros:
  - `acceso_publico` (sitio abierto/restringido).
  - `sitio_en_construccion` e imagen asociada.
  - catálogos (`unidadesAcademicas`, `regionales`, `tiposDocumento`, `organismos`, etc.).

## 2) Reglas de autenticación y seguridad

## 2.1 Acceso a cPanel
- Login por correo + contraseña.
- Usuario debe existir y estar activo (o root con contraseña raíz).
- Se aplica rate-limit por intentos fallidos:
  - Máximo 5 intentos.
  - Bloqueo temporal de 15 minutos.
- Login exitoso registra evento en auditoría (`LOGIN`) con IP de origen.

## 2.2 Tokens y sesión
- API admin protegida con JWT firmado por `ADMIN_JWT_SECRET`.
- En producción, `ADMIN_JWT_SECRET` es obligatorio.
- TTL de token: 8 horas.

## 2.3 Endurecimiento de contenido
- Sanitización de texto y HTML enriquecido.
- Bloqueo de scripts, iframes embebidos y atributos peligrosos en campos ricos.
- Subidas de documentación restringidas a PDF válido (extensión, MIME, firma `%PDF-`).

## 3) Reglas de autorización por rol

## 3.1 Gestión de usuarios
- `root` puede crear/editar/eliminar (incluido hard delete) usuarios no-root.
- `institucional` puede gestionar usuarios de menor jerarquía según matriz de creación.
- No se puede eliminar/modificar root como usuario común.

## 3.2 Gestión de carreras
- `root` e `institucional`: alcance global.
- `unidades`: solo carreras cuya/s unidad/es intersectan con sus unidades asignadas.
- En operaciones de edición/eliminación se valida permiso por unidad académica.

## 4) Reglas académicas

## 4.1 Tipos y restricciones
- Si la propuesta contiene la unidad `Educación a Distancia`, solo se permite `Curso`.
- Para `Curso`:
  - `tipo` se fuerza a `Curso`.
  - `programa` y `formularioInscripcion` son relevantes.
- Para `Carrera`:
  - `planEstudiosPDF` aplica como documento de plan.

## 4.2 Regional
- Se autocalcula desde la unidad académica principal mediante tabla de mapeo.
- Si la unidad no está en el mapeo, se usa valor recibido.

## 5) Estados de visibilidad e inscripción

## 5.1 Modelo de estado
- Estados normalizados como objeto:
  - `{ valor: boolean, fechaHasta: string|null }`
- Evaluación activa:
  - `valor` debe ser true.
  - si hay `fechaHasta`, vence al final del día cuando formato es `YYYY-MM-DD`.

## 5.2 Regla de coherencia
- Si una propuesta se desactiva (`activo=false`), inscripción se cierra automáticamente.
- En frontend, propuesta inactiva se muestra como finalizada.

## 6) Reglas de documentación

## 6.1 Carga y asociación
- Los archivos se guardan en:
  - `frontend/uploads/planes` para plan de estudios.
  - `frontend/uploads/resoluciones` para documentos administrativos.
- Cada `documentos[i]` puede recibir PDF por campo `doc_pdf_i` en multipart.
- Al guardar, cada documento mantiene metadatos y URL de PDF asociada.

## 6.2 Límites de tamaño
- Máximo 20 MB por archivo.
- Máximo 50 MB por request admin.
- Ante `413`, el frontend usa flujo de recuperación:
  - guarda propuesta en modo liviano (sin binarios),
  - luego sube adjuntos por pasos para asegurar asociación.

## 7) Reglas de publicación y consulta pública

## 7.1 API pública
- Devuelve carreras y cursos para búsqueda y detalle.
- Incluye campos enriquecidos y saneados para render:
  - `_activo`, `_inscripcionAbierta`, `documentos`, `planEstudiosPDF`, etc.

## 7.2 Filtros
- Búsqueda por texto + filtros combinables (tipo, subtipo, disciplina, modalidad, unidad, regional, estado, inscripción).
- Paginación y ordenamiento.

## 7.3 Visibilidad en interfaz
- La documentación asociada debe verse:
  - en pestaña de `Documentación`,
  - y también en contexto de `Requisitos` (si hay documentos cargados),
  - y en el detalle al acceder desde resultados de índice/búsqueda.

## 8) Reglas de auditoría y trazabilidad

- Se registran acciones administrativas críticas (`CREAR`, `EDITAR`, `BAJA`, `ELIMINAR`, `IMPORT`, `EXPORT`, `LOGIN`).
- Solo `root` puede consultar o limpiar auditoría.
- Se mantiene ventana de hasta 500 registros.

## 9) Reglas de backup/restore

- Exporta dataset funcional (carreras, usuarios, config, auditoría, catálogos).
- Import soporta compatibilidad con backups legacy y actuales.
- Solo `root` puede importar/exportar.

## 10) Persistencia

- Modo JSON (sin `DATABASE_URL`) o PostgreSQL (con `DATABASE_URL`).
- Contrato API se mantiene estable entre modos.
- En modo PostgreSQL se normaliza a tablas relacionales y se remapea al objeto de dominio.

## 11) No funcionales relevantes

- Integridad de archivos por validación de PDF.
- Sanitización de HTML para evitar XSS.
- Encabezados de seguridad HTTP.
- Visor PDF en frontend soportado por `pdfjs-dist` con worker local y fallback de apertura en pestaña nueva.
