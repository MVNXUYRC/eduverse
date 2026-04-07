# 🎓 EduVerse — Plataforma Educativa Universitaria

Aplicación web completa de educación a distancia con buscador avanzado de carreras, filtros combinados en tiempo real, y diseño dark mode moderno.

---

## 📁 Estructura del proyecto

```
eduverse/
├── backend/
│   ├── server.js              # Servidor Express principal
│   ├── routes/
│   │   └── careers.js         # API REST: búsqueda y filtros
│   └── data/
│       └── careers.json       # Base de datos simulada (20 carreras)
├── frontend/
│   ├── index.html             # SPA shell
│   ├── css/
│   │   └── styles.css         # Design system completo
│   └── js/
│       └── app.js             # Lógica, router, API client
├── package.json
└── README.md
```

---

## 🚀 Instalación y ejecución

### Requisitos
- Node.js v18 o superior
- npm v8 o superior

### Pasos

```bash
# 1. Clonar o descomprimir el proyecto
cd eduverse

# 2. Instalar dependencias
npm install

# 3. Iniciar en modo producción
npm start

# O en modo desarrollo (con hot reload)
npm run dev
```

El servidor estará disponible en: **http://localhost:3000**

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

## 🔧 Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 3000 | Puerto del servidor |

---

## 🛣️ Roadmap / Extensiones sugeridas

- [ ] Autenticación de usuarios (JWT)
- [ ] Guardar carreras favoritas
- [ ] Formulario de preinscripción real
- [ ] Panel de administración de carreras (CRUD)
- [ ] Migración a MongoDB
- [ ] Deploy en Railway / Render / Vercel
- [ ] PWA (Service Worker + offline mode)
- [ ] i18n (internacionalización)

---

## 📄 Licencia

MIT © 2025 EduVerse
