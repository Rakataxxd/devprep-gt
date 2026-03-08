# DevPrep GT

La primera plataforma de preparacion para entrevistas tecnicas disenada para developers guatemaltecos. IA personalizada, simulacros reales y entrenamiento al estilo Duolingo.

> Desarrollado en el **Hackathon de Cursor Guatemala 2025** 🇬🇹

---

## Que hace c:

- **Documento de preparacion personalizado** — Sube tu CV y recibe una guia 100% basada en tu perfil: pitch, stack, proyectos, salario en quetzales y mas.
- **Simulacion de entrevista** — Practica con Marcos Fuentes, un entrevistador IA con 8 anos de experiencia en el mercado tech guatemalteco.
- **Entrenamiento Duolingo-style** — Quiz con vidas, estrellas y XP en 6 areas tecnicas.
- **Historial de progreso** — Guarda todas tus sesiones y monitorea tu mejora.

---

## Como correrlo en tu computadora

### Requisitos

- Cuenta gratuita en [Groq](https://console.groq.com) para obtener tu API key
- Cuenta gratuita en [Supabase](https://supabase.com) para la base de datos y el proxy
- Un navegador (Chrome recomendado)

---

### Paso 1 — Clona el repositorio

```bash
git clone https://github.com/Rakataxxd/devprep-gt.git
cd devprep-gt
```

---

### Paso 2 — Crea tu proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto nuevo
2. En **Project Settings → API** copia:
   - `Project URL`
   - `anon public` key
3. Abre `app.js` y reemplaza estas dos lineas al inicio:

```js
const SUPABASE_URL = 'TU_PROJECT_URL';
const SUPABASE_KEY = 'TU_ANON_KEY';
```

---

### Paso 3 — Crea la Edge Function (proxy de Groq)

1. En Supabase → **Edge Functions** → **Deploy a new function → Via Editor**
2. Nombre: `groq-proxy`
3. Pega el contenido de `supabase/functions/groq-proxy/index.ts`
4. Deploy
5. En la configuracion de la funcion, **desactiva JWT verification**

---

### Paso 4 — Agrega tu API key de Groq como secreto

1. Crea tu API key gratuita en [console.groq.com](https://console.groq.com)
2. En Supabase → **Edge Functions → Secrets → Add secret**
   - Name: `GROQ_KEY`
   - Value: tu key de Groq

---

### Paso 5 — Corre la app

No necesitas instalar nada. Simplemente abre `index.html` en Chrome:

```
Doble click en index.html
```

O si prefieres un servidor local:

```bash
python -m http.server 3000
# luego abre http://localhost:3000
```

---

### Paso 6 — Crea tu cuenta

Al abrir la app, registrate con tu correo. Todo queda guardado en tu Supabase.

---

## Stack tecnico

| Capa | Tecnologia |
|------|-----------|
| Frontend | HTML + CSS + JavaScript vanilla |
| IA | Groq API (llama-3.3-70b-versatile) |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Proxy seguro | Supabase Edge Functions (Deno) |
| Servidor | Ninguno — corre directo en el navegador |

---

## Estructura de archivos

```
devprep-gt/
├── index.html                          # Toda la UI
├── styles.css                          # Dark mode + estilos
├── app.js                              # Logica de la app
└── supabase/
    └── functions/
        └── groq-proxy/
            └── index.ts               # Proxy seguro para Groq API
```

---

## Contribuidores

- [@Rakataxxd](https://github.com/Rakataxxd)
- [@jcano-2024386](https://github.com/jcano-2024386)

---

## Licencia

MIT
