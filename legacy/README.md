# Chain Duel — legacy frontend

Retired Express + Canvas 2D client. The active app is the repository root (React + PixiJS). This folder is kept for reference.

## Run

```bash
cd legacy
npm install
```

Create `legacy/.env`:

```
IP_SOCKET=[IP_OF_BACKEND_SERVER]
PORT_SOCKET=[PORT_OF_BACKEND_SERVER]
```

```bash
npm start   # http://localhost:3000
```

The backend is [marspay](https://github.com/francismars/marspayV2), a sibling checkout (`../../marspay` from this folder).
