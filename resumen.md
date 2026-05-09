# Proyecto: Terrazas con Sombra · Madrid

## Resumen
Web interactiva que muestra las 6.517 terrazas de Madrid sobre un mapa, con cálculo de sombras según fecha y hora.

---

## Estado actual

### ✅ Completado
- Web funcionando en local en `http://127.0.0.1:5500/index.html` mediante Live Server de VS Code
- Mapa claro (CartoDB Light) con Leaflet.js
- 6.517 terrazas cargadas desde JSON, coordenadas convertidas de UTM zona 30N (EPSG:25830) a WGS84
- Cálculo solar real según fecha, hora y latitud de Madrid, con corrección de timezone (UTC+1/+2 España)
- Estimación masiva de sombra (heurística rápida) para todo el mapa al pulsar "Calcular"
- **Cálculo exacto por ray casting con edificios OSM** al hacer clic en cada terraza
- 4 tipos de sombra con colores distintos: edificio, toldo/sombrilla, edificio+toldo, sin sombra
- Buscador de locales por nombre o calle (dropdown con resultados)
- Popup con: nombre, calle, barrio, mesas, sillas, horario L-J y V-D, altura del edificio (OSM), posición solar
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
  - `ref_catastral` → ya no se usa para sombras (se usaba antes con la API del Catastro)
  - `sombrillas_es`, `toldos_pavimento_es` → sombra propia
  - `desc_ubicacion_terraza` → tipo de ubicación (Acera, Plaza peatonal, Calle peatonal, Bulevar…)
  - `desc_situacion_terraza` → Abierta / Suspensión temporal
  - `rotulo`, `desc_vial_edificio`, `desc_barrio_local`, `mesas_es`, `sillas_es`
  - `hora_ini_LJ_es`, `hora_fin_LJ_es`, `hora_ini_VS_es`, `hora_fin_VS_es`

---

## Tecnologías

- **HTML + JS vanilla** — sin frameworks, sin build tools
- **Leaflet.js 1.9.4** — mapa interactivo (CDN)
- **CartoDB Light** — tiles del mapa
- **Overpass API** → edificios OSM en radio de 80m por terraza (`[building]`, `out geom`)
  - Endpoint principal: `overpass-api.de`
  - Fallback: `overpass.karte.mi.it`
- **Google Fonts** — Syne (títulos) + DM Sans (texto)
- **Live Server** (extensión VS Code) — necesario para cargar el JSON local

---

## Lógica de sombras

### Cálculo solar

```javascript
// Recibe hora en UTC (se resta el offset UTC+1/+2 de España al llamar)
function posicionSol(lat, lng, fecha, horaUTC)
// Devuelve: { alt (altitud °), az (azimut °), arriba: alt > 3° }

// Corrección de timezone española (UTC+2 verano, UTC+1 invierno)
function offsetUTC(fecha)
// En calcular(): posicionSol(..., hora - offsetUTC(fecha))
```

El algoritmo de posición solar usa declinación, ecuación del tiempo y ángulo horario con fórmulas esféricas.

### Sombra de edificio — estimación masiva al pulsar Calcular

No consulta edificios reales. Es una heurística rápida para pintar el mapa inicial:

```javascript
const prob = Math.max(0.05, Math.min(0.90, (55 - sol.alt) / 55));
const hash = ((t.id_terraza * 2654435761) >>> 0) / 4294967295;
const se = hash < prob; // resultado determinista pero aproximado
```

Esto marca el resultado como `estimado: true`. Al hacer clic en la terraza, se lanza el cálculo exacto.

### Sombra de edificio — cálculo exacto por ray casting (OSM)

Al hacer clic en una terraza:

1. **Consulta Overpass** por todos los edificios en radio 80m alrededor de la terraza:
   ```
   way(around:80,lat,lng)[building]; out geom;
   ```
2. **Altura del edificio** según prioridad:
   - Tag `height` en OSM (metros exactos)
   - Tag `building:levels` × 3.2 m
   - Fallback: 10 m
3. **Excluye el propio edificio** de la terraza mediante test punto-en-polígono (`_pip`)
4. **Ray casting**: lanza un rayo desde la terraza en la dirección del sol (azimut)
   ```javascript
   // Dirección hacia el sol en coordenadas locales (metros)
   dx = sin(azimut), dy = cos(azimut)
   ```
5. **Para cada edificio** que intersecta el rayo a distancia `t` metros:
   ```javascript
   // El edificio bloquea el sol si su sombra llega a la terraza:
   sombra = altura_edificio > t * tan(altitud_solar)
   ```
6. Cachea resultados por coordenada en `_osmCache` para no repetir consultas.

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
| Verde | `#00A86B` | Sombra de edificio (con o sin toldo) |
| Naranja | `#E8A820` | Solo toldo o sombrilla propia |
| Rojo | `#D93B1A` | Sin ningún tipo de sombra (al sol pleno) |
| Gris | `#C0B0A0` | Sin calcular todavía |

---

## Bugs corregidos

| Bug | Causa | Solución |
|---|---|---|
| Sombra incorrecta (todo verde a las 19h verano) | `posicionSol` recibía hora local española pero la trataba como UTC → sol calculado 2h después de su posición real | Restar `offsetUTC(fecha)` (1 o 2 según época) antes de llamar a `posicionSol` |
| 504 Gateway Timeout en consultas OSM | Servidor público `overpass-api.de` sobrecargado | Añadido fallback a `overpass.karte.mi.it` |
| Falso positivo: propio edificio contaba como bloqueador | El polígono del edificio de la terraza intersectaba el rayo | Test punto-en-polígono para excluir el edificio que contiene la terraza |
| Fórmula de sombra ignoraba dirección del sol | La fórmula original solo usaba altitud, no azimut; consultaba el propio edificio de la terraza en vez de los vecinos | Reemplazada por ray casting con footprints reales de OSM |

---

## Entorno de la usuaria

- **SO:** Windows
- **Editor:** Visual Studio Code con extensión Live Server
- **Sin Python instalado**
- **Node.js instalado** (instaló Claude Code)
- **Sin experiencia en programación**
- **GitHub Desktop instalado** pero bloqueada en "Commit to main" (causa desconocida — siguiente paso a resolver)

---

## Próximos pasos sugeridos

1. **Resolver el problema de GitHub Desktop** para publicar en GitHub Pages
2. **Mejorar el cálculo en batch**: actualmente la estimación masiva es una heurística aleatoria. Se podría hacer un pre-fetch de edificios por zonas visibles del mapa para calcular con OSM sin esperar al clic.
3. **Versión standalone** (opcional): meter el JSON dentro del HTML para que funcione sin Live Server
4. **Mejoras posibles:**
   - Filtro por horario (ej. "abiertas ahora")
   - Panel de estadísticas por barrio o distrito
   - Indicar cuántos minutos de sol quedan (stepping temporal)
