from flask_socketio import SocketIO, join_room

from src import create_app
from src.crawl.view.crawler_view import inject_event_bus, init_realtime_logging
from src.shared.event_bus import EventBus
from src.shared.event_handlers.logging_handler import LoggingEventHandler

app = create_app()
socketio = SocketIO(app, cors_allowed_origins="*")

event_bus = EventBus()
logging_handler = LoggingEventHandler()
event_bus.subscribe_to_all(logging_handler.handle)

inject_event_bus(event_bus)
init_realtime_logging(socketio, event_bus)


@socketio.on("join", namespace="/crawl")
def on_join(data):
    room = (data or {}).get("room")
    if room:
        join_room(room)


if __name__ == "__main__":
    socketio.run(app, debug=True, port=5000)
