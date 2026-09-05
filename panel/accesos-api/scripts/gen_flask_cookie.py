"""Generate a Flask session cookie for decoder roundtrip test."""
from flask import Flask
from flask.sessions import SecureCookieSessionInterface

SECRET = "test-secret-key-for-roundtrip"
app = Flask(__name__)
app.secret_key = SECRET
si = SecureCookieSessionInterface()
ser = si.get_signing_serializer(app)
assert ser is not None
cookie = ser.dumps(
    {"usuario": "admin", "nombre": "Administrador", "alcance": "interno", "_permanent": True}
)
print(SECRET)
print(cookie)
