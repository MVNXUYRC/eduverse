# 🎓 EAD — Plataforma Educativa Universitaria

Aplicación web completa de educación a distancia con buscador avanzado de carreras, filtros combinados en tiempo real, y diseño dark mode moderno.

---

## 📁 Estructura del proyecto

```
ead/
├── backend/
│   ├── server-standalone.js   # Servidor principal (API pública + admin)
│   ├── admin/                 # Router admin, auth, backup
│   ├── persistence/           # PgStore, esquema SQL, config DB
│   ├── repositories/          # Repositorio de estado
│   ├── scripts/               # Migración e importación de datos
│   └── data/
│       └── db.json            # Dataset legado para import inicial
├── frontend/
│   ├── index.html             # SPA shell
│   ├── cpanel.html            # cPanel administrativo
│   ├── css/
│   │   └── styles.css         # Design system completo
│   └── js/
│       └── app.js             # Lógica, router, API client
├── docs/                      # Reglas de negocio y documentación funcional
├── package.json
└── README.md
```

---

## 🚀 Instalación y ejecución

### Requisitos
- Node.js v18 o superior
- npm v8 o superior
- PostgreSQL 14+ (recomendado)

### Pasos

```bash
# 1. Clonar o descomprimir el proyecto
cd ead

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# editar .env.local con credenciales PostgreSQL

# 4. Crear esquema en PostgreSQL
npm run db:migrate

# 5. (opcional, primera vez) importar datos seed desde JSON legado
npm run db:seed

# 6. Iniciar en modo producción
npm start

# O en modo desarrollo (con hot reload)
npm run dev
```

El servidor estará disponible en: **http://localhost:3000**

### Arranque diario (recomendado)

Para empezar a trabajar rápidamente cada vez que prendés la PC:

```bash
# Levantar proyecto en background (modo desarrollo)
./scripts/ead-up.sh dev

# Ver estado
./scripts/ead-status.sh

# Detener proyecto
./scripts/ead-down.sh
```

Si querés que se inicie automáticamente al iniciar sesión en Linux:

```bash
./scripts/install-autostart-linux.sh
```

---

## 🔌 API REST

### Base URL
```
http://localhost:3000/api
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/careers` | Lista y busca carreras con filtros |
| GET | `/api/careers/featured` | Carreras populares, nuevas y áreas |
| GET | `/api/careers/filters` | Opciones de filtro disponibles |
| GET | `/api/careers/:id` | Detalle de una carrera por ID |
| GET | `/api/health` | Estado del servidor |

### Parámetros de búsqueda (`GET /api/careers`)

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `q` | string | Búsqueda por texto (nombre, descripción, institución) |
| `tipo` | string | Pregrado, Grado, Posgrado (separados por coma) |
| `area` | string | Área de conocimiento (separados por coma) |
| `modalidad` | string | Online, Híbrido (separados por coma) |
| `page` | number | Página actual (default: 1) |
| `limit` | number | Resultados por página (default: 12) |
| `sort` | string | `nombre` o `area` |

### Ejemplos

```bash
# Buscar carreras de tecnología online
GET /api/careers?area=Tecnología&modalidad=Online

# Buscar posgrados con "data"
GET /api/careers?q=data&tipo=Posgrado

# Múltiples filtros combinados
GET /api/careers?tipo=Grado,Posgrado&area=Ingeniería&sort=nombre

# Paginación
GET /api/careers?page=2&limit=6
```

---

## 🎨 Funcionalidades implementadas

### Frontend
- ✅ SPA con router client-side (sin recargas)
- ✅ Landing page con hero section, búsqueda y estadísticas
- ✅ Secciones: carreras populares, áreas más buscadas, nuevas ofertas
- ✅ Buscador con debounce (350ms)
- ✅ Filtros combinados en tiempo real
- ✅ Chips de filtros activos con botón de remoción
- ✅ Ordenamiento por nombre y área
- ✅ Paginación
- ✅ Estados: loading (skeleton), sin resultados, error
- ✅ Página de detalle completa (plan de estudios, requisitos, CTA)
- ✅ Diseño responsive mobile-first
- ✅ Tema oscuro moderno (CSS variables)
- ✅ Animaciones y micro-interacciones

### Backend
- ✅ API REST con Express
- ✅ Búsqueda full-text (nombre, descripción, institución, área)
- ✅ Filtros múltiples combinables
- ✅ Paginación server-side
- ✅ Manejo de errores
- ✅ CORS habilitado
- ✅ Servicio de archivos estáticos integrado

---

## 📊 Datos incluidos (20 carreras)

| Área | Cantidad |
|------|----------|
| Tecnología | 5 |
| Ingeniería | 5 |
| Salud | 4 |
| Ciencias Sociales | 4 |
| Negocios | 3 |

| Tipo | Cantidad |
|------|----------|
| Grado | 10 |
| Pregrado | 6 |
| Posgrado | 4 |

---

## 🔧 Variables de entorno (PostgreSQL)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 3000 | Puerto del servidor |
| `DATABASE_URL` | _(vacío)_ | Cadena de conexión PostgreSQL completa (prioritaria) |
| `DB_HOST` | _(vacío)_ | Host PostgreSQL (alternativa a DATABASE_URL) |
| `DB_PORT` | 5432 | Puerto PostgreSQL |
| `DB_NAME` | _(vacío)_ | Nombre de base |
| `DB_USER` | _(vacío)_ | Usuario PostgreSQL |
| `DB_PASSWORD` | _(vacío)_ | Contraseña PostgreSQL |
| `PGSSL_DISABLE` | `false` | Si es `true`, desactiva SSL al conectar a PostgreSQL |
| `ADMIN_JWT_SECRET` | _(obligatoria en producción)_ | Clave fuerte para firmar JWT del cPanel |
| `ROOT_PASSWORD` | _(obligatoria para root)_ | Contraseña del usuario root del cPanel |

## 🗄️ Persistencia (PostgreSQL principal)

La aplicación usa PostgreSQL como backend de persistencia principal para todo CRUD y lectura.
El contrato JSON de respuesta de la API pública/admin se mantiene.

### Esquema SQL inicial

Archivo: `backend/persistence/schema.sql`

Incluye tablas para:
- carreras (`careers`) + relaciones (`career_units`, `career_tags`, `career_speakers`, `career_documents`)
- usuarios (`users_admin`)
- configuración (`app_config`)
- auditoría (`audit_logs`)
- catálogos/lookup (`lookup_values`)

### Comandos de migración local

```bash
# 1) Definir variables en .env.local (DATABASE_URL o DB_*)

# 2) Aplicar esquema
npm run db:migrate

# 3) Importar datos iniciales desde JSON legado (una sola vez)
npm run db:import

# 4) Levantar app
npm run dev
```

### Notas de migración desde JSON
- `backend/data/db.json` queda como dataset legado para bootstrap/migración.
- El runtime de la app no usa JSON como store principal.

## 🔐 Seguridad de cPanel

- El acceso al cPanel usa correo + contraseña.
- Solo ingresan usuarios previamente cargados en `usuarios` y activos.
- En producción, `ADMIN_JWT_SECRET` debe estar definido; si falta, el servidor no inicia.
- `ROOT_PASSWORD` define la contraseña del usuario root.
- El enlace al cPanel no aparece en el navbar público por defecto.

### Backup (compatibilidad)

- `GET /admin/api/backup/export` mantiene `carreras` y `usuarios` y ahora también puede incluir:
  `config`, `auditLog`, `unidadesAcademicas`, `regionales`, `localidades`, `disciplinas`,
  `tiposDocumento`, `organismos`.
- `POST /admin/api/backup/import` sigue aceptando backups viejos (solo `carreras`/`usuarios`)
  y restaura también esos campos adicionales cuando están presentes.

---

## 🛣️ Roadmap / Extensiones sugeridas

- [ ] Autenticación de usuarios (JWT)
- [ ] Guardar carreras favoritas
- [ ] Formulario de preinscripción real
- [ ] Panel de administración de carreras (CRUD)
- [ ] Optimizar búsquedas SQL con índices trigram/full-text
- [ ] Deploy en Railway / Render / Vercel
- [ ] PWA (Service Worker + offline mode)
- [ ] i18n (internacionalización)

---

## 📄 Licencia

MIT © 2025 EAD
