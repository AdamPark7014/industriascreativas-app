/* Panel de control — vistas, tiempo real y consulta de registros.
   Sin dependencias externas: todo se dibuja sobre el DOM del servidor. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CATALOGO = window.CATALOGO || {};
  // El servidor solo manda las tablas del alcance del usuario.
  const TIPOS = Object.keys(CATALOGO);
  const INTERVALO = 5000;

  const estado = {
    vista: 'resumen',
    tipo: null,
    q: '',
    solo: '',
    orden: null,
    dir: 'asc',
    pagina: 1,
    porPagina: 25,
    firma: null,
    idsVistos: {},
    sondeando: false,
  };

  // ----------------------------------------------------------- utilidades
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const vacio = (v) => v === null || v === undefined || v === '' ||
    (Array.isArray(v) && v.length === 0);

  const texto = (v) => (vacio(v) ? '—' : String(v));

  function animarNumero(el, destino) {
    const inicio = parseInt(el.dataset.valor || '0', 10) || 0;
    const fin = Number(destino) || 0;
    if (inicio === fin) { el.dataset.valor = fin; return; }
    el.dataset.valor = fin;
    const t0 = performance.now();
    const dur = 620;
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(inicio + (fin - inicio) * e) + (el.dataset.sufijo || '');
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  function brindis(mensaje) {
    const b = $('brindis');
    b.innerHTML = `<span class="punto"></span>${esc(mensaje)}`;
    b.hidden = false;
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.hidden = true; }, 5000);
  }

  function avisar(mensaje) {
    const a = $('aviso');
    if (!mensaje) { a.hidden = true; return; }
    a.textContent = mensaje;
    a.hidden = false;
  }

  // ----------------------------------------------------------------- red
  async function pedir(url) {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (r.status === 401) { location.href = '/login'; throw new Error('sesion'); }
    if (!r.ok) {
      let detalle = `HTTP ${r.status}`;
      try { const j = await r.json(); detalle = j.detalle || j.error || detalle; } catch (_) {}
      throw new Error(detalle);
    }
    return r.json();
  }

  // ------------------------------------------------------------- barras
  function dibujarBarras(destino, items, acento = '') {
    const el = $(destino);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<p class="vacio">Sin datos capturados todavía.</p>';
      return;
    }
    el.innerHTML = `<div class="barras ${acento}">` + items.map((it) => `
      <div class="barraFila">
        <span class="barraEtiqueta">${esc(it.etiqueta)}</span>
        <span class="barraTotal">${it.total}</span>
        <div class="barraPista"><div class="barraValor" style="width:${it.pct}%"></div></div>
      </div>`).join('') + '</div>';
  }

  function dona(pct, color) {
    const r = 26, circ = 2 * Math.PI * r;
    return `<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="#e8eef6" stroke-width="9"/>
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="9"
        stroke-linecap="round" transform="rotate(-90 36 36)"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ - circ * pct / 100}"
        style="transition:stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)"/>
      <text x="36" y="41" text-anchor="middle" font-size="15" font-weight="700"
        fill="#071a3a" font-family="Segoe UI, sans-serif">${pct}%</text>
    </svg>`;
  }

  // ------------------------------------------------------------- resumen
  const COLORES = { azul: '#1a4fb8', rosa: '#d81b70', teal: '#0d8f8b' };

  function pintarResumen(d) {
    const cambio = estado.firma !== null && estado.firma !== d.firma;

    // Las tarjetas se arman con las categorías que llegan, no con posiciones
    // fijas: un usuario con alcance reducido recibe menos.
    const clases = { empresas: 'azul', estudiantes: 'rosa', elisa: 'teal' };
    const kpis = [
      { clase: 'navy', etq: 'Total de registros', val: d.total,
        hint: d.categorias.map((c) => c.nombre.toLowerCase()).join(' · ') },
      ...d.categorias.slice(0, 2).map((c) => ({
        clase: clases[c.clave] || 'teal', etq: c.nombre, val: c.total,
        hint: `${c.confirmados} confirmados · ${c.pendientes} pendientes`,
      })),
      { clase: 'teal', etq: 'Tasa de confirmación', val: d.tasa_confirmacion, sufijo: '%',
        hint: `${d.confirmados} de ${d.total} · ${d.asistencias} asistencias` },
    ];

    const grid = $('kpiGrid');
    if (grid.children.length !== kpis.length) {
      grid.innerHTML = kpis.map((k) => `
        <article class="tarjeta kpi ${k.clase}">
          <p class="kpiLabel">${esc(k.etq)}</p>
          <p class="kpiValue" data-sufijo="${k.sufijo || ''}">0${k.sufijo || ''}</p>
          <p class="kpiHint"></p>
        </article>`).join('');
    }
    [...grid.children].forEach((art, i) => {
      animarNumero(art.querySelector('.kpiValue'), kpis[i].val);
      art.querySelector('.kpiHint').textContent = kpis[i].hint;
      if (cambio) { art.classList.remove('destello'); void art.offsetWidth; art.classList.add('destello'); }
    });

    $('categoriasGrid').innerHTML = d.categorias.map((c) => `
      <article class="tarjeta">
        <div class="tarjetaCab">
          <h2 class="tarjetaTitulo">${esc(c.nombre)}</h2>
          <p class="tarjetaSub">${esc(c.descripcion || "")}</p>
        </div>
        <div class="tarjetaCuerpo">
          <div class="donaFila">
            ${dona(c.pct, COLORES[c.acento] || '#0d8f8b')}
            <div class="donaTexto">
              <div class="donaTotal">${c.total}</div>
              <div class="donaDetalle">
                <b>${c.confirmados}</b> confirmados<br>
                <b>${c.pendientes}</b> pendientes<br>
                <b>${c.asistencias}</b> asistencias
              </div>
            </div>
          </div>
        </div>
      </article>`).join('');

    dibujarBarras('rk-productos', d.rankings.productos);
    dibujarBarras('rk-instituciones', d.rankings.instituciones, 'rosa');
    dibujarBarras('rk-grados', d.rankings.grados, 'rosa');
    dibujarBarras('rk-empresas', d.rankings.empresas, 'azul');
    dibujarBarras('rk-sectores', d.rankings.sectores, 'azul');
    dibujarBarras('rk-estados', d.rankings.estados, 'azul');
    dibujarBarras('rk-areas', d.rankings.areas, 'azul');
    dibujarBarras('rk-posiciones', d.rankings.posiciones, 'azul');

    $('listaRecientes').innerHTML = d.recientes.map((r) => `
      <div class="reciente" data-tipo="${esc(r.tipo)}" data-id="${r.id}">
        <span class="pill ${r.tipo === 'empresas' ? 'azul' : 'rosa'}">${r.id}</span>
        <div class="recienteTexto">
          <div class="recienteNombre">${esc(texto(r.nombre))}</div>
          <div class="recienteDetalle">${esc(texto(r.detalle))}</div>
        </div>
        <span class="pill ${r.confirmado ? 'si' : 'no'}">${r.confirmado ? 'Confirmado' : 'Pendiente'}</span>
      </div>`).join('');

    $('tagTotal').textContent = d.total;
    d.categorias.forEach((c) => {
      const tag = document.querySelector(`.navTag[data-tag="${c.clave}"]`);
      if (tag) tag.textContent = c.total;
      const inf = document.querySelector(`.nc[data-tag-inf="${c.clave}"]`);
      if (inf) inf.textContent = c.total;
    });

    // Avisa solo cuando ya había una lectura previa (no en la primera carga).
    if (cambio) {
      const antes = Object.fromEntries((estado.firma || '').split('|')
        .map((p) => { const x = p.split(':'); return [x[0], Number(x[1])]; }));
      const nuevos = d.categorias
        .filter((c) => antes[c.clave] !== undefined && c.total > antes[c.clave])
        .map((c) => `${c.total - antes[c.clave]} en ${c.nombre.toLowerCase()}`);
      brindis(nuevos.length ? `Registro nuevo: ${nuevos.join(', ')}` : 'Datos actualizados');
      if (estado.vista === 'registros') cargarTabla({ silencioso: true });
    }
    estado.firma = d.firma;

    const con = d.conexion || {};
    // El usuario ve un estado, no diagnósticos: la latencia queda en el tooltip.
    const textoCon = con.ok ? 'Datos actualizados' : 'Sin conexión';
    const pulso = $('pulso');
    if (pulso) pulso.classList.toggle('malo', !con.ok);
    const txt = $('conexionTexto');
    if (txt) txt.textContent = textoCon;
    const hoja = $('hojaConexion');
    if (hoja) hoja.textContent = con.ok ? `Al día · ${d.servidor}` : 'Sin conexión';
    const caja = document.getElementById('conexion');
    if (caja) caja.title = con.ok ? `Respuesta en ${con.latencia_ms} ms` : 'No hay conexión con el servidor';
    $('selloTexto').textContent = `En vivo · ${d.servidor}`;
  }

  // -------------------------------------------------------------- tabla
  function celda(valor, clase) {
    if (clase === 'bool') {
      return `<td class="celdaNum"><span class="pill ${valor ? 'si' : 'no'}">${valor ? 'Sí' : 'No'}</span></td>`;
    }
    if (clase === 'id') return `<td class="celdaId">${esc(texto(valor))}</td>`;
    if (clase === 'entero') return `<td class="celdaNum">${esc(texto(valor))}</td>`;
    if (clase === 'fecha') return `<td class="celdaFecha">${esc(texto(valor))}</td>`;
    return `<td>${esc(texto(valor))}</td>`;
  }

  async function cargarTabla(opts = {}) {
    const tipo = estado.tipo;
    if (!tipo) return;
    const p = new URLSearchParams({
      q: estado.q, solo: estado.solo, pagina: estado.pagina,
      por_pagina: estado.porPagina, dir: estado.dir,
    });
    if (estado.orden) p.set('orden', estado.orden);

    try {
      const d = await pedir(`/api/registros/${tipo}?${p}`);
      avisar('');
      pintarTabla(d, opts.silencioso);
    } catch (e) {
      avisar(`No se pudieron cargar los registros: ${e.message}`);
    }
  }

  function pintarTabla(d, silencioso) {
    const cols = d.columnas.filter((c) => c.en_tabla);
    const idCol = d.id;

    $('tablaCabeza').innerHTML = '<tr>' + cols.map((c) => {
      const act = estado.orden === c.clave;
      return `<th data-col="${esc(c.clave)}" class="${act ? 'ordenado' : ''}">
        ${esc(c.etiqueta)}<span class="orden">${act ? (estado.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </th>`;
    }).join('') + '</tr>';

    // Solo se resalta en refrescos automáticos: al navegar, todo sería "nuevo".
    const vistos = estado.idsVistos[d.tipo];
    $('tablaCuerpo').innerHTML = d.registros.length
      ? d.registros.map((r) => {
          const id = r[idCol];
          const nuevo = silencioso && vistos && !vistos.has(id) ? 'nuevo' : '';
          return `<tr class="${nuevo}" data-id="${id}">` +
            cols.map((c) => celda(r[c.clave], c.clave === idCol ? 'id' : c.clase)).join('') +
            '</tr>';
        }).join('')
      : `<tr><td colspan="${cols.length}" class="vacio">Ningún registro coincide con la búsqueda.</td></tr>`;

    pintarTarjetas(d, silencioso, vistos);
    estado.idsVistos[d.tipo] = new Set(d.registros.map((r) => r[idCol]));

    const desde = d.total ? (d.pagina - 1) * d.por_pagina + 1 : 0;
    const hasta = Math.min(d.pagina * d.por_pagina, d.total);
    $('tablaMeta').innerHTML = `<b>${d.total}</b> registro${d.total === 1 ? '' : 's'}` +
      (estado.q || estado.solo ? ' (filtrados)' : '');

    const botones = [];
    const p = d.pagina, tot = d.paginas;
    botones.push(`<button class="pagBtn" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''}>‹</button>`);
    const rango = new Set([1, tot, p - 1, p, p + 1]);
    [...rango].filter((n) => n >= 1 && n <= tot).sort((a, b) => a - b).forEach((n, i, arr) => {
      if (i && n - arr[i - 1] > 1) botones.push('<span class="pagInfo">…</span>');
      botones.push(`<button class="pagBtn ${n === p ? 'activo' : ''}" data-p="${n}">${n}</button>`);
    });
    botones.push(`<button class="pagBtn" data-p="${p + 1}" ${p >= tot ? 'disabled' : ''}>›</button>`);

    $('paginacion').innerHTML =
      `<span class="pagInfo">Mostrando ${desde}–${hasta} de ${d.total}</span>
       <div class="pagBotones">${botones.join('')}</div>`;
  }

  // ------------------------------------------------------------ tarjetas
  // Misma información, en el formato que sí se puede leer en un teléfono.
  function pintarTarjetas(d, silencioso, vistos) {
    const cont = $('tarjetas');
    const meta = (CATALOGO[d.tipo] && CATALOGO[d.tipo].tarjeta) || {};
    const idCol = d.id;
    const acento = (CATALOGO[d.tipo] && CATALOGO[d.tipo].acento) || '';

    if (!d.registros.length) {
      cont.innerHTML = '<p class="vacio">Ningún registro coincide con la búsqueda.</p>';
      return;
    }

    cont.innerHTML = d.registros.map((r) => {
      const id = r[idCol];
      const nuevo = silencioso && vistos && !vistos.has(id) ? ' nuevo' : '';
      const titulo = (meta.titulo || [])
        .map((c) => r[c]).filter(Boolean).join(' ') || `#${id}`;
      const sub = meta.subtitulo ? texto(r[meta.subtitulo]) : '';
      const chips = (meta.meta || [])
        .map((c) => r[c]).filter((v) => !vacio(v))
        .map((v) => `<span class="regChip">${esc(v)}</span>`).join('');
      return `<article class="regTarjeta ${acento}${nuevo}" data-id="${id}">
        <span class="regId">${esc(id)}</span>
        <span class="regNombre">${esc(titulo)}</span>
        <span class="regEstado"><span class="pill ${r.confirmado ? 'si' : 'no'}">${r.confirmado ? 'Sí' : 'No'}</span></span>
        ${sub && sub !== '—' ? `<span class="regSub">${esc(sub)}</span>` : ''}
        ${chips ? `<span class="regMeta">${chips}</span>` : ''}
      </article>`;
    }).join('');
  }

  // -------------------------------------------------------------- ficha
  async function abrirFicha(tipo, id) {
    try {
      const d = await pedir(`/api/registro/${tipo}/${id}`);
      const r = d.registro;
      const nombre = [r.Nombre, r.ApellidoPaterno, r.ApellidoMaterno].filter(Boolean).join(' ') || `#${id}`;

      $('fichaTipo').textContent = `${CATALOGO[tipo]?.nombre || tipo} · #${id}`;
      $('fichaNombre').textContent = nombre;
      $('fichaCuerpo').innerHTML = d.columnas.map((c) => {
        const v = r[c.clave];
        let html;
        if (c.clase === 'bool') {
          html = `<span class="pill ${v ? 'si' : 'no'}">${v ? 'Confirmado' : 'Pendiente'}</span>`;
        } else if (vacio(v)) {
          html = '—';
        } else if (c.clase === 'correo') {
          html = `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
        } else if (c.clase === 'tel') {
          html = `<a href="tel:${esc(String(v).replace(/\s/g, ''))}">${esc(v)}</a>`;
        } else if (c.clase === 'lista') {
          const partes = String(v).split(',').map((s) => s.trim()).filter(Boolean);
          html = `<div class="etiquetas">${partes.map((s) => `<span class="etiqueta">${esc(s)}</span>`).join('')}</div>`;
        } else {
          html = esc(v);
        }
        return `<div class="fichaFila">
          <div class="fichaEtiqueta">${esc(c.etiqueta)}</div>
          <div class="fichaValor">${html}</div>
        </div>`;
      }).join('');

      $('capa').hidden = false;
      $('ficha').hidden = false;
    } catch (e) {
      brindis(`No se pudo abrir el registro: ${e.message}`);
    }
  }

  function cerrarFicha() {
    $('capa').hidden = true;
    $('ficha').hidden = true;
  }

  // -------------------------------------------------------------- vistas
  const TITULOS = {
    resumen: ['Panel de control', 'Resumen del evento'],
    analisis: ['Panel de control', 'Análisis de registros'],
    accesos: ['Control de accesos', 'Escáner y asistencias FICTI'],
  };

  function pintarAccesos(d) {
    const asis = $('accesosAsistencias');
    const conf = $('accesosConfirmados');
    if (asis) asis.textContent = d && d.asistencias != null ? String(d.asistencias) : '—';
    if (conf) conf.textContent = d && d.confirmados != null ? String(d.confirmados) : '—';
  }

  function irA(vista) {
    const esTipo = TIPOS.includes(vista);
    estado.vista = esTipo ? 'registros' : vista;
    estado.tipo = esTipo ? vista : null;

    document.querySelectorAll('.lateral .navItem').forEach((b) =>
      b.classList.toggle('activo', b.dataset.vista === vista));
    marcarNav(vista);
    document.querySelectorAll('.vista').forEach((s) => s.classList.remove('activa'));
    $(`vista-${esTipo ? 'registros' : vista}`).classList.add('activa');
    window.scrollTo({ top: 0 });

    if (esTipo) {
      $('vistaKicker').textContent = 'Registros';
      $('vistaTitulo').textContent = CATALOGO[vista]?.nombre || vista;
      estado.q = ''; estado.solo = ''; estado.pagina = 1;
      estado.orden = null; estado.dir = 'asc';
      $('buscar').value = '';
      document.querySelectorAll('#filtros .chip').forEach((c) =>
        c.classList.toggle('activo', c.dataset.solo === ''));
      cargarTabla();
    } else {
      const [k, t] = TITULOS[vista] || ['Panel de control', vista];
      $('vistaKicker').textContent = k;
      $('vistaTitulo').textContent = t;
      if (vista === 'accesos') {
        fetch('/api/resumen')
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => pintarAccesos(d))
          .catch(() => pintarAccesos(null));
      }
    }
    $('lateral').classList.remove('abierto');
  }

  // -------------------------------------------------------- tiempo real
  async function sondear() {
    if (estado.sondeando || document.hidden) return;
    estado.sondeando = true;
    $('sello').classList.add('actualizando');
    try {
      pintarResumen(await pedir('/api/resumen'));
      $('sello').classList.remove('error');
      avisar('');
    } catch (e) {
      $('sello').classList.add('error');
      $('selloTexto').textContent = 'Sin conexión';
      avisar(`No se pudo actualizar: ${e.message}. Reintentando…`);
    } finally {
      $('sello').classList.remove('actualizando');
      estado.sondeando = false;
    }
  }

  // ---------------------------------------------------- navegación móvil
  // Se construye a partir de la lateral para no duplicar el menú: cambia el
  // alcance del usuario y ambas navegaciones cambian juntas.
  const ICONOS = { resumen: '◧', analisis: '◔', accesos: '▣', empresas: '●', estudiantes: '●', elisa: '●' };

  function montarNavInferior() {
    const fuente = [...document.querySelectorAll('.lateral .navItem')];
    if (!fuente.length) return;
    const barra = document.createElement('nav');
    barra.className = 'navInferior';
    barra.innerHTML = '<div class="navInferiorLista">' + fuente.map((b) => {
      const v = b.dataset.vista;
      const corta = b.dataset.corto || b.dataset.label || v;
      return `<button data-vista="${v}">
        <span class="ni" aria-hidden="true">${ICONOS[v] || '●'}</span>
        <span>${esc(corta)}</span>
        ${TIPOS.includes(v) ? `<span class="nc" data-tag-inf="${v}">0</span>` : ''}
      </button>`;
    }).join('') + '</div>';
    document.querySelector('.app').appendChild(barra);
    barra.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-vista]');
      if (b) irA(b.dataset.vista);
    });
  }
  montarNavInferior();

  function marcarNav(vista) {
    document.querySelectorAll('.navInferior button').forEach((b) =>
      b.classList.toggle('activo', b.dataset.vista === vista));
  }

  // -------------------------------------------------------------- eventos
  document.querySelectorAll('.lateral .navItem').forEach((b) =>
    b.addEventListener('click', () => irA(b.dataset.vista)));

  document.querySelectorAll('[data-vista-jump]').forEach((b) =>
    b.addEventListener('click', () => irA(b.dataset.vistaJump)));

  $('btnInsignia').addEventListener('click', (e) => {
    e.stopPropagation();
    const h = $('hojaSesion');
    h.hidden = !h.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#hojaSesion') && !e.target.closest('#btnInsignia')) {
      $('hojaSesion').hidden = true;
    }
  });

  $('tarjetas').addEventListener('click', (e) => {
    const t = e.target.closest('.regTarjeta[data-id]');
    if (t) abrirFicha(estado.tipo, t.dataset.id);
  });

  let temporizador;
  $('buscar').addEventListener('input', (e) => {
    estado.q = e.target.value.trim();
    estado.pagina = 1;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cargarTabla(), 280);
  });

  $('filtros').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#filtros .chip').forEach((c) => c.classList.remove('activo'));
    chip.classList.add('activo');
    estado.solo = chip.dataset.solo;
    estado.pagina = 1;
    cargarTabla();
  });

  $('tablaCabeza').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const col = th.dataset.col;
    estado.dir = estado.orden === col && estado.dir === 'asc' ? 'desc' : 'asc';
    estado.orden = col;
    estado.pagina = 1;
    cargarTabla();
  });

  $('tablaCuerpo').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) abrirFicha(estado.tipo, tr.dataset.id);
  });

  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('.pagBtn');
    if (!b || b.disabled) return;
    estado.pagina = Number(b.dataset.p);
    cargarTabla();
    document.querySelector('.tablaEnvoltura')?.scrollTo({ top: 0 });
  });

  $('listaRecientes').addEventListener('click', (e) => {
    const fila = e.target.closest('.reciente');
    if (fila) abrirFicha(fila.dataset.tipo, fila.dataset.id);
  });

  $('fichaCerrar').addEventListener('click', cerrarFicha);
  $('capa').addEventListener('click', cerrarFicha);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { cerrarFicha(); $('menuExportLista').classList.remove('abierto'); }
  });

  // Exportación a Excel
  $('btnExportar').addEventListener('click', (e) => {
    e.stopPropagation();
    $('menuExportLista').classList.toggle('abierto');
  });
  document.addEventListener('click', () => $('menuExportLista').classList.remove('abierto'));
  $('menuExportLista').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const tipo = b.dataset.export;
    const btn = $('btnExportar');
    btn.disabled = true;
    btn.innerHTML = '<span aria-hidden="true">⏳</span> Generando…';
    // La descarga la dispara el navegador; se restablece el botón al volver el foco.
    location.href = tipo ? `/api/exportar/${tipo}.xlsx` : '/api/exportar.xlsx';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<span aria-hidden="true">↓</span> Exportar Excel';
      brindis('Excel generado');
    }, 2200);
  });

  // Al volver a la pestaña se refresca de inmediato.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sondear(); });

  sondear();
  setInterval(sondear, INTERVALO);
})();
