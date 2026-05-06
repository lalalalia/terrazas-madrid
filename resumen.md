# Proyecto: Terrazas con Sombra · Madrid

## Resumen
Web interactiva que muestra las 6.517 terrazas de Madrid sobre un mapa, con cálculo de sombras según fecha y hora.

---

## Estado actual

### ✅ Completado
- Web funcionando en local en `http://127.0.0.1:5500/index.html` mediante Live Server de VS Code
- Mapa oscuro (CartoDB Dark) con Leaflet.js
- 6.517 terrazas cargadas desde JSON, coordenadas convertidas de UTM zona 30N (EPSG:25830) a WGS84
- Cálculo solar real (algoritmo NOAA) según fecha, hora y latitud de Madrid
- Estimación masiva de sombra de edificio para todo el mapa al pulsar "Calcular"
- Consulta exacta al Catastro (API pública) al hacer clic en cada terraza individual
- 4 tipos de sombra con colores distintos: edificio+toldo, solo edificio, solo toldo/sombrilla, sin sombra
- Barra de filtros: por ubicación (acera / plaza / calle peatonal / bulevar) y por sombra propia (con/sin toldo o sombrilla)
- Popup con: nombre, calle, barrio, mesas, sillas, horario L-J y V-D, plantas del edificio, sol actual
- Slider de hora (6:00–22:00 en pasos de 30 min) + selector de fecha

### 🔲 Pendiente
- Publicar en GitHub Pages (bloqueado en el paso "Commit to main" — causa sin identificar)

---

## Estructura de ficheros

```
terrazas-madrid/
├── index.html          ← fichero único con toda la lógica
└── data/
    └── terrazas.json   ← censo de terrazas del Ayuntamiento de Madrid
```

---

## Datos

- **Fuente:** Censo de locales con terraza del Ayuntamiento de Madrid
- **Fichero original:** `200085-7-censo-locales.json`
- **Campos clave usados:**
  - `coordenada_x_local` / `coordenada_y_local` → UTM zona 30N
  - `ref_catastral` → para consultar altura del edificio al Catastro (5.981 de 6.517 tienen ref)
  - `sombrillas_es`, `toldos_pavimento_es` → sombra propia
  - `desc_ubicacion_terraza` → tipo de ubicación (Acera, Plaza peatonal, Calle peatonal, Bulevar…)
  - `desc_situacion_terraza` → Abierta / Suspension temporal
  - `rotulo`, `desc_vial_edificio`, `desc_barrio_local`, `mesas_es`, `sillas_es`
  - `hora_ini_LJ_es`, `hora_fin_LJ_es`, `hora_ini_VS_es`, `hora_fin_VS_es`

---

## Tecnologías

- **HTML + JS vanilla** — sin frameworks, sin build tools
- **Leaflet.js 1.9.4** — mapa interactivo (CDN)
- **CartoDB Dark** — tiles del mapa
- **API Catastro** → `OVCCallejeroCodigos.asmx/Consulta_DNPRC_Codigos` (CORS abierto, sin autenticación)
- **Google Fonts** — Syne (títulos) + DM Sans (texto)
- **Live Server** (extensión VS Code) — necesario para cargar el JSON local

---

## Lógica de sombras

### Cálculo solar
```javascript
// Posición del sol según fecha, hora decimal y coordenadas
function posicionSol(lat, lng, fecha, horaH)
// Devuelve: { alt (altitud °), az (azimut °), arriba (bool) }
```

### Sombra de edificio (estimación masiva)
```javascript
// Probabilidad de sombra según altitud solar
const probSombra = Math.max(0.05, Math.min(0.90, (55 - sol.alt) / 55));
// Hash determinista por id_terraza para resultado consistente
const hash = ((t.id_terraza * 2654435761) >>> 0) / 4294967295;
const se = hash < probSombra;
```

### Sombra de edificio (exacta, al hacer clic)
```javascript
// Consulta Catastro → obtiene número de plantas → calcula longitud de sombra proyectada
const h = plantas * 3;        // altura estimada: 3m por planta
const dist = 7;               // distancia media terraza-edificio (acera Madrid)
const sombra = h / Math.tan(altSol * Math.PI / 180);
return sombra >= dist;
```

### Sombra propia
```javascript
function sombraPropia(t) {
  return (t.sombrillas_es > 0) || (t.toldos_pavimento_es > 0) ||
         (t.sombrillas_ra > 0) || (t.toldos_pavimento_ra > 0) ||
         t.construccion_ligera_fachada_es === true ||
         t.construccion_ligera_bordillo_es === true;
}
```

---

## Colores del mapa

| Color | Hex | Significado |
|---|---|---|
| Verde oscuro | `#1A6B4A` | Sombra edificio + toldo/sombrilla |
| Verde claro | `#2EAA6E` | Solo sombra de edificio |
| Amarillo | `#B8960A` | Solo toldo o sombrilla propia |
| Naranja/rojo | `#C04010` | Sin ningún tipo de sombra |
| Gris | `#3B4455` | Sin calcular todavía |

---

## Entorno de la usuaria

- **SO:** Windows
- **Editor:** Visual Studio Code con extensión Live Server
- **Sin Python instalado**
- **Node.js instalado** (instaló Claude Code aunque no lo usa actualmente)
- **Sin experiencia en programación**
- **GitHub Desktop instalado** pero bloqueada en "Commit to main" (causa desconocida — siguiente paso a resolver)

---

## Próximos pasos sugeridos

1. **Resolver el problema de GitHub Desktop** para publicar en GitHub Pages
2. **Versión standalone** (opcional): meter el JSON dentro del HTML para que funcione sin Live Server con doble clic
3. **Mejoras posibles:**
   - Buscador de locales por nombre o calle
   - Filtro por horario (ej. "abiertas ahora")
   - Mejora del cálculo de sombra con datos reales de alturas (Overpass API por zonas)
   - Panel de estadísticas por barrio o distrito
