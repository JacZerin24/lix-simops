from __future__ import annotations

import asyncio
from datetime import timedelta

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .state import session

app = FastAPI(title="LIX SimOps API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/session")
def get_session() -> dict:
    return session.snapshot()


async def broadcast(payload: dict) -> None:
    dead: list[WebSocket] = []
    for client in list(session.clients):
        try:
            await client.send_json(payload)
        except Exception:
            dead.append(client)
    for client in dead:
        session.clients.discard(client)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    session.clients.add(websocket)
    await websocket.send_json(session.snapshot())

    try:
        while True:
            message = await websocket.receive_json()
            kind = message.get("type")

            if kind == "control":
                action = message.get("action")
                if action == "start":
                    session.running = True
                elif action == "pause":
                    session.running = False
                elif action == "speed":
                    session.speed = max(0.0, min(float(message.get("speed", 1.0)), 8.0))
                await broadcast(session.snapshot())

            elif kind == "inject":
                payload = {
                    "type": "inject",
                    "title": message.get("title", "Exercise inject"),
                    "body": message.get("body", ""),
                    "audience": message.get("audience", "all"),
                }
                session.log.append(payload)
                await broadcast(payload)

            elif kind == "team_message":
                payload = {
                    "type": "team_message",
                    "team_id": message.get("team_id"),
                    "role": message.get("role"),
                    "body": message.get("body", ""),
                    "sim_time": session.sim_time.isoformat(),
                }
                session.log.append(payload)
                await broadcast(payload)

    except WebSocketDisconnect:
        session.clients.discard(websocket)


@app.on_event("startup")
async def start_clock_task() -> None:
    async def ticker() -> None:
        while True:
            await asyncio.sleep(1)
            if session.running and session.speed > 0:
                session.sim_time += timedelta(seconds=session.speed)
                await broadcast(session.snapshot())

    asyncio.create_task(ticker())
