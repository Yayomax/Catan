# Litoral

Juego de mesa en 3D para 2 a 6 jugadores, ambientado en las islas del delta. Cada jugador
funda ranchos, abre caminos, junta cinco recursos (madera, arcilla, yerba, pescado y piedra)
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
con ese código desde su navegador. Si alguien recarga o pierde conexión, vuelve a su lugar.

Para desarrollo, `npm run dev` levanta el servidor y Vite con recarga en `http://localhost:5173`.

## Jugar por internet

Es un solo proceso Node que sirve la página y el WebSocket, así que entra en cualquier
hosting de Node (Render, Railway, Fly.io):

- build: `npm install && npm run build`
- start: `npm start` (usa la variable `PORT` si existe)

Las salas viven en memoria: si el servidor se reinicia, las partidas en curso se pierden.

## Reglas

| Construcción | Costo | Efecto |
| --- | --- | --- |
| Camino | madera + arcilla | Conecta. 5 o más seguidos: Picada larga (2 puntos) |
| Rancho | madera + arcilla + yerba + pescado | 1 punto |
| Pueblo | 2 pescado + 3 piedra | 2 puntos, produce doble |
| Carta de oficio | yerba + pescado + piedra | Baqueano, Picada, Cosecha, Feria o Fiesta patronal |

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
