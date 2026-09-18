import json
import urllib.request
import urllib.error
import concurrent.futures
import datetime
import sys
import os

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
FEATURED = os.path.join(ROOT, 'public', 'catalog', 'featured.json')
STATUS = os.path.join(ROOT, 'public', 'catalog', 'status.json')

UA = 'InforaAI-HealthCheck/1.0'


def rpc(url, payload, timeout=15):
    for _ in range(3):
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'User-Agent': UA},
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read(2_000_000).decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (307, 308):
                loc = e.headers.get('Location')
                if loc:
                    if loc.startswith('/'):
                        from urllib.parse import urlsplit
                        p = urlsplit(url)
                        loc = f"{p.scheme}://{p.netloc}{loc}"
                    url = loc
                    continue
            try:
                body = e.read(2000).decode('utf-8', 'replace')
            except Exception:
                body = ''
            return e.code, body
        except Exception as e:
            return 0, str(e)[:200]
    return 0, 'too many redirects'


def parse_tools(body):
    """Return tool count from JSON or SSE body; -1 if not parseable."""
    try:
        j = json.loads(body)
        r = j.get('result', j)
        if isinstance(r, dict) and isinstance(r.get('tools'), list):
            return len(r['tools'])
        return -1
    except Exception:
        pass
    for line in body.split('\n'):
        if line.startswith('data:'):
            try:
                j = json.loads(line[5:].strip())
                r = j.get('result', j)
                if isinstance(r, dict) and isinstance(r.get('tools'), list):
                    return len(r['tools'])
            except Exception:
                continue
    return -1


def test_item(item):
    name, url = item['n'], item['u']
    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-03-26", "capabilities": {},
        "clientInfo": {"name": "infora-health", "version": "1.0"}}}
    st, body = rpc(url, init)
    if st == 0:
        return name, 'dead', 0, 0
    if st in (401, 403):
        return name, 'auth', 0, st
    if st == 200:
        tl = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        st2, body2 = rpc(url, tl, timeout=20)
        if st2 in (401, 403):
            return name, 'auth', 0, st2
        if st2 == 200:
            x = parse_tools(body2)
            return name, 'ok', max(x, 0), st2
        # reachable (initialize worked) but tools/list odd -> reachable, unknown tools
        return name, 'ok', 0, st2
    return name, 'dead', 0, st


def main():
    items = json.load(open(FEATURED))['items']
    # known endpoint corrections (idempotent)
    URL_FIXES = {
        'PayPal (official MCP)': 'https://mcp.paypal.com/http',
    }
    for item in items:
        if item['n'] in URL_FIXES:
            item['u'] = URL_FIXES[item['n']]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for name, s, x, h in ex.map(test_item, items):
            results.append({'n': name, 's': s, 'x': x, 'h': h})

    # conservative auth-badge fixes based on hard evidence:
    # 401/403 even on initialize -> the endpoint definitely requires a token.
    # NEVER auto-set 'none' from an anonymous tools/list success: Google etc.
    # publish tool metadata without auth but still require OAuth to call them.
    by_name = {r['n']: r for r in results}
    for item in items:
        r = by_name.get(item['n'])
        if not r:
            continue
        if r['s'] == 'auth' and item.get('a') == 'none':
            item['a'] = 'key'

    json.dump({'items': items}, open(FEATURED, 'w'), ensure_ascii=False, indent=1)
    out = {'t': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'r': results}
    json.dump(out, open(STATUS, 'w'), ensure_ascii=False, indent=1)

    counts = {'ok': 0, 'auth': 0, 'dead': 0}
    for r in results:
        counts[r['s']] += 1
    print('tested', len(items), counts)
    for r in results:
        print(r['s'], r['h'], 'tools=%d' % r['x'], r['n'])


if __name__ == '__main__':
    main()
