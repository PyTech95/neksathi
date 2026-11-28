# TURN server setup (for in-app audio / video calls)

In-app calls (vehicle QR + **tag** scan → owner/family) use WebRTC. On most Indian
mobile networks both sides sit behind carrier NAT (CGNAT), so a direct peer link
fails and the call must be **relayed through a TURN server**. Without a working
TURN server the call rings but "doesn't connect" on mobile data — this is the
single biggest cause of flaky calls.

The backend already serves time-limited TURN credentials at `GET /api/turn-credentials`
using coturn's **REST API (use-auth-secret)** scheme. You only need to:
1. run a coturn server, and
2. give the backend the same shared secret.

If `TURN_SECRET` is **not** set, the app falls back to a free public TURN
(openrelay) that is rate-limited and unreliable — fine for a quick test, not for
production.

---

## 1. DNS
Point a host at your VPS public IP (the backend defaults to this name):

```
turn.neksathi.in   A   <YOUR_VPS_PUBLIC_IP>
```

## 2. Install coturn (Ubuntu/Debian)
```bash
sudo apt-get update && sudo apt-get install -y coturn
sudo sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

## 3. Generate a shared secret
```bash
openssl rand -hex 32        # copy the output -> this is your TURN_SECRET
```

## 4. /etc/turnserver.conf
Replace `<YOUR_VPS_PUBLIC_IP>` and `<TURN_SECRET>`:
```conf
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=<TURN_SECRET>
realm=turn.neksathi.in
# Public IP of this VPS (so relay candidates are reachable). If behind NAT use
# external-ip=PUBLIC_IP/PRIVATE_IP
external-ip=<YOUR_VPS_PUBLIC_IP>
# Relay port range (open these in the firewall too)
min-port=49152
max-port=65535
# Security hardening
no-cli
no-tlsv1
no-tlsv1_1
no-multicast-peers
# Don't relay to private/loopback ranges
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
# TLS (optional but recommended — enables turns:5349). See step 6.
# cert=/etc/letsencrypt/live/turn.neksathi.in/fullchain.pem
# pkey=/etc/letsencrypt/live/turn.neksathi.in/privkey.pem
log-file=/var/log/turnserver.log
```

## 5. Firewall
```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp
```
(On a cloud VPS, open the same ports in the provider's security group.)

## 6. (Recommended) TLS cert for turns:5349
```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d turn.neksathi.in
# then uncomment the cert=/pkey= lines in turnserver.conf
sudo usermod -aG ssl-cert turnserver 2>/dev/null || true
```

## 7. Start coturn
```bash
sudo systemctl enable coturn
sudo systemctl restart coturn
sudo systemctl status coturn --no-pager
```

## 8. Point the backend at it
Add to the backend's environment (`.env` / systemd / docker env) — **same secret
as step 3**:
```
TURN_SECRET=<TURN_SECRET>
TURN_HOST=turn.neksathi.in
```
Restart the backend.

## 9. Verify
- `curl https://api.neksathi.in/api/turn-credentials` → should return
  `"configured": true` with a `turn:turn.neksathi.in:3478` entry.
- Test the relay at https://icetest.info / Trickle ICE: add
  `turn:turn.neksathi.in:3478` with the username/credential from step 8's
  endpoint — you should see a `relay` candidate appear.

Once this is live, in-app audio **and** video calls (tags + vehicles) connect
reliably even when both phones are on mobile data.
