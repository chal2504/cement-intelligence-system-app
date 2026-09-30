#!/usr/bin/env python3
"""
Cement Intelligence System - pulso diario (corre en GitHub Actions, L-V).
Investiga con la API de Claude (busqueda web) los 4 indicadores del dia y
escribe data/daily/pulse.json con el esquema exacto que consume la app
("Modulo Hoy"). Luego el workflow hace commit + push y Vercel republica sola.
No depende de la nube de Cowork.
"""
import os, sys, re, json, datetime, subprocess

from anthropic import Anthropic

# Reparador de JSON tolerante (por si el modelo produce un desliz de formato)
try:
    from json_repair import repair_json
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "json-repair"])
    from json_repair import repair_json

# ---------- 1. Fecha de hoy ----------
today = datetime.date.today()
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
updated = today.isoformat()
updatedLabel = f"{today.day} {MESES[today.month-1]} {today.year}"

outdir = os.path.join("data", "daily")
outpath = os.path.join(outdir, "pulse.json")
os.makedirs(outdir, exist_ok=True)

print(f"Generando pulso diario para {updatedLabel}...")

# ---------- 2. Prompt (investigacion + esquema exacto de la app) ----------
PROMPT = f"""Eres el robot del "pulso diario" del Cement Intelligence System (app de inteligencia del sector cemento para Argos Puerto Rico y Domicem). Hoy es {updated}. Idioma: espanol.

USA la herramienta de busqueda web para hallar los valores MAS RECIENTES de HOY, cada uno con su fecha (fuentes utiles: tradingeconomics.com, oilprice.com, eia.gov, wise.com, hellenicshippingnews.com, balticexchange):
- Brent (US$/bbl) y su cambio del dia en %.
- WTI (US$/bbl) y su cambio del dia en %.
- Baltic Dry Index (BDI) nivel actual.
- USD/DOP (peso dominicano) nivel actual.

REGLAS DE SENTIMENT (convencion de COSTO): para Brent, WTI y BDI, BAJA = "favorable", SUBE = "adverse", plano/sin cambio = "neutral". Para USD/DOP deja "neutral" salvo movimiento fuerte (>1% dia). En "delta" usa ▲ para subidas, ▼ para bajadas, ≈ para plano (ej "▲ 1.2% dia", "▼ 0.8% dia", "≈"). NO inventes: si un dato falla, usa el mas reciente con su valor.

EXTRAORDINARIO: detecta si hoy hay algo relevante: salto del crudo (±3% o mas en el dia) O una noticia del sector cemento/Caribe (escasez, nueva licencia/cuota de importacion, arancel, movimiento de un competidor como Cemex/Rock Hard/The Buying House, algo que afecte a RD/Domicem o PR/Argos). Si lo hay, arma breaking {{"title","detail","url"}}. REGLA DE VERACIDAD (obligatoria): SOLO incluye breaking si tienes una fuente real que abriste y verificaste hoy; el "url" debe ser una pagina existente que REALMENTE contenga la noticia (prohibido inventar o adivinar URLs), y "detail" debe decir solo lo que la fuente reporta, sin cifras inventadas. Si no hay una fuente real verificable, breaking = null (mejor sin alerta que una alerta inventada).

Devuelve UNICAMENTE un objeto JSON valido (sin ```, sin texto antes ni despues) con este esquema EXACTO (respeta los nombres AL PIE DE LA LETRA):
{{
 "updated": "{updated}",
 "updatedLabel": "{updatedLabel}",
 "indicators": [
   {{"label": "Brent", "value": "US$84.03/bbl", "delta": "▼ 4.4% dia", "sentiment": "favorable"}},
   {{"label": "WTI", "value": "US$79.95/bbl", "delta": "▼ 5.6% dia", "sentiment": "favorable"}},
   {{"label": "Flete BDI", "value": "~2,700", "delta": "≈", "sentiment": "neutral"}},
   {{"label": "USD/DOP", "value": "59.04", "delta": "≈", "sentiment": "neutral"}}
 ],
 "breaking": null
}}
(breaking es null O el objeto {{"title","detail","url"}}.) Responde SOLO con el JSON."""

# ---------- 3. Llamada a la API con busqueda web ----------
client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# Modelos vigentes a probar en orden (auto-reparacion ante retiros de modelos).
_env_model = os.environ.get("CLAUDE_MODEL")
MODEL_CANDIDATES = [m for m in [
    _env_model,
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-5-5",
    "claude-opus-4-5-20250929",
    "claude-3-5-sonnet-20241022",
] if m]

def _looks_like_model_error(e):
    msg = str(e).lower()
    if "authentication" in msg or "credit" in msg or "billing" in msg or "quota" in msg:
        return False
    return any(k in msg for k in ("model", "not_found", "not found", "404", "does not exist", "invalid_request"))

resp = None
MODEL = None
_last_err = None
_errs = []
for _cand in MODEL_CANDIDATES:
    try:
        print(f"Intentando modelo: {_cand} ...")
        with client.messages.stream(
            model=_cand,
            max_tokens=4000,
            tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}],
            messages=[{"role": "user", "content": PROMPT}],
        ) as stream:
            resp = stream.get_final_message()
        MODEL = _cand
        print(f"Modelo OK: {_cand}")
        break
    except Exception as e:
        _last_err = e
        _errs.append(f"{_cand} -> {type(e).__name__}: {str(e)[:400]}")
        if _looks_like_model_error(e):
            print(f"Modelo {_cand} no disponible ({type(e).__name__}); probando el siguiente...")
            continue
        break  # error de clave/saldo u otro no relacionado a modelo: dejar de probar
if resp is None:
    # DIAGNOSTICO: publicar el error real donde se pueda leer (data/daily/_diag.txt)
    import traceback, subprocess
    diag = "DIAG generate_pulse " + updated + "\n\n" + "\n".join(_errs)
    if _last_err is not None:
        diag += "\n\n--- ultimo traceback ---\n" + "".join(
            traceback.format_exception(type(_last_err), _last_err, _last_err.__traceback__))
    try:
        with open(os.path.join("data", "daily", "_diag.txt"), "w", encoding="utf-8") as _f:
            _f.write(diag)
        subprocess.run(["git", "config", "user.name", "diag"], check=False)
        subprocess.run(["git", "config", "user.email", "diag@example.com"], check=False)
        subprocess.run(["git", "add", "data/daily/_diag.txt"], check=False)
        subprocess.run(["git", "commit", "-m", "diag: error de generacion del pulso"], check=False)
        subprocess.run(["git", "push"], check=False)
    except Exception:
        pass
    print(diag)
    raise RuntimeError("Fallo la generacion; ver data/daily/_diag.txt")


text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")


# ---------- 4. Extraer y validar el JSON ----------
def extract_json(s):
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s).rstrip("`").strip()
    start = s.find("{")
    end = s.rfind("}")
    frag = s[start:end+1] if (start != -1 and end != -1) else s
    try:
        return json.loads(frag)
    except Exception:
        return repair_json(frag, return_objects=True)


data = extract_json(text)

# Forzar fecha correcta (deterministica), pase lo que pase
data["updated"] = updated
data["updatedLabel"] = updatedLabel
data.setdefault("indicators", [])
if "breaking" not in data:
    data["breaking"] = None

# Red de seguridad: no publicar basura. Si no obtuvimos al menos Brent y WTI con
# valor, conservamos el pulse.json anterior (mejor un dato de ayer que uno vacio).
labels = {i.get("label", "").lower(): i for i in data.get("indicators", []) if isinstance(i, dict)}
got_brent = any("brent" in k and labels[k].get("value") for k in labels)
got_wti = any("wti" in k and labels[k].get("value") for k in labels)
if not (got_brent and got_wti):
    print("AVISO: no se obtuvieron Brent/WTI utiles; conservo el pulse.json anterior sin cambios.")
    sys.exit(0)

# Validar que el link de la alerta ABRA; si esta muerto, descartar la alerta completa
# (una alerta sin fuente real que cargue no debe mostrarse).
import urllib.request, urllib.error

def link_ok(u):
    if not u or not str(u).lower().startswith("http"):
        return False
    hdr = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(u, method=method, headers=hdr)
            with urllib.request.urlopen(req, timeout=10) as r:
                return getattr(r, "status", 200) not in (404, 410)
        except urllib.error.HTTPError as e:
            return e.code not in (404, 410)
        except Exception:
            if method == "GET":
                return False
            continue
    return False

if isinstance(data.get("breaking"), dict):
    if not link_ok(data["breaking"].get("url")):
        print("Alerta descartada: su link no abre (fuente no verificable).")
        data["breaking"] = None

with open(outpath, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

vals = ", ".join(f"{i.get('label')}={i.get('value')}" for i in data.get("indicators", []))
print(f"OK: escrito {outpath} | {vals} | breaking={'si' if data.get('breaking') else 'no'}")
