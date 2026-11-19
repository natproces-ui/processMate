"""Base Supabase simulée en mémoire, pour les tests (pas de réseau).

Couvre le sous-ensemble du client supabase-py utilisé par clinic :
table().select(cols).eq/neq/in_/is_/ilike/gte/lte/order/limit/execute,
insert / upsert / update / delete, et les jointures simples
« select('a,b,parent(x,y)') » via une clé étrangère <parent>_id ou nommée.

    db = FakeDB({"organisations": [...], "organisation_members": [...]})
    with mock.patch("database.supabase_client.get_supabase", return_value=db): ...
"""
import copy
import re
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

# table jointe → (table, colonne locale) ; sinon on essaie <table singulier>_id puis <table>_id
JOINS = {
    "organisations": ("organisations", "organisation_id"),
    "formalization_campaigns": ("formalization_campaigns", "campaign_id"),
    "workflows": ("workflows", "procedure_id"),
    "user_profiles": ("user_profiles", "user_id"),
    "equipes": ("equipes", "equipe_id"),
}


class FakeDB:
    def __init__(self, tables: Optional[Dict[str, List[Dict[str, Any]]]] = None, unique: Optional[Dict[str, List[tuple]]] = None):
        self.tables: Dict[str, List[Dict[str, Any]]] = copy.deepcopy(tables or {})
        self.unique = unique or {}
        self.storage = SimpleNamespace(from_=lambda _b: SimpleNamespace(
            upload=lambda **k: None, remove=lambda *a, **k: None, download=lambda *a, **k: b""))
        self.auth = SimpleNamespace(admin=SimpleNamespace())

    def table(self, name: str) -> "FakeQuery":
        return FakeQuery(self, name)

    def rows(self, name: str) -> List[Dict[str, Any]]:
        return self.tables.setdefault(name, [])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class FakeQuery:
    def __init__(self, db: FakeDB, table: str):
        self.db, self.name = db, table
        self.filters, self.cols = [], "*"
        self.op, self.payload, self.n, self.orders = "select", None, None, []

    # ── construction ──
    def select(self, cols: str = "*", **_k):
        self.cols = cols
        return self

    def eq(self, k, v):
        self.filters.append(lambda r: r.get(k) == v)
        return self

    def neq(self, k, v):
        self.filters.append(lambda r: r.get(k) != v)
        return self

    def in_(self, k, values):
        values = list(values)
        self.filters.append(lambda r: r.get(k) in values)
        return self

    def is_(self, k, v):
        self.filters.append(lambda r: r.get(k) is None if v in (None, "null") else r.get(k) is not None)
        return self

    def ilike(self, k, pattern):
        rx = re.compile("^" + re.escape(pattern).replace("%", ".*") + "$", re.I)
        self.filters.append(lambda r: r.get(k) is not None and bool(rx.match(str(r.get(k)))))
        return self

    def gte(self, k, v):
        self.filters.append(lambda r: r.get(k) is not None and r.get(k) >= v)
        return self

    def lt(self, k, v):
        self.filters.append(lambda r: r.get(k) is not None and r.get(k) < v)
        return self

    def lte(self, k, v):
        self.filters.append(lambda r: r.get(k) is not None and r.get(k) <= v)
        return self

    def order(self, k, desc: bool = False, **_kw):
        self.orders.append((k, desc))
        return self

    def limit(self, n):
        self.n = n
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def upsert(self, payload, **_k):
        self.op, self.payload = "upsert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    # ── exécution ──
    def _match(self) -> List[Dict[str, Any]]:
        return [r for r in self.db.rows(self.name) if all(f(r) for f in self.filters)]

    def _check_unique(self, row, rows):
        for cols in self.db.unique.get(self.name, []):
            if all(row.get(c) is not None for c in cols) and any(
                    all(o.get(c) == row.get(c) for c in cols) for o in rows if o is not row):
                raise RuntimeError(f"duplicate key value violates unique constraint on {self.name}{cols}")

    def _project(self, row):
        if self.cols.strip() == "*":
            return dict(row)
        out: Dict[str, Any] = {}
        for part in re.findall(r"[a-z_]+\([^)]*\)|[a-z_*]+", self.cols):
            if "(" in part:
                rel, inner = part[:-1].split("(", 1)
                target, local = JOINS.get(rel, (rel, rel.rstrip("s") + "_id"))
                parent = next((p for p in self.db.rows(target) if p.get("id") == row.get(local)), None)
                if parent is None:
                    out[rel] = None
                else:
                    keys = [c.strip() for c in inner.split(",")]
                    out[rel] = dict(parent) if "*" in keys else {c: parent.get(c) for c in keys}
            elif part == "*":
                out.update(row)
            else:
                out[part] = row.get(part)
        return out

    def execute(self):
        rows = self.db.rows(self.name)
        if self.op in ("insert", "upsert"):
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            created = []
            for item in items:
                row = {"id": str(uuid.uuid4()), "created_at": _now(), **copy.deepcopy(item)}
                if self.op == "upsert":
                    same = next((r for r in rows if r.get("id") == item.get("id")), None) if item.get("id") else None
                    if same:
                        same.update(item)
                        created.append(dict(same))
                        continue
                rows.append(row)
                try:
                    self._check_unique(row, rows)
                except Exception:
                    rows.remove(row)
                    raise
                created.append(dict(row))
            return SimpleNamespace(data=created, count=len(created))
        matched = self._match()
        if self.op == "update":
            for r in matched:
                r.update(copy.deepcopy(self.payload))
                self._check_unique(r, rows)
            return SimpleNamespace(data=[dict(r) for r in matched], count=len(matched))
        if self.op == "delete":
            self.db.tables[self.name] = [r for r in rows if r not in matched]
            return SimpleNamespace(data=[dict(r) for r in matched], count=len(matched))
        for k, desc in reversed(self.orders):
            matched = sorted(matched, key=lambda r: (r.get(k) is None, r.get(k)), reverse=desc)
        if self.n is not None:
            matched = matched[: self.n]
        data = [self._project(r) for r in matched]
        return SimpleNamespace(data=data, count=len(data))
