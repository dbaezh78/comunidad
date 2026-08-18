# Plan de Implementación — Sistema Comunidad

## Descripción General

Sistema web completo para gestión de comunidades católicas con Firebase (Auth + Firestore).
Estructura jerárquica: **Católica → Parroquia → Comunidades → Hermanos**.

---

## Estructura de Firestore (Base de Datos)

```
católica/
  └── parroquias/
        └── {parroquiaId}/
              ├── nombre
              ├── dirección
              └── comunidades/
                    └── {comunidadId}/
                          ├── numero          (1, 2, 3...)
                          ├── fechaFormacion  (siempre la más antigua)
                          ├── tipo            ("normal" | "union" | "fusion")
                          ├── comunidadesOrigen  (array, solo si union/fusion)
                          ├── responsables/
                          │     └── {1..8}/
                          │           ├── posicion       (1ro..8vo)
                          │           ├── hermanoId      (ref)
                          │           ├── esCasado       (bool)
                          │           └── parejaId       (ref, si esCasado)
                          └── hermanos/
                                └── (referencias a hermanos de la parroquia)

hermanos/                         ← colección global
  └── {hermanoId}/
        ├── uid              (Firebase Auth UID, si tiene cuenta)
        ├── parroquiaId
        ├── comunidadId
        ├── sexo             ("M" | "F")
        ├── primerNombre
        ├── segundoNombre
        ├── primerApellido
        ├── segundoApellido
        ├── fechaNacimiento
        ├── correo
        ├── telefono
        ├── direccion
        ├── location         { lat, lng }     ← Google Maps
        ├── esResponsable    (bool)
        ├── posicionResponsable (1..8 | null)
        └── activo           (bool)
```

> [!IMPORTANT]
> La colección `hermanos` es **global** para poder buscar un hermano por su UID de Google
> independientemente de a qué comunidad pertenece.

---

## Módulos a Desarrollar

### Módulo 1 — `hermanos.html`

Página con **dos vistas**:

#### Vista A: Formulario del hermano (cuando el hermano inicia sesión por primera vez)
- Datos pre-cargados desde Google (correo, nombre si está disponible)
- Campos editables:
  - Parroquia *(selector)*
  - Comunidad *(selector, depende de parroquia)*
  - Sexo *(M / F)*
  - Primer Nombre, Segundo Nombre
  - Primer Apellido, Segundo Apellido
  - Fecha de Nacimiento *(date picker)*
  - Correo *(pre-cargado desde Google)*
  - Teléfono
  - Dirección *(texto)*
  - Ubicación *(botón "Obtener mi ubicación" → guarda lat/lng)*
- Botón **Guardar**

#### Vista B: Perfil del hermano (cuando ya tiene datos registrados)
- Muestra nombre completo, comunidad, datos personales
- Botón **Editar**

---

### Módulo 2 — `comunidad.html`

Página de **administración de comunidad** (solo responsables/admins).

#### Sección A: Datos de la comunidad
- Parroquia
- No. Comunidad
- Fecha de formación
- Tipo: `Normal` / `Unión` / `Fusión`
  - Si Unión/Fusión: selector de comunidades de origen

#### Sección B: Responsables (1 al 8)

| # | Campo | Reglas |
|---|-------|--------|
| 1ro | Obligatorio | — |
| 2do–8vo | Opcionales | Solo si hay hermano asignado |

Para cada responsable:
- Buscar hermano por nombre
- Indicar si es **soltero/a** o **casado/a**
- Si es casado: buscar pareja (también hermano registrado)
- La pareja queda vinculada pero el **responsable formal** es el marido

#### Sección C: Lista de Hermanos

Tabla con los hermanos de la comunidad en **orden alfabético** por apellido:

| Nombre | Cumpleaños | Teléfono | Ubicación | Rol |
|--------|-----------|----------|-----------|-----|
| Pérez, Juan | 12/05 | 809-xxx-xxxx | 📍 | 1ro |
| Rodríguez, Ana | 03/11 | 829-xxx-xxxx | 📍 | Hermana |

- 📍 → al hacer clic abre Google Maps con opción de compartir
- Rol: `1ro`, `2do`... `8vo`, `Hermano`, `Hermana`

---

### Módulo 3 — Grupos de Preparación *(sorteo)*

> [!NOTE]
> Esto ya existe en `hermanos.js`. Hay que integrarlo con Firestore
> y agregar las variables de **paso**, **preparación** y **celebración**.

Estructura del grupo de preparación:
```
preparaciones/
  └── {preparacionId}/
        ├── comunidadId
        ├── paso           ("Primera Evangelización" | "Kerygma" | etc.)
        ├── tipo           ("preparacion" | "celebracion")
        ├── fecha
        └── grupos/
              └── {grupoId}/
                    ├── responsable    (hermanoId)
                    └── integrantes    (array de hermanoIds)
```

---

## Orden de Ejecución Propuesto

```
Fase 1 — Estructura base
  ├── Reglas de seguridad Firestore
  └── Colecciones iniciales (parroquias, hermanos, comunidades)

Fase 2 — hermanos.html
  ├── Formulario de registro
  ├── Perfil del hermano
  └── Integración con Google Auth

Fase 3 — comunidad.html
  ├── Datos de comunidad
  ├── Gestión de responsables
  └── Lista de hermanos con roles

Fase 4 — Grupos de preparación
  ├── Integrar sorteo actual con Firestore
  └── Añadir campos de paso/tipo/fecha

Fase 5 — Navegación y permisos
  ├── Menú entre páginas
  └── Reglas: quién puede editar qué
```

---

## Preguntas Abiertas

> [!IMPORTANT]
> Necesito que me confirmes estos puntos antes de empezar:

1. **¿Habrá más de una parroquia en el sistema?** ¿O es solo para una parroquia fija y la selección de parroquia es automática?

2. **¿Quién puede editar `comunidad.html`?** ¿Solo el 1er responsable? ¿Todos los responsables? ¿Un administrador especial?

3. **¿Los pasos de preparación son fijos?** ¿Cuáles son los nombres exactos de los pasos/etapas que maneja tu comunidad?

4. **¿Unión y Fusión son lo mismo operativamente**, o tienen diferencias en la lógica de datos?

5. **`hermanos.html`**: ¿Cualquier persona con Google puede registrarse, o solo personas que ya están en la base de datos (lista blanca)?

6. **El sorteo actual** en `index.html` — ¿se queda ahí o se mueve a `comunidad.html`?
