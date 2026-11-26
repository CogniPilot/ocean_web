"""Ocean Web room admission. Run behind HTTPS with a persistent SQLite file."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CAPACITY = 10
LEASE_SECONDS = 120


def initialize(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS seats (
                token TEXT PRIMARY KEY, room TEXT NOT NULL, fleet INTEGER NOT NULL,
                channel TEXT NOT NULL, expires REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS seats_by_room ON seats(room, fleet);
            CREATE INDEX IF NOT EXISTS seats_by_expiry ON seats(expires);
        """)


def assign(path, request, now):
    action = request.get("action")
    if action == "list":
        with closing(sqlite3.connect(path)) as db:
            rows = db.execute("SELECT fleet, count(*) FROM seats WHERE room = 'regatta' AND expires > ? GROUP BY fleet ORDER BY fleet LIMIT 128", (now,))
            return {"fleets": [{"fleet": n, "count": count} for n, count in rows]}
    token = request.get("token")
    if action not in ("join", "renew", "leave") or not isinstance(token, str) or not re.fullmatch(r"[0-9a-f-]{36}", token):
        raise ValueError("Invalid seat request")
    # Store only a digest of the per-tab bearer token.
    key = hashlib.sha256(token.encode()).hexdigest()
    room, preferred = request.get("room"), request.get("fleet", 1)
    if action == "join" and (not isinstance(room, str) or not 0 < len(room.strip()) <= 64 or
                             type(preferred) is not int or not 1 <= preferred <= 1000000):
        raise ValueError("Invalid room")
    with closing(sqlite3.connect(path, timeout=5)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM seats WHERE expires <= ?", (now,))
        if action == "leave":
            db.execute("DELETE FROM seats WHERE token = ?", (key,))
            return {}
        seat = db.execute("SELECT room, fleet, channel FROM seats WHERE token = ?", (key,)).fetchone()
        if seat:
            room, fleet, channel = seat
            db.execute("UPDATE seats SET expires = ? WHERE token = ?", (now + LEASE_SECONDS, key))
        elif action == "renew":
            raise LookupError("Seat expired")
        else:
            fleets = {number: (count, channel) for number, count, channel in db.execute(
                "SELECT fleet, count(*), min(channel) FROM seats WHERE room = ? GROUP BY fleet", (room,))}
            # A shared invite prefers its active fleet. Otherwise fill the first vacancy.
            fleet = preferred if preferred in fleets and fleets[preferred][0] < CAPACITY else 1
            if request.get("exact") is True:
                fleet = preferred
                if fleet in fleets and fleets[fleet][0] >= CAPACITY:
                    raise OverflowError("Fleet full")
            while fleet in fleets and fleets[fleet][0] >= CAPACITY:
                fleet += 1
            channel = fleets[fleet][1] if fleet in fleets else secrets.token_urlsafe(24)
            db.execute("INSERT INTO seats VALUES (?, ?, ?, ?, ?)", (key, room, fleet, channel, now + LEASE_SECONDS))
        return {"fleet": fleet, "channel": channel, "leaseSeconds": LEASE_SECONDS}


def ice_servers(secret, urls, token, now):
    username = f"{int(now) + 3600}:{hashlib.sha256(token.encode()).hexdigest()[:20]}"
    password = base64.b64encode(hmac.digest(secret.encode(), username.encode(), "sha1")).decode()
    return [{"urls": urls, "username": username, "credential": password}]


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Origin")
        if self.headers.get("Origin") in self.server.origins:
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.reply(200, {})

    def do_POST(self):
        if self.path != "/rooms":
            return self.reply(404, {})
        if self.headers.get("Origin") not in self.server.origins:
            return self.reply(403, {})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 2048:
                return self.reply(400, {})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError()
            now = time.time()
            result = assign(self.server.database, data, now)
            if result and self.server.turn_secret and (data["action"] == "join" or data.get("refreshTurn") is True):
                result["iceServers"] = ice_servers(self.server.turn_secret, self.server.turn_urls, data["token"], now)
        except (ValueError, UnicodeError):
            return self.reply(400, {})
        except OverflowError:
            return self.reply(409, {"error": "fleet_full"})
        except LookupError:
            return self.reply(410, {})
        except sqlite3.OperationalError:
            return self.reply(503, {})
        self.reply(200, result)


if __name__ == "__main__":
    database = os.environ.get("OCEAN_LOBBY_DB", "ocean-lobby.sqlite3")
    initialize(database)
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8787"))), Handler)
    server.database = database
    server.origins = os.environ.get("OCEAN_ORIGINS", "https://cognipilot.github.io").split(",")
    server.turn_secret = os.environ.get("OCEAN_TURN_SECRET")
    server.turn_urls = os.environ.get("OCEAN_TURN_URLS", "").split(",")
    if bool(server.turn_secret) != bool(server.turn_urls[0]):
        raise SystemExit("Set both OCEAN_TURN_SECRET and OCEAN_TURN_URLS for relay credentials")
    server.serve_forever()
