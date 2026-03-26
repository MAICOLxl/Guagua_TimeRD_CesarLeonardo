const estado = document.getElementById("estado");
const mensajeResultado = document.getElementById("mensajeResultado");
const listaParadas = document.getElementById("listaParadas");
const accionesRuta = document.getElementById("accionesRuta");
const rutaParada = document.getElementById("rutaParada");
const rutaCompleta = document.getElementById("rutaCompleta");
const inputDestino = document.getElementById("destino");
const btnBuscar = document.getElementById("btnBuscar");
const btnUbicacion = document.getElementById("btnUbicacion");

let paradas = [];
let ubicacionUsuario = null;
let mapa = null;
let autocomplete = null;
let geocoder = null;
let marcadoresParadas = [];
let marcadorUsuario = null;
let marcadorDestino = null;
let destinoSeleccionado = null;
let circuloPrecision = null;

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

  listaParadas.textContent = paradas.map((parada) => parada.nombre).join(" -> ");
}

function actualizarEstado(texto) {
  estado.textContent = texto;
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

    autocomplete = new google.maps.places.Autocomplete(inputDestino, {
      fields: ["formatted_address", "geometry", "name"],
      componentRestrictions: { country: "do" },
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) {
        destinoSeleccionado = null;
        return;
      }

      destinoSeleccionado = {
        nombre: place.formatted_address || place.name || inputDestino.value.trim(),
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };

      actualizarMarcadorDestino(destinoSeleccionado);
    });
  }

  renderizarMarcadoresParadas();
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
      label: `${parada.orden}`,
    });

    const info = new google.maps.InfoWindow({
      content: `<strong>${parada.nombre}</strong><br>Orden: ${parada.orden}`,
    });

    marcador.addListener("click", () => info.open({ anchor: marcador, map }));
    return marcador;
  });
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

function encontrarParadaMasCercana(usuario, listaParadasActual) {
  let mejorParada = null;

  for (const parada of listaParadasActual) {
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

function construirUrlRuta(origen, destino) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origen
  )}&destination=${encodeURIComponent(destino)}&travelmode=walking`;
}

function construirUrlRutaTransporte(origen, destino) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origen
  )}&destination=${encodeURIComponent(destino)}&travelmode=transit`;
}

function obtenerSiguienteParada(paradaActual) {
  const indiceActual = paradas.findIndex((parada) => parada.id === paradaActual.id);
  if (indiceActual === -1) {
    return null;
  }

  const indiceSiguiente = (indiceActual + 1) % paradas.length;
  return paradas[indiceSiguiente];
}

function mostrarResultado(parada, destino) {
  const distanciaMetros = Math.round(parada.distanciaKm * 1000);
  const siguienteParada = obtenerSiguienteParada(parada);
  const detalleRecorrido = siguienteParada
    ? ` Despues de ${parada.nombre}, la guagua sigue hacia ${siguienteParada.nombre}.`
    : "";
  mensajeResultado.textContent = `Mira, tienes la estacion ${parada.nombre} a ${distanciaMetros} metros. Ve a esa parada para iniciar tu trayecto hacia ${destino}.${detalleRecorrido}`;

  const origenUsuario = `${ubicacionUsuario.lat},${ubicacionUsuario.lng}`;
  const destinoParada = `${parada.lat},${parada.lng}`;
  const destinoFinal = destino.trim();

  rutaParada.href = construirUrlRuta(origenUsuario, destinoParada);
  rutaCompleta.href = construirUrlRutaTransporte(destinoParada, destinoFinal);
  accionesRuta.classList.remove("oculto");
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
  destinoSeleccionado = destino;
  actualizarMarcadorDestino(destino);
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

    const mejorParada = encontrarParadaMasCercana(ubicacionUsuario, paradas);

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

inputDestino.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") {
    buscarMejorParada();
  }
});

async function iniciarApp() {
  try {
    await cargarParadas();
    crearMapaSiDisponible();
    actualizarEstado("Paradas listas. Puedes escribir tu destino.");
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
