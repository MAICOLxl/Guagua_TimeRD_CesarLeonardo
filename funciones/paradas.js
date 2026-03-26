const estado = document.getElementById("estado");
const mensajeResultado = document.getElementById("mensajeResultado");
const listaParadas = document.getElementById("listaParadas");
const accionesRuta = document.getElementById("accionesRuta");
const rutaParada = document.getElementById("rutaParada");
const rutaCompleta = document.getElementById("rutaCompleta");
const inputDestino = document.getElementById("destino");
const btnBuscar = document.getElementById("btnBuscar");
const btnUbicacion = document.getElementById("btnUbicacion");
const selectParadaFavorita = document.getElementById("paradaFavorita");
const btnGuardarFavorita = document.getElementById("btnGuardarFavorita");
const btnVerFavorita = document.getElementById("btnVerFavorita");

let paradas = [];
let guaguas = [];
let tramos = [];
let ubicacionUsuario = null;
let mapa = null;
let geocoder = null;
let marcadoresParadas = [];
let marcadoresGuaguas = [];
let marcadorUsuario = null;
let marcadorDestino = null;
let destinoSeleccionado = null;
let circuloPrecision = null;
let temporizadorGuaguas = null;

const ICONOS_PARADAS = {
  sede: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
  normal: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
  siguiente: "https://maps.google.com/mapfiles/ms/icons/black-dot.png",
};
const INTERVALO_GUAGUAS_MS = 5000;
const CLAVE_PARADA_FAVORITA = "guaguatimedr_parada_favorita";

async function cargarParadas() {
  const respuesta = await fetch("./funciones/paradas.json");
  if (!respuesta.ok) {
    throw new Error("No se pudo cargar el archivo de paradas.");
  }

  const datos = await respuesta.json();
  paradas = (datos.Paradas || []).map((parada) => ({
    ...parada,
    orden: Number(parada.orden || parada.id),
    lat: Number(parada.x),
    lng: Number(parada.y),
  })).sort((a, b) => a.orden - b.orden);
  guaguas = (datos.Guaguas || []).map((guagua) => ({
    ...guagua,
    paradaActualId: Number(guagua.paradaActualId),
    siguienteParadaId: Number(guagua.siguienteParadaId),
    progresoTramo: Number(guagua.progresoTramo || 0),
  }));
  tramos = (datos.Tramos || []).map((tramo) => ({
    ...tramo,
    origenId: Number(tramo.origenId),
    destinoId: Number(tramo.destinoId),
    distanciaKm: Number(tramo.distanciaKm || tramo.distancia || 0),
    tiempoMinutos: Number(tramo.tiempoMinutos || tramo.tiempoLlegada || 0),
  }));

  listaParadas.textContent = paradas.map((parada) => parada.nombre).join(" -> ");
  llenarSelectParadas();
}

function actualizarEstado(texto) {
  estado.textContent = texto;
}

function llenarSelectParadas() {
  selectParadaFavorita.innerHTML = `
    <option value="">Selecciona una parada</option>
    <option value="ninguna">Sin parada favorita</option>
  `;

  for (const parada of paradas) {
    const option = document.createElement("option");
    option.value = `${parada.id}`;
    option.textContent = parada.nombre;
    selectParadaFavorita.appendChild(option);
  }
}

function guardarParadaFavorita() {
  const valorSeleccionado = selectParadaFavorita.value;

  if (valorSeleccionado === "ninguna") {
    window.localStorage.removeItem(CLAVE_PARADA_FAVORITA);
    accionesRuta.classList.add("oculto");
    mensajeResultado.textContent = "Todavia no se ha calculado una parada cercana.";
    actualizarEstado("Se elimino la parada favorita guardada.");
    return;
  }

  const paradaId = Number(valorSeleccionado);
  if (!paradaId) {
    actualizarEstado("Selecciona una parada favorita antes de guardarla.");
    return;
  }

  window.localStorage.setItem(CLAVE_PARADA_FAVORITA, `${paradaId}`);
  const parada = obtenerParadaPorId(paradaId);
  actualizarEstado(`Parada favorita guardada: ${parada?.nombre || "Parada"}.`);
}

function obtenerParadaFavoritaGuardada() {
  const paradaIdGuardada = Number(window.localStorage.getItem(CLAVE_PARADA_FAVORITA));
  if (!paradaIdGuardada) {
    return null;
  }

  return obtenerParadaPorId(paradaIdGuardada);
}

function mostrarInformacionParadaFavorita() {
  const paradaFavorita = obtenerParadaFavoritaGuardada();

  if (!paradaFavorita) {
    actualizarEstado("Todavia no has guardado una parada favorita.");
    return;
  }

  selectParadaFavorita.value = `${paradaFavorita.id}`;
  actualizarEstado(`Mostrando informacion de tu parada favorita: ${paradaFavorita.nombre}.`);
  mostrarResultadoParada(paradaFavorita, "tu ruta habitual");
}

function asignarDestinoSeleccionado(destino) {
  destinoSeleccionado = destino;
  actualizarMarcadorDestino(destino);
}

function crearMapaSiDisponible() {
  if (!window.google?.maps) {
    return;
  }

  if (!mapa) {
    mapa = new google.maps.Map(document.getElementById("mapaDestino"), {
      center: { lat: 18.4861, lng: -69.9312 },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    geocoder = new google.maps.Geocoder();

    const autocomplete = new google.maps.places.Autocomplete(inputDestino, {
      fields: ["formatted_address", "geometry", "name"],
      componentRestrictions: { country: "do" },
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) {
        destinoSeleccionado = null;
        return;
      }

      asignarDestinoSeleccionado({
        nombre: place.formatted_address || place.name || inputDestino.value.trim(),
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    });
  }

  renderizarMarcadoresParadas();
  renderizarMarcadoresGuaguas();
}

function renderizarMarcadoresParadas() {
  if (!mapa || !window.google?.maps) {
    return;
  }

  for (const marcador of marcadoresParadas) {
    marcador.setMap(null);
  }

  marcadoresParadas = paradas.map((parada) => {
    const marcador = new google.maps.Marker({
      position: { lat: parada.lat, lng: parada.lng },
      map: mapa,
      title: parada.nombre,
      icon: obtenerIconoParada(parada),
    });

    const info = new google.maps.InfoWindow({
      content: `<strong>${parada.nombre}</strong><br>Orden: ${parada.orden}`,
    });

    marcador.addListener("click", () => info.open({ anchor: marcador, map }));
    return marcador;
  });
}

function obtenerIconoParada(parada, esSiguiente = false) {
  if (esSiguiente) {
    return ICONOS_PARADAS.siguiente;
  }

  const esSede = parada.nombre.toLowerCase().includes("sede");
  return esSede ? ICONOS_PARADAS.sede : ICONOS_PARADAS.normal;
}

function actualizarColoresParadas(paradaDestacada) {
  for (let indice = 0; indice < paradas.length; indice += 1) {
    const parada = paradas[indice];
    const marcador = marcadoresParadas[indice];

    if (!marcador) {
      continue;
    }

    const esDestacada = paradaDestacada && parada.id === paradaDestacada.id;
    marcador.setIcon(obtenerIconoParada(parada, esDestacada));
  }
}

function obtenerParadaPorId(id) {
  return paradas.find((parada) => parada.id === id) || null;
}

function obtenerTramo(origenId, destinoId) {
  return tramos.find((tramo) => tramo.origenId === origenId && tramo.destinoId === destinoId) || null;
}

function obtenerTramoDesdeParada(paradaId) {
  return tramos.find((tramo) => tramo.origenId === paradaId) || null;
}

function obtenerMinutosTramo(origenId, destinoId) {
  return obtenerTramo(origenId, destinoId)?.tiempoMinutos || 0;
}

function interpolarPosicion(origen, destino, progreso) {
  return {
    lat: origen.lat + (destino.lat - origen.lat) * progreso,
    lng: origen.lng + (destino.lng - origen.lng) * progreso,
  };
}

function obtenerPosicionGuagua(guagua) {
  const paradaActual = obtenerParadaPorId(guagua.paradaActualId);
  const siguienteParada = obtenerParadaPorId(guagua.siguienteParadaId);

  if (!paradaActual || !siguienteParada) {
    return null;
  }

  return interpolarPosicion(paradaActual, siguienteParada, guagua.progresoTramo);
}

function obtenerIconoGuagua() {
  return {
    url: `data:image/svg+xml;utf8,
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <rect x="6" y="7" width="24" height="18" rx="4" fill="%230b5d5b" stroke="%23ffffff" stroke-width="2"/>
        <rect x="10" y="11" width="16" height="6" rx="1.5" fill="%23dff6f3"/>
        <rect x="10" y="18.5" width="6" height="4" rx="1" fill="%23f2c94c"/>
        <rect x="20" y="18.5" width="6" height="4" rx="1" fill="%23f2c94c"/>
        <circle cx="12" cy="27" r="3" fill="%23111827"/>
        <circle cx="24" cy="27" r="3" fill="%23111827"/>
      </svg>`,
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  };
}

function renderizarMarcadoresGuaguas() {
  if (!mapa || !window.google?.maps) {
    return;
  }

  for (const marcador of marcadoresGuaguas) {
    marcador.setMap(null);
  }

  marcadoresGuaguas = guaguas.map((guagua) => {
    const posicion = obtenerPosicionGuagua(guagua);
    const marcador = new google.maps.Marker({
      position: posicion,
      map: mapa,
      title: guagua.nombre,
      icon: obtenerIconoGuagua(),
    });

    const info = new google.maps.InfoWindow({
      content: construirContenidoGuagua(guagua),
    });

    marcador.addListener("click", () => info.open({ anchor: marcador, map }));
    return marcador;
  });
}

function obtenerNivelOcupacion(guagua) {
  const proporcion = guagua.capacidad ? guagua.pasajeros / guagua.capacidad : 0;

  if (proporcion < 0.4) {
    return "baja";
  }

  if (proporcion < 0.75) {
    return "media";
  }

  return "alta";
}

function construirContenidoGuagua(guagua) {
  return `<strong>${guagua.nombre}</strong><br>Pasajeros: ${guagua.pasajeros}/${guagua.capacidad}<br>Ocupacion: ${obtenerNivelOcupacion(guagua)}`;
}

function actualizarMarcadoresGuaguas() {
  for (let indice = 0; indice < guaguas.length; indice += 1) {
    const guagua = guaguas[indice];
    const marcador = marcadoresGuaguas[indice];
    const posicion = obtenerPosicionGuagua(guagua);

    if (!marcador || !posicion) {
      continue;
    }

    marcador.setPosition(posicion);
  }
}

function avanzarGuaguas(segundosTranscurridos) {
  for (const guagua of guaguas) {
    let seguridad = 0;

    while (seguridad < paradas.length + 1) {
      const minutosTramo = obtenerMinutosTramo(guagua.paradaActualId, guagua.siguienteParadaId);

      if (!minutosTramo) {
        break;
      }

      const incremento = segundosTranscurridos / (minutosTramo * 60);
      const nuevoProgreso = guagua.progresoTramo + incremento;

      if (nuevoProgreso < 1) {
        guagua.progresoTramo = nuevoProgreso;
        break;
      }

      guagua.paradaActualId = guagua.siguienteParadaId;
      const siguienteTramo = obtenerTramoDesdeParada(guagua.paradaActualId);
      guagua.siguienteParadaId = siguienteTramo?.destinoId || paradas[0]?.id;
      guagua.progresoTramo = nuevoProgreso - 1;
      seguridad += 1;
    }
  }

  actualizarMarcadoresGuaguas();
}

function iniciarMovimientoGuaguas() {
  if (temporizadorGuaguas || !guaguas.length) {
    return;
  }

  temporizadorGuaguas = window.setInterval(() => {
    avanzarGuaguas(INTERVALO_GUAGUAS_MS / 1000);
  }, INTERVALO_GUAGUAS_MS);
}

function actualizarMarcadorUsuario() {
  if (!mapa || !ubicacionUsuario || !window.google?.maps) {
    return;
  }

  if (!marcadorUsuario) {
    marcadorUsuario = new google.maps.Marker({
      map: mapa,
      title: "Tu ubicacion",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#0b5d5b",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });
  }

  marcadorUsuario.setPosition(ubicacionUsuario);

  if (!circuloPrecision) {
    circuloPrecision = new google.maps.Circle({
      map: mapa,
      strokeColor: "#0b5d5b",
      strokeOpacity: 0.35,
      strokeWeight: 1,
      fillColor: "#0b5d5b",
      fillOpacity: 0.12,
    });
  }

  circuloPrecision.setCenter(ubicacionUsuario);
  circuloPrecision.setRadius(ubicacionUsuario.precision || 0);
}

function actualizarMarcadorDestino(destino) {
  if (!mapa || !destino || !window.google?.maps) {
    return;
  }

  if (!marcadorDestino) {
    marcadorDestino = new google.maps.Marker({
      map: mapa,
      title: "Destino",
    });
  }

  marcadorDestino.setPosition({ lat: destino.lat, lng: destino.lng });
  marcadorDestino.setTitle(destino.nombre);
}

function ajustarVistaMapa(parada) {
  if (!mapa || !window.google?.maps) {
    return;
  }

  const bounds = new google.maps.LatLngBounds();

  if (ubicacionUsuario) {
    bounds.extend(ubicacionUsuario);
  }

  if (parada) {
    bounds.extend({ lat: parada.lat, lng: parada.lng });
  }

  if (destinoSeleccionado) {
    bounds.extend({ lat: destinoSeleccionado.lat, lng: destinoSeleccionado.lng });
  }

  if (!bounds.isEmpty()) {
    mapa.fitBounds(bounds, 80);
  }
}

function centrarMapaEnUsuario() {
  if (!mapa || !ubicacionUsuario) {
    return;
  }

  mapa.setCenter(ubicacionUsuario);
  mapa.setZoom(15);
}

function obtenerUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tu navegador no soporta geolocalizacion."));
      return;
    }

    actualizarEstado("Solicitando ubicacion actual...");

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        ubicacionUsuario = {
          lat: posicion.coords.latitude,
          lng: posicion.coords.longitude,
          precision: posicion.coords.accuracy,
        };
        actualizarEstado(`Ubicacion actual obtenida. Precision aproximada: ${Math.round(posicion.coords.accuracy)} metros.`);
        actualizarMarcadorUsuario();
        centrarMapaEnUsuario();
        resolve(ubicacionUsuario);
      },
      (error) => {
        reject(new Error(obtenerMensajeErrorUbicacion(error)));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

function obtenerMensajeErrorUbicacion(error) {
  if (!error) {
    return "No se pudo obtener la ubicacion del usuario.";
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "El navegador bloqueo el permiso de ubicacion. Debes permitir acceso a la ubicacion para esta pagina.";
    case error.POSITION_UNAVAILABLE:
      return "El navegador no pudo determinar tu ubicacion actual. Activa GPS, Wi-Fi o datos de ubicacion.";
    case error.TIMEOUT:
      return "La ubicacion tardo demasiado en responder. Intenta otra vez en un lugar con mejor senal.";
    default:
      return "No se pudo obtener la ubicacion del usuario.";
  }
}

function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
  const radioTierra = 6371;
  const dLat = gradosARadianes(lat2 - lat1);
  const dLng = gradosARadianes(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(gradosARadianes(lat1)) *
      Math.cos(gradosARadianes(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radioTierra * c;
}

function gradosARadianes(grados) {
  return grados * (Math.PI / 180);
}

function encontrarParadaMasCercana(usuario) {
  let mejorParada = null;

  for (const parada of paradas) {
    const distanciaKm = calcularDistanciaKm(
      usuario.lat,
      usuario.lng,
      parada.lat,
      parada.lng
    );

    if (!mejorParada || distanciaKm < mejorParada.distanciaKm) {
      mejorParada = {
        ...parada,
        distanciaKm,
      };
    }
  }

  return mejorParada;
}

function calcularMinutosEntreParadas(paradaOrigenId, paradaDestinoId) {
  if (paradaOrigenId === paradaDestinoId) {
    return 0;
  }

  let minutos = 0;
  let paradaActualId = paradaOrigenId;
  let seguridad = 0;

  while (seguridad < paradas.length + 1) {
    const tramo = obtenerTramoDesdeParada(paradaActualId);
    if (!tramo) {
      return Number.POSITIVE_INFINITY;
    }

    minutos += tramo.tiempoMinutos;
    if (tramo.destinoId === paradaDestinoId) {
      return minutos;
    }

    paradaActualId = tramo.destinoId;
    seguridad += 1;
  }

  return Number.POSITIVE_INFINITY;
}

function construirUrlRuta(origen, destino, modo) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origen
  )}&destination=${encodeURIComponent(destino)}&travelmode=${modo}`;
}

function calcularMinutosHastaParada(guagua, paradaObjetivoId) {
  let minutos = 0;
  let paradaActualId = guagua.paradaActualId;
  let siguienteParadaId = guagua.siguienteParadaId;
  let progresoTramo = guagua.progresoTramo;
  let seguridad = 0;

  while (seguridad < paradas.length + 1) {
    const tramo = obtenerTramo(paradaActualId, siguienteParadaId);
    if (!tramo) {
      return Number.POSITIVE_INFINITY;
    }

    const minutosTramo = tramo.tiempoMinutos;
    if (siguienteParadaId === paradaObjetivoId) {
      return minutos + (1 - progresoTramo) * minutosTramo;
    }

    minutos += (1 - progresoTramo) * minutosTramo;
    paradaActualId = siguienteParadaId;

    const siguienteTramo = obtenerTramoDesdeParada(paradaActualId);
    if (!siguienteTramo) {
      return Number.POSITIVE_INFINITY;
    }

    siguienteParadaId = siguienteTramo.destinoId;
    progresoTramo = 0;
    seguridad += 1;
  }

  return Number.POSITIVE_INFINITY;
}

function encontrarProximaGuagua(paradaObjetivoId) {
  let mejorOpcion = null;

  for (const guagua of guaguas) {
    const minutos = calcularMinutosHastaParada(guagua, paradaObjetivoId);
    if (!mejorOpcion || minutos < mejorOpcion.minutos) {
      mejorOpcion = {
        guagua,
        minutos,
      };
    }
  }

  return mejorOpcion;
}

function formatearTiempoLlegada(minutos) {
  if (!Number.isFinite(minutos)) {
    return "sin tiempo estimado";
  }

  if (minutos < 1) {
    return "ahora mismo";
  }

  const minutosRedondeados = Math.max(1, Math.ceil(minutos));
  return `${minutosRedondeados} minuto${minutosRedondeados === 1 ? "" : "s"}`;
}

function obtenerSiguienteParada(paradaActual) {
  const tramo = obtenerTramoDesdeParada(paradaActual.id);
  if (!tramo) {
    return null;
  }

  return obtenerParadaPorId(tramo.destinoId);
}

function mostrarResultado(parada, destino) {
  const paradaDestino = destinoSeleccionado
    ? encontrarParadaMasCercana(destinoSeleccionado)
    : null;
  mostrarResultadoParada(parada, destino, true, paradaDestino);
}

function mostrarResultadoParada(parada, destino, mostrarRutas = false, paradaDestino = null) {
  const distanciaMetros = Number.isFinite(parada.distanciaKm)
    ? Math.round(parada.distanciaKm * 1000)
    : null;
  const siguienteParada = obtenerSiguienteParada(parada);
  const proximaGuagua = encontrarProximaGuagua(parada.id);
  const minutosTrayecto = paradaDestino
    ? calcularMinutosEntreParadas(parada.id, paradaDestino.id)
    : null;
  const minutosTotales = proximaGuagua && Number.isFinite(minutosTrayecto)
    ? proximaGuagua.minutos + minutosTrayecto
    : null;
  const textoGuagua = proximaGuagua
    ? ` La proxima guagua es ${proximaGuagua.guagua.nombre} y pasara ${formatearTiempoLlegada(proximaGuagua.minutos)} con ${proximaGuagua.guagua.pasajeros} pasajeros. Su ocupacion es ${obtenerNivelOcupacion(proximaGuagua.guagua)}.`
    : "";
  let textoTrayecto = "";
  if (mostrarRutas && paradaDestino && Number.isFinite(minutosTrayecto)) {
    textoTrayecto = minutosTrayecto === 0
      ? " No te conviene tomar la guagua, porque tu destino queda en la misma zona de esa parada."
      : ` El trayecto estimado en guagua hasta ${paradaDestino.nombre} es de ${Math.ceil(minutosTrayecto)} minutos. El tiempo total aproximado, contando la espera, es de ${Math.ceil(minutosTotales)} minutos.`;
  }
  const detalleRecorrido = siguienteParada
    ? ` Despues de ${parada.nombre}, la guagua sigue hacia ${siguienteParada.nombre}.`
    : "";
  const textoDistancia = mostrarRutas
    ? `Mira, tienes la estacion ${parada.nombre}${distanciaMetros === null ? "" : ` a ${distanciaMetros} metros`}. Ve a esa parada para iniciar tu trayecto hacia ${destino}.`
    : `Tu parada favorita es ${parada.nombre}.`;
  mensajeResultado.textContent = `${textoDistancia}${textoGuagua}${textoTrayecto}${detalleRecorrido}`;

  if (mostrarRutas && ubicacionUsuario) {
    const origenUsuario = `${ubicacionUsuario.lat},${ubicacionUsuario.lng}`;
    const destinoParada = `${parada.lat},${parada.lng}`;
    const destinoFinal = destino.trim();

    rutaParada.href = construirUrlRuta(origenUsuario, destinoParada, "walking");
    rutaCompleta.href = construirUrlRuta(destinoParada, destinoFinal, "transit");
    accionesRuta.classList.remove("oculto");
  } else {
    accionesRuta.classList.add("oculto");
  }

  actualizarColoresParadas(parada);
  ajustarVistaMapa(parada);
}

function geocodificarDestino(textoDestino) {
  return new Promise((resolve, reject) => {
    if (!geocoder) {
      reject(new Error("Google Maps no esta listo todavia."));
      return;
    }

    geocoder.geocode(
      {
        address: textoDestino,
        region: "DO",
      },
      (results, status) => {
        if (status !== "OK" || !results?.length) {
          reject(new Error("No se pudo ubicar ese destino en el mapa."));
          return;
        }

        const resultado = results[0];
        resolve({
          nombre: resultado.formatted_address,
          lat: resultado.geometry.location.lat(),
          lng: resultado.geometry.location.lng(),
        });
      }
    );
  });
}

async function obtenerDestino(textoDestino) {
  if (
    destinoSeleccionado &&
    inputDestino.value.trim() === textoDestino
  ) {
    return destinoSeleccionado;
  }

  const destino = await geocodificarDestino(textoDestino);
  asignarDestinoSeleccionado(destino);
  return destino;
}

async function buscarMejorParada() {
  const destino = inputDestino.value.trim();

  if (!destino) {
    actualizarEstado("Escribe primero tu destino.");
    inputDestino.focus();
    return;
  }

  try {
    const destinoGeografico = await obtenerDestino(destino);

    if (!ubicacionUsuario) {
      await obtenerUbicacion();
    }

    const mejorParada = encontrarParadaMasCercana(ubicacionUsuario);

    if (!mejorParada) {
      throw new Error("No hay paradas disponibles.");
    }

    actualizarEstado("Parada encontrada correctamente.");
    mostrarResultado(mejorParada, destinoGeografico.nombre);
  } catch (error) {
    actualizarEstado(error.message);
  }
}

btnBuscar.addEventListener("click", buscarMejorParada);
btnUbicacion.addEventListener("click", async () => {
  try {
    await obtenerUbicacion();
  } catch (error) {
    actualizarEstado(error.message);
  }
});
btnGuardarFavorita.addEventListener("click", guardarParadaFavorita);
btnVerFavorita.addEventListener("click", mostrarInformacionParadaFavorita);

inputDestino.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") {
    buscarMejorParada();
  }
});

async function iniciarApp() {
  try {
    await cargarParadas();
    crearMapaSiDisponible();
    iniciarMovimientoGuaguas();
    actualizarEstado("Paradas listas. Puedes escribir tu destino.");
    const paradaFavorita = obtenerParadaFavoritaGuardada();
    if (paradaFavorita) {
      selectParadaFavorita.value = `${paradaFavorita.id}`;
      mostrarInformacionParadaFavorita();
    }
  } catch (error) {
    actualizarEstado(error.message);
    listaParadas.textContent = "No fue posible cargar las paradas.";
  }
}

window.initMap = function initMap() {
  crearMapaSiDisponible();
};

if (window.isSecureContext === false && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
  actualizarEstado("La geolocalizacion suele requerir HTTPS o localhost. Si abres el archivo directo, la ubicacion puede fallar.");
}

iniciarApp();
