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

EXTRAORDINARIO: detecta si hoy hay algo relevante: salto del crudo (±3% o mas en el dia) O una noticia del sector cemento/Caribe (escasez, nueva licencia/cuota de importacion, arancel, movimiento de un competidor como Cemex/Rock Hard/The Buying House, algo que afecte a RD/Domicem o PR/Argos). Si lo hay, arma breaking {{"title","detail","url"}} con enlace real verificado. Si NO hay nada, breaking = null.

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
MODEL = os.environ.get("CLAUDE_MODEL") or "claude-sonnet-4-5"

with client.messages.stream(
    model=MODEL,
    max_tokens=4000,
    tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}],
    messages=[{"role": "user", "content": PROMPT}],
) as stream:
    resp = stream.get_final_message()

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

with open(outpath, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

vals = ", ".join(f"{i.get('label')}={i.get('value')}" for i in data.get("indicators", []))
print(f"OK: escrito {outpath} | {vals} | breaking={'si' if data.get('breaking') else 'no'}")
