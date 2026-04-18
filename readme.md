# Rebirth

This TBD implemented as a fullstack project using React.js (and React Native) with TypeScript.

<br/>

## Project layout

- `service` - Bun.js API written in TypeScript.
- `frontend/web` - React.js web app powered by Vite.
- `frontend/mobile` - React Native mobile app powered by Expo.
- `shared` - TypeScript types, constants, and utilities shared by service and frontend apps.

<br/>

## Getting started

Install the dependencies using `bun install`.

<br/>

## Running

### PostgreSQL

Run PostgreSQL locally as a Docker container using `./start_db.sh`.<br/>
It starts or reuses a Docker container named `rebirth-db` and prints the matching `DATABASE_URL`.

### Service

Copy `.env.example` to `.env` and update the values in the file, if needed.<br/>
Run the service using `bun run dev:service` or `./dev_svc.sh` provided script.<br/>
It can be accessed at `http://localhost:9908`.

### Front-end

#### Web

Run the Web frontend using `bun run dev:web` or `./dev_web.sh` provided script.<br/>
It can be accessed at `http://localhost:9909`.

#### Mobile

Run the mobile frontend using:

- `bun run dev:mobile` starts Expo and opens the app on a connected Android device or emulator.<br/>
  (or use `./dev_mobile_android.sh` provided script)
- `bun run dev:mobile:ios` starts Expo and opens the app in an iOS simulator.
  (or use `./dev_mobile_ios.sh` provided script)
- `bun run dev:mobile:metro` starts only Metro for manual Expo Go scanning.

For mobile device testing, set `EXPO_PUBLIC_API_BASE_URL` to the service URL reachable from the device.
