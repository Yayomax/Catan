# Litoral

Juego de mesa en 3D para 2 a 6 jugadores, de colonizar una isla. Cada jugador
funda ranchos, abre caminos, junta cinco recursos (madera, ladrillo, lana, trigo y piedra)
según la tirada de dados, comercia con los demás y gana quien llega primero a 10 puntos.

Hecho con three.js (tablero, agua, piezas y dados) y un servidor Node con WebSocket que
valida todas las jugadas. Funciona en computadora y en celular.

## Cómo correrlo

```bash
npm install
npm run build
npm start        # http://localhost:3001
```

Una persona crea una sala y comparte el código de 4 letras (o el enlace). Los demás entran
con ese código desde su navegador, marcan "Estoy listo" y el anfitrión empieza la partida. Si alguien recarga o pierde conexión, vuelve a su lugar.

Para desarrollo, `npm run dev` levanta el servidor y Vite con recarga en `http://localhost:5173`.

## Despliegue con Docker Compose (Coolify)

El repo trae `Dockerfile` y `docker-compose.yml`. Es un solo contenedor que sirve la
página y el WebSocket en el puerto 3001.

En Coolify:

1. Nuevo recurso → repositorio Git → Build Pack **Docker Compose**
   (archivo `/docker-compose.yml`).
2. En el servicio `litoral`, asignar el dominio con el puerto del contenedor,
   por ejemplo `https://litoral.midominio.com:3001`.
3. Deploy. Coolify se ocupa del HTTPS y del proxy; el WebSocket usa el mismo dominio
   (`wss://…/ws`), no hace falta configurar nada más.

El compose no publica puertos en la VPS a propósito: el tráfico entra por el proxy de
Coolify. Para probar la imagen en tu máquina:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# http://localhost:3001
```

Las salas viven en memoria: cada redeploy o reinicio del contenedor corta las partidas
en curso. Tiene que correr una sola réplica.

## Reglas

Tablero según la cantidad de jugadores, con las cantidades del juego original:

| Jugadores | Terrenos | Fichas de número | Puertos | Cartas de oficio |
| --- | --- | --- | --- | --- |
| 2 a 4 | 19: 4 bosque, 4 pradera, 4 campo, 3 colina, 3 montaña, 1 desierto | 18, colocadas en espiral (orden A–R) desde una esquina al azar | 9: 4 de 3:1 y uno 2:1 por recurso | 25 |
| 5 a 6 | 30: 6 bosque, 6 pradera, 6 campo, 5 colina, 5 montaña, 2 desiertos | 28, al azar | 11: 5 de 3:1 y 6 de 2:1 (2 de lana) | 34 |

Los terrenos y el tipo de cada puerto se sortean en cada partida; un 6 y un 8 nunca quedan pegados.

| Construcción | Costo | Efecto |
| --- | --- | --- |
| Camino | madera + ladrillo | Conecta. 5 o más seguidos: Picada larga (2 puntos) |
| Rancho | madera + ladrillo + lana + trigo | 1 punto |
| Pueblo | 2 trigo + 3 piedra | 2 puntos, produce doble |
| Carta de oficio | lana + trigo + piedra | Baqueano, Picada, Cosecha, Feria o Fiesta patronal |

- Cada tirada, los terrenos con ese número dan recursos a los ranchos y pueblos de sus esquinas.
- Con un 7, quien tenga más de 7 cartas descarta la mitad y se mueve el yaguareté, que
  bloquea un terreno y permite quitarle una carta a un vecino.
- En los muelles se cambia 3:1 o 2:1; sin muelle, 4:1.
- 3 baqueanos jugados dan la Gran baqueanía (2 puntos).

## Estructura

- `shared/` — motor de reglas y generación del tablero (lo usan servidor y cliente)
- `server/` — salas, reconexión y validación de jugadas
- `client/` — interfaz y escena 3D
- `tests/` — pruebas del motor (`npm test`), incluye partidas completas simuladas
