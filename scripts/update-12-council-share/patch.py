import sys
import base64

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, pairs):
    p = f'{root}/{path}'
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f'{path}: anchor count={n}: {old[:70]!r}')
        s = s.replace(old, new, 1)
    open(p, 'w').write(s)
    print(f'patched {path}')

HANDLER = base64.b64decode('ICAgIGNvbnN0IHNoYXJlQ291bmNpbCA9IGFzeW5jICgpID0+IHsKICAgICAgY29uc3QgbWVzc2FnZXMgPSBbCiAgICAgICAgLi4uYW5zd2Vycy5tYXAoKGEpID0+ICh7IHJvbGU6IGAke2EuZW1vaml9ICR7YS5wZXJzb25hfWAsIGNvbnRlbnQ6IGEuY29udGVudCB9KSksCiAgICAgICAgLi4uKHN1bW1hcnkgPyBbeyByb2xlOiAn8J+Pm++4jCBDb3VuY2lsIFN1bW1hcnknLCBjb250ZW50OiBzdW1tYXJ5IH1dIDogW10pLAogICAgICBdOwogICAgaWYgKCFtZXNzYWdlcy5sZW5ndGgpIHJldHVybjsKICAgICAgY29uc3QgeyBkYXRhLCBlcnJvcjogZXJyIH0gPSBhd2FpdCBzdXBhYmFzZS5ycGMoJ2NyZWF0ZV9zaGFyZWRfbGluaycsIHsKICAgICAgICBwX3RpdGxlOiBxdWVzdGlvbi50cmltKCkuc2xpY2UoMCwgODApIHx8ICdDb3VuY2lsIHNlc3Npb24nLAogICAgICAgIHBfbWVzc2FnZXM6IHsgbWVzc2FnZXMgfSwKICAgICAgfSk7CiAgICAgIGlmIChlcnIgfHwgIWRhdGEpIHsKICAgICAgICBhbGVydCgnQ291bGQgbm90IGNyZWF0ZSBzaGFyZSBsaW5rLicpOwogICAgICAgIHJldHVybjsKICAgICAgfQogICAgICBjb25zdCB1cmwgPSBgJHt3aW5kb3cubG9jYXRpb24ub3JpZ2lufSR7aW1wb3J0Lm1ldGEuZW52LkJBU0VfVVJMfXMvJHtkYXRhfWA7CiAgICAgIHRyeSB7IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHVybCk7IH0gY2F0Y2gge30KICAgICAgYWxlcnQoYFNoYXJlIGxpbmsgY29waWVkOlxuJHt1cmx9YCk7CiAgICB9Owo=').decode()

BUTTON = base64.b64decode('ICAgICAgeyhhbnN3ZXJzLmxlbmd0aCA+IDAgfHwgc3VtbWFyeSkgJiYgIWJ1c3kgJiYgKAogICAgICAgIDxidXR0b24gb25DbGljaz17c2hhcmVDb3VuY2lsfSBjbGFzc05hbWU9ImJ0bi1wcmltYXJ5IG10LTQiPvCflJcgU2hhcmUgdGhpcyBjb3VuY2lsIHNlc3Npb248L2J1dHRvbj4KICAgICAgKX0K').decode()

SV = base64.b64decode('e20ucm9sZSA9PT0gJ3VzZXInID8gJ1F1ZXN0aW9uJyA6IG0ucm9sZSA9PT0gJ2Fzc2lzdGFudCcgPyAnSW5mb3JhJyA6IG0ucm9sZX0=').decode()

# Council.tsx: share handler + button
patch('src/routes/Council.tsx', [
    ('  return (\n    <div className="mx-auto max-w-3xl p-4 sm:p-6">',
     HANDLER + '  return (\n    <div className="mx-auto max-w-3xl p-4 sm:p-6">'),
    ('      {charged !== null && !busy && (',
     BUTTON + '      {charged !== null && !busy && ('),
])

# SharedView.tsx: show persona names as labels for council shares
patch('src/routes/SharedView.tsx', [
    ("{m.role === 'user' ? 'Question' : 'Infora'}", SV),
])

print('Update 12 complete')
