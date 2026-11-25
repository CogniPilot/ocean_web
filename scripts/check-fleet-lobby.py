"""Check concurrent admission, invitation routing, reconnects and expiry."""
import sys
import tempfile
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
from fleet_lobby import LEASE_SECONDS, assign, initialize

with tempfile.TemporaryDirectory() as directory:
    database = Path(directory) / "seats.db"
    initialize(database)
    now = 1000

    def request(token, action="join", room="regatta", fleet=1):
        return assign(database, dict(action=action, token=token, room=room, fleet=fleet), now)

    def token():
        return str(uuid.uuid4())

    sailors = [token() for _ in range(31)]
    with ThreadPoolExecutor(max_workers=31) as pool:
        seats = list(pool.map(request, sailors))
    assert Counter(s["fleet"] for s in seats) == {1: 10, 2: 10, 3: 10, 4: 1}
    assert len({s["channel"] for s in seats}) == 4
    initialize(database)  # restart with active reservations
    for sailor, seat in zip(sailors, seats):
        assert request(sailor) == seat == request(sailor, "renew")
    first = next(i for i, s in enumerate(seats) if s["fleet"] == 1)
    request(sailors[first], "leave")
    assert request(token(), fleet=4)["fleet"] == 4  # follow a friend's link
    assert request(token()) == seats[first]  # first vacant seat, same channel
    assert request(token(), room="another room")["channel"] not in {s["channel"] for s in seats}
    spare = token()
    assert request(spare, fleet=2)["fleet"] == 4  # invited fleet full
    now += LEASE_SECONDS
    try:
        request(spare, "renew")
    except LookupError:
        pass
    else:
        raise AssertionError("Expired seat renewed")
    fresh = request(token())
    assert fresh["fleet"] == 1 and fresh["channel"] != seats[first]["channel"]
print("Concurrent 10/10/10/1, restart, idempotent retry, invites, leave, refill and expiry passed.")
