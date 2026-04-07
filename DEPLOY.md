# 🚀 Guía de Despliegue — EduVerse

Guía completa para llevar EduVerse a producción en **Railway** (recomendado) o **Render** (alternativa gratuita).

---

## 📋 Prerequisitos

- Cuenta en [GitHub](https://github.com) ✅
- Git instalado localmente ✅
- Node.js v18+ instalado ✅
- El proyecto funciona localmente (`npm start`) ✅

---

## 🚂 Opción A — Railway (Recomendado)

Railway es la opción más rápida. Detecta automáticamente Node.js, lee el `railway.toml` y despliega en minutos.

### Pricing
- **Free trial**: $5 de crédito al crear la cuenta (sin tarjeta)
- **Hobby plan**: ~$5/mes para proyectos pequeños
- **Usage-based**: ~$10–15/mes para una API con tráfico moderado

---

### Paso 1 — Subir el proyecto a GitHub

```bash
# Dentro de la carpeta eduverse/
git init
git add .
git commit -m "feat: initial EduVerse deploy"

# Crear repo en GitHub (necesitás la CLI de GitHub o hacerlo en github.com)
gh repo create eduverse --public --source=. --push

# O si ya tenés el repo creado manualmente:
git remote add origin https://github.com/TU_USUARIO/eduverse.git
git push -u origin main
```

---

### Paso 2 — Crear cuenta en Railway

1. Ir a **[railway.com](https://railway.com)**
2. Click en **"Start a New Project"**
3. Autenticarse con **GitHub** → "Authorize Railway"

---

### Paso 3 — Crear el proyecto

1. En el dashboard de Railway, click **"New Project"**
2. Seleccionar **"Deploy from GitHub repo"**
3. Buscar y seleccionar tu repositorio `eduverse`
4. Railway detecta automáticamente el `package.json` y el `railway.toml`

---

### Paso 4 — Variables de entorno (opcional)

En Railway → tu servicio → pestaña **"Variables"**, agregar:

| Variable | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` *(Railway lo maneja automáticamente)* |

> **Nota:** Railway inyecta `PORT` automáticamente, no es necesario setearlo.

---

### Paso 5 — Generar dominio público

1. Ir a tu servicio → pestaña **"Settings"**
2. Sección **"Networking"** → click **"Generate Domain"**
3. Tu app estará disponible en: `https://eduverse-production.up.railway.app`

---

### Paso 6 — Verificar el despliegue

```bash
# Verificar que la API responde
curl https://TU-DOMINIO.up.railway.app/api/health

# Respuesta esperada:
# {"status":"OK","env":"production","timestamp":"...","careers":20}
```

---

### CI/CD automático con Railway

Cada vez que hacés `git push` a `main`, Railway re-despliega automáticamente:

```bash
# Flujo de trabajo diario
git add .
git commit -m "feat: nueva funcionalidad"
git push origin main
# → Railway detecta el push y redespliega en ~1 min
```

---

### CLI de Railway (opcional pero útil)

```bash
# Instalar la CLI
npm install -g @railway/cli

# Autenticarse
railway login

# Linkear al proyecto existente
railway link

# Ver logs en tiempo real
railway logs

# Ejecutar comandos en el servidor remoto
railway run node -e "console.log('hola desde producción')"

# Ver variables de entorno
railway variables
```

---

## 🎨 Opción B — Render (Gratuito con limitaciones)

Render tiene un **plan gratuito permanente** pero el servidor se "duerme" tras 15 min de inactividad y tarda ~30s en despertar.

### Paso 1 — Subir a GitHub

```bash
git init && git add . && git commit -m "initial commit"
git remote add origin https://github.com/TU_USUARIO/eduverse.git
git push -u origin main
```

### Paso 2 — Crear servicio en Render

1. Ir a **[render.com](https://render.com)** → crear cuenta con GitHub
2. Click **"New +"** → **"Web Service"**
3. Conectar el repo `eduverse`
4. Completar el formulario:

| Campo | Valor |
|-------|-------|
| Name | `eduverse` |
| Region | `Oregon (US West)` o el más cercano |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | *(dejar vacío)* |
| Start Command | `node backend/server-standalone.js` |
| Plan | `Free` |

5. En **"Advanced"** → **"Add Environment Variable"**:
   - `NODE_ENV` = `production`

6. Click **"Create Web Service"**

### Paso 3 — Obtener la URL

Render asigna automáticamente: `https://eduverse.onrender.com`

> ⚠️ **Limitación del plan gratuito de Render:** el servidor se duerme tras 15 min sin requests. El primer request después puede tardar 30-60s. Para evitarlo, usá un servicio de "uptime monitoring" (UptimeRobot gratuito) que haga ping cada 10 min.

---

## 🐳 Opción C — Dockerfile (para VPS, Fly.io, etc.)

Si querés más control o usar un VPS propio (DigitalOcean, Linode, etc.):

```dockerfile
# Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "backend/server-standalone.js"]
```

```bash
# Construir y ejecutar localmente
docker build -t eduverse .
docker run -p 3000:3000 eduverse

# Subir a Docker Hub
docker tag eduverse TU_USUARIO/eduverse:latest
docker push TU_USUARIO/eduverse:latest
```

---

## 🔧 Checklist pre-deploy

Antes de desplegar, verificar:

- [ ] `npm start` funciona localmente sin errores
- [ ] `http://localhost:3000/api/health` devuelve `{"status":"OK"}`
- [ ] Todas las rutas de la SPA funcionan (home, búsqueda, detalle)
- [ ] El `.gitignore` incluye `node_modules/` y `.env`
- [ ] El `package.json` tiene el script `"start"` correcto

---

## 🩺 Monitoreo post-deploy

```bash
# Health check manual
curl https://TU-DOMINIO/api/health

# Test de la API
curl "https://TU-DOMINIO/api/careers?q=ingenieria&limit=3"

# Test de filtros
curl "https://TU-DOMINIO/api/careers?area=Tecnolog%C3%ADa&tipo=Grado"
```

---

## 🛣️ Roadmap post-deploy

Una vez que el proyecto esté en producción, los siguientes pasos naturales son:

1. **Dominio personalizado** — conectar `eduverse.tudominio.com` (Railway y Render lo soportan)
2. **MongoDB** — migrar `careers.json` a una base de datos real
3. **Autenticación** — login/registro con JWT
4. **Panel admin** — CRUD para gestionar carreras desde la UI
5. **Analytics** — integrar Plausible o similar

---

*Guía generada para EduVerse v1.0 — Marzo 2026*
