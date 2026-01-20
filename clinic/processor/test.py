import ssl
import socket

context = ssl.create_default_context()
with socket.create_connection(("generativelanguage.googleapis.com", 443)) as sock:
    with context.wrap_socket(sock, server_hostname="generativelanguage.googleapis.com") as ssock:
        print(f"SSL établi : {ssock.version()}")
        print(f"Certificat : {ssock.getpeercert()['subject']}")