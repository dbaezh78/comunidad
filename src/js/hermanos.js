let todasLasPersonas = [];
let seleccionados = [];

// 1. Cargar datos del JSON
async function cargarNombres() {
    try {
        const response = await fetch('src/js/hermanos.json');
        const data = await response.json();
        // Solo trabajamos con personas que NO están en misión (activo: true)
        todasLasPersonas = data.personas.filter(p => p.activo);
        renderizarLista();
    } catch (error) {
        console.error("Error cargando el JSON:", error);
        document.getElementById('lista-check').innerText = "Error al cargar nombres.";
    }
}

// 2. Mostrar lista de checkboxes
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

// 3. Validar selección de responsables
function actualizarSeleccion() {
    const checks = document.querySelectorAll('input[type="checkbox"]:checked');
    seleccionados = Array.from(checks).map(cb => cb.value);
    
    document.getElementById('contador').innerText = `Seleccionados: ${seleccionados.length}`;
    document.getElementById('btnSortear').disabled = !(seleccionados.length >= 2 && seleccionados.length <= 10);
}

// 4. Lógica del Sorteo
document.getElementById('btnSortear').addEventListener('click', () => {
    // Identificar datos de los jefes seleccionados
    const responsablesData = todasLasPersonas.filter(p => seleccionados.includes(p.nombre));
    
    // Identificar a los que van al sorteo común
    let pozoComun = todasLasPersonas.filter(p => !seleccionados.includes(p.nombre));
    
    // Mezclar el pozo común aleatoriamente
    pozoComun.sort(() => Math.random() - 0.5);

    // Crear estructura de grupos
    const grupos = responsablesData.map(resp => ({
        responsable: resp.nombre,
        parejaEsperada: resp.pareja,
        integrantes: []
    }));

    let yaAsignados = new Set();

    // PASO A: Asignar parejas de los responsables inmediatamente
    grupos.forEach(grupo => {
        if (grupo.parejaEsperada) {
            const indexPareja = pozoComun.findIndex(p => p.nombre === grupo.parejaEsperada);
            if (indexPareja !== -1) {
                const pareja = pozoComun.splice(indexPareja, 1)[0];
                grupo.integrantes.push(pareja.nombre);
                yaAsignados.add(pareja.nombre);
            }
        }
    });

    // PASO B: Crear bloques para el resto (Matrimonios que no son jefes)
    let bloquesRestantes = [];
    let procesadosBloque = new Set();

    pozoComun.forEach(persona => {
        if (procesadosBloque.has(persona.nombre)) return;

        let bloque = [persona.nombre];
        procesadosBloque.add(persona.nombre);

        if (persona.pareja) {
            const indexPareja = pozoComun.findIndex(p => p.nombre === persona.pareja && !procesadosBloque.has(p.nombre));
            if (indexPareja !== -1) {
                bloque.push(pozoComun[indexPareja].nombre);
                procesadosBloque.add(pozoComun[indexPareja].nombre);
            }
        }
        bloquesRestantes.push(bloque);
    });

    // PASO C: Repartir bloques buscando el equilibrio (8, 8, 8, 7)
    bloquesRestantes.sort(() => Math.random() - 0.5);
    bloquesRestantes.forEach(bloque => {
        // Ordenar grupos por cantidad de personas (Responsable + Integrantes)
        grupos.sort((a, b) => (a.integrantes.length + 1) - (b.integrantes.length + 1));
        grupos[0].integrantes.push(...bloque);
    });

    // Orden final alfabético por responsable
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
            <ul>${g.integrantes.map(i => `<li>${i}</li>`).join('')}</ul>
            <p><small>Total: ${g.integrantes.length + 1}</small></p>
        `;
        contenedor.appendChild(card);
    });
}

cargarNombres();