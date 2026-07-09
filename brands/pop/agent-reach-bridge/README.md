# PROXe Listen bridge (Agent-Reach → listen_signals)

Pulls the **top things happening in Punjab right now** via Agent-Reach's
whole-web semantic search (Exa — free, no key, no cookies), classifies each hit
(issue category · sentiment · crisis / opposition / positive), and POSTs to
`/api/agent/listen/log`. Real news drives the Listener instead of seeded mock.

## Where it runs
Hostinger VPS `srv818908` (82.29.167.17), isolated in `/root/agent-reach/pop-listen-bridge/`.
Agent-Reach itself lives in `/root/agent-reach/` (Python venv). Nothing else on
the box is touched.

## Active (cron)
```
*/30 * * * * cd /root/agent-reach/pop-listen-bridge && PATH=/usr/local/bin:/usr/bin:/bin /usr/bin/node bridge.mjs >> bridge.log 2>&1
```

## Config (VPS-only, not committed)
`/root/agent-reach/pop-listen-bridge/.env`:
```
INBOUND_API_KEY=<pop INBOUND_API_KEY>
POP_PROXE_URL=https://pop-proxe.vercel.app
```

## Adding Twitter / Reddit later
Those need YOUR logged-in cookies (`agent-reach configure twitter-cookies …`).
Once configured, add `twitter search`/`rdt search` calls alongside the Exa query
loop and post with `source: 'twitter' | 'reddit'`.
