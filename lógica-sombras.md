# Lógica de cálculo de sombras

## Los dos sistemas de sombra

Hay dos sistemas que coexisten. Es importante entenderlos para que el comportamiento tenga sentido.

---

### Al pulsar "Calcular" → puntitos de colores sin haber clickado nada

No se consulta Overpass en absoluto. Para cada terraza se calcula una **probabilidad estadística** basada solo en la altura del sol:

```js
prob = max(0.05, min(0.90, (55 - alt) / 55))
```

Si el sol está a 10° de altura → `prob = 0.82` (82% de terrazas serán "en sombra"). Si está a 40° → `prob = 0.27`.

Luego se usa el ID de la terraza como semilla pseudo-aleatoria:
```js
hash = ((id * 2654435761) >>> 0) / 4294967295
se = hash < prob
```

El hash es **determinista**: la misma terraza siempre cae en el mismo lado. Pero es completamente inventado — no sabe nada de los edificios reales. Es solo para que los colores parezcan plausibles mientras no se ha hecho ningún click.

Esto se guarda como `estimado: true`.

---

### Al hacer click → "edificio: X m (OSM)" y resultado exacto

Aquí sí se lanza la consulta real a Overpass. El proceso:

1. **Descarga edificios** en un radio dinámico alrededor de la terraza (80–250m según altitud solar)
2. **Lanza un rayo** desde la terraza en la dirección del sol
3. **Por cada edificio** que ese rayo cruza, comprueba si es suficientemente alto para tapar el sol: `edificio.altura > distancia × tan(altitud_solar)`
4. `alturaMax` es la altura del edificio más alto que el rayo cruza (aunque no tape el sol)

Si encuentra un edificio que sí tapa → **verde**, sombra de edificio, muestra `"X m (OSM)"`.
Si no encuentra ninguno → **rojo**, pleno sol, muestra `"—"`.

El resultado se guarda como `estimado: false` y ya no vuelve a consultar Overpass para esa terraza.

---

### Al hacer click → se queda rato en "Consultando…" aunque la tarjeta ya diga sol/sombra

Aquí es donde los dos sistemas se solapan y puede resultar confuso.

Lo que ves en la tarjeta **al primer instante** es el resultado estimado (el de la probabilidad estadística). El estado `"Consultando…"` en el campo "Edificio" indica que Overpass **todavía está respondiendo**.

El popup se renderiza dos veces:
- **Render 1** (inmediato): usa `estimado: true` → muestra color y estado heredado del cálculo estadístico, campo Edificio = `"Consultando…"`
- **Render 2** (cuando Overpass responde): usa `estimado: false` → actualiza color, estado exacto, y campo Edificio = `"X m"` o `"—"`

La tarjeta puede decir "☀️ Al sol pleno" desde el render 1 (estimación) mientras el campo Edificio sigue en `"Consultando…"` esperando el render 2. A veces ambos coinciden (la estimación acertó). A veces cambian cuando llega Overpass.

El tiempo de espera depende de la velocidad de Overpass — suele ser 1–4 segundos, pero puede llegar a los 12s (el timeout recién añadido) si el servidor está lento.
