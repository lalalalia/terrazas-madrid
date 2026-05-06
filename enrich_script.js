// ═══════════════════════════════════════════════════════════
// enrich.js — Enriquece terrazas.json con datos de OSM
// Uso: node enrich.js
// Requiere: Node.js 18+ (fetch nativo)
// Genera: data/terrazas_enriquecido.json
// ═══════════════════════════════════════════════════════════

import fs from 'fs/promises';

const INPUT  = 'data/terrazas.json';
const OUTPUT = 'data/terrazas_enriquecido.json';

// Pausa entre lotes para no saturar Overpass (son servidores voluntarios)
const PAUSA_MS     = 1200;
const BATCH_SIZE   = 50;    // terrazas por consulta Overpass
const RADIO_M      = 50;    // radio de búsqueda en metros

// ── UTM 30N → WGS84 (misma función que en index.html) ──────
function utm2ll(E, N) {
  const a=6378137, f=1/298.257223563, b=a*(1-f), e2=1-(b*b)/(a*a), ep2=e2/(1-e2);
  const k0=0.9996, lon0=(30-1)*6*Math.PI/180-Math.PI+3*Math.PI/180;
  const x=E-500000, y=N, M=y/k0;
  const mu=M/(a*(1-e2/4-3*e2**2/64-5*e2**3/256));
  const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const p1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu);
  const N1=a/Math.sqrt(1-e2*Math.sin(p1)**2), T1=Math.tan(p1)**2, C1=ep2*Math.cos(p1)**2;
  const R1=a*(1-e2)/Math.pow(1-e2*Math.sin(p1)**2,1.5), D=x/(N1*k0);
  const lat=p1-(N1*Math.tan(p1)/R1)*(D**2/2-(5+3*T1+10*C1-4*C1**2-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1**2-252*ep2-3*C1**2)*D**6/720);
  const lon=lon0+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1**2+8*ep2+24*T1**2)*D**5/120)/Math.cos(p1);
  return [lat*180/Math.PI, lon*180/Math.PI];
}

// ── Consulta Overpass para un lote de terrazas ─────────────
async function consultarOverpass(lote) {
  // Construimos una consulta que busca nodos/ways de tipo amenity
  // cerca de cada terraza del lote
  const unions = lote.map(t => {
    const [lat, lng] = utm2ll(t.coordenada_x_local, t.coordenada_y_local);
    return `
      node(around:${RADIO_M},${lat},${lng})[amenity~"bar|cafe|restaurant|pub"];
      way(around:${RADIO_M},${lat},${lng})[amenity~"bar|cafe|restaurant|pub"];
    `;
  }).join('\n');

  const query = `[out:json][timeout:30];\n(\n${unions}\n);\nout tags center;`;

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });

  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const json = await resp.json();
  return json.elements || [];
}

// ── Distancia entre dos puntos (Haversine simplificado) ─────
function dist(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Similitud de nombres (Jaccard sobre bigramas) ───────────
function simNombre(a, b) {
  if (!a || !b) return 0;
  const norm = s => s.toLowerCase().replace(/[^a-záéíóúüñ0-9 ]/g, '').trim();
  const bigramas = s => { const r=new Set(); for(let i=0;i<s.length-1;i++) r.add(s.slice(i,i+2)); return r; };
  const A = bigramas(norm(a)), B = bigramas(norm(b));
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
}

// ── Encuentra el elemento OSM más cercano y compatible ──────
function mejorMatch(terraza, elementos) {
  const [lat, lng] = utm2ll(terraza.coordenada_x_local, terraza.coordenada_y_local);
  const nombre = terraza.rotulo || '';

  let mejor = null, mejorScore = -1;

  for (const el of elementos) {
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (!elLat || !elLon) continue;

    const d = dist(lat, lng, elLat, elLon);
    if (d > RADIO_M) continue;

    const simN = simNombre(nombre, el.tags?.name);
    // Score combinado: similaridad nombre (peso 0.6) + proximidad (peso 0.4)
    const score = simN * 0.6 + (1 - d / RADIO_M) * 0.4;

    if (score > mejorScore) { mejorScore = score; mejor = el; }
  }

  // Umbral mínimo: si el score es muy bajo, preferimos no enlazar
  return mejorScore > 0.25 ? mejor : null;
}

// ── Extrae los campos útiles de un elemento OSM ─────────────
function extraerDatosOSM(el) {
  if (!el) return {};
  const t = el.tags || {};
  return {
    osm_id:       el.id,
    osm_type:     el.type,
    osm_name:     t.name || null,
    osm_web:      t.website || t.contact_website || t.url || null,
    osm_phone:    t.phone || t.contact_phone || null,
    osm_hours:    t['opening_hours'] || null,
    osm_cuisine:  t.cuisine || null,
    osm_image:    t.image || null,          // a veces hay URL de foto
    osm_wheelchair: t.wheelchair || null,
  };
}

// ── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('📂 Leyendo', INPUT);
  const raw = await fs.readFile(INPUT, 'utf8');
  const terrazas = JSON.parse(raw);
  console.log(`✅ ${terrazas.length} terrazas cargadas`);

  // Filtrar las que tienen coordenadas válidas
  const validas = terrazas.filter(t => t.coordenada_x_local && t.coordenada_y_local);
  console.log(`📍 ${validas.length} con coordenadas válidas`);

  // Si existe un enriquecido previo, lo cargamos para continuar donde quedamos
  let previo = {};
  try {
    const prev = JSON.parse(await fs.readFile(OUTPUT, 'utf8'));
    prev.forEach(t => { if (t.osm_id) previo[t.id_terraza] = t; });
    console.log(`♻️  Reanudando — ${Object.keys(previo).length} ya procesadas`);
  } catch { /* primera vez */ }

  const pendientes = validas.filter(t => !previo[t.id_terraza]);
  console.log(`⏳ Pendientes: ${pendientes.length}`);

  const resultado = { ...previo };
  // Añadir las que ya tenían datos
  validas.forEach(t => { if (!resultado[t.id_terraza]) resultado[t.id_terraza] = { ...t }; });

  let loteIdx = 0;
  const totalLotes = Math.ceil(pendientes.length / BATCH_SIZE);

  for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
    loteIdx++;
    const lote = pendientes.slice(i, i + BATCH_SIZE);
    const pct = ((loteIdx / totalLotes) * 100).toFixed(1);
    process.stdout.write(`\r🔍 Lote ${loteIdx}/${totalLotes} (${pct}%)   `);

    try {
      const elementos = await consultarOverpass(lote);

      for (const t of lote) {
        const match = mejorMatch(t, elementos);
        const osm = extraerDatosOSM(match);
        resultado[t.id_terraza] = { ...t, ...osm };
      }
    } catch (err) {
      console.error(`\n⚠️  Error en lote ${loteIdx}:`, err.message);
      // Guardamos progreso parcial y esperamos más antes de continuar
      await guardar(resultado, terrazas);
      await sleep(5000);
    }

    // Pausa educada entre lotes
    if (i + BATCH_SIZE < pendientes.length) await sleep(PAUSA_MS);

    // Guardado incremental cada 10 lotes
    if (loteIdx % 10 === 0) await guardar(resultado, terrazas);
  }

  await guardar(resultado, terrazas);
  console.log('\n\n✅ Enriquecimiento completado →', OUTPUT);

  // Estadísticas finales
  const arr = Object.values(resultado);
  const conNombre = arr.filter(t => t.osm_name).length;
  const conWeb    = arr.filter(t => t.osm_web).length;
  const conHorario= arr.filter(t => t.osm_hours).length;
  const conFoto   = arr.filter(t => t.osm_image).length;
  console.log(`📊 Resultados:`);
  console.log(`   🏷️  Con nombre OSM:  ${conNombre} (${(conNombre/arr.length*100).toFixed(1)}%)`);
  console.log(`   🌐 Con web:          ${conWeb}`);
  console.log(`   🕐 Con horario:      ${conHorario}`);
  console.log(`   📸 Con foto OSM:     ${conFoto}`);
}

async function guardar(resultado, original) {
  // Reconstruimos el array en el mismo orden que el original
  const arr = original.map(t => resultado[t.id_terraza] || t);
  await fs.writeFile(OUTPUT, JSON.stringify(arr, null, 2), 'utf8');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('❌', err); process.exit(1); });
