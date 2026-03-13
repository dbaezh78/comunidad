let todasLasPersonas = [];
let seleccionados = [];

async function cargarNombres() {
    try {
        const response = await fetch('src/js/hermanos.json');
        const data = await response.json();
        todasLasPersonas = data.personas;
        renderizarLista();
    } catch (error) {
        console.error("Error cargando el JSON:", error);
        document.getElementById('lista-check').innerText = "Error al cargar nombres.";
    }
}

function renderizarLista() {
    const contenedor = document.getElementById('lista-check');
    contenedor.innerHTML = '';

    todasLasPersonas.forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'persona-item';
        div.innerHTML = `
            <input type="checkbox" id="p${index}" value="${p.nombre}" onchange="actualizarSeleccion()">
            <label for="p${index}">${p.nombre} ${p.pareja ? '💍' : ''}</label>
        `;
        contenedor.appendChild(div);
    });
}

function actualizarSeleccion() {
    const checks = document.querySelectorAll('input[type="checkbox"]:checked');
    seleccionados = Array.from(checks).map(cb => cb.value);
    
    const contador = document.getElementById('contador');
    const btn = document.getElementById('btnSortear');
    
    contador.innerText = `Seleccionados: ${seleccionados.length}`;
    btn.disabled = !(seleccionados.length >= 3 && seleccionados.length <= 10);
}

document.getElementById('btnSortear').addEventListener('click', () => {
    // 1. Filtrar los que no fueron seleccionados como jefes
    let disponibles = todasLasPersonas.filter(p => !seleccionados.includes(p.nombre));

    // 2. Mezclar aleatoriamente (Shuffle)
    disponibles.sort(() => Math.random() - 0.5);

    // 3. Inicializar grupos
    const grupos = seleccionados.map(nombre => ({
        responsable: nombre,
        integrantes: []
    }));

    let yaAsignados = new Set();

    disponibles.forEach(persona => {
        if (yaAsignados.has(persona.nombre)) return;

        // --- EL CAMBIO CLAVE AQUÍ ---
        // Ordenamos los grupos por cantidad de personas (incluyendo al responsable) 
        // para encontrar siempre el que tenga menos gente en ese momento.
        grupos.sort((a, b) => a.integrantes.length - b.integrantes.length);
        const grupoDestino = grupos[0]; 

        // Asignar a la persona principal
        grupoDestino.integrantes.push(persona.nombre);
        yaAsignados.add(persona.nombre);

        // Si tiene pareja y la pareja no es jefe ni ha sido asignada...
        if (persona.pareja && !seleccionados.includes(persona.pareja) && !yaAsignados.has(persona.pareja)) {
            // La agregamos al MISMO grupo para que no se separen
            grupoDestino.integrantes.push(persona.pareja);
            yaAsignados.add(persona.pareja);
        }
    });

    // Opcional: Volver a ordenar los grupos por nombre de responsable para la vista final
    grupos.sort((a, b) => a.responsable.localeCompare(b.responsable));

    mostrarResultados(grupos);
});

function mostrarResultados(grupos) {
    const contenedor = document.getElementById('resultados');
    contenedor.innerHTML = '';

    grupos.forEach(g => {
        const card = document.createElement('div');
        card.className = 'grupo-card';
        card.innerHTML = `
            <h3>${g.responsable}</h3>
            <ul>
                ${g.integrantes.map(i => `<li>${i}</li>`).join('')}
            </ul>
            <small>Total: ${g.integrantes.length + 1}</small>
        `;
        contenedor.appendChild(card);
    });
}

cargarNombres();