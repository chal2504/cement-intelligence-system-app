#!/usr/bin/env python3
"""
Cement Intelligence System - generador semanal de ediciones (corre en GitHub Actions).
Investiga con la API de Claude (busqueda web) y escribe data/editions/edicion-{N}.json
con el esquema exacto que consume la app. Luego el workflow hace commit + push,
y Vercel republica sola. No depende de la nube de Cowork.
"""
import os, sys, re, json, datetime, subprocess
from anthropic import Anthropic

# Reparador de JSON tolerante (por si el modelo produce un JSON con un desliz de formato)
try:
    from json_repair import repair_json
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "json-repair"])
    from json_repair import repair_json

# ---------- 1. Fecha y numero de edicion ----------
today = datetime.date.today()
monday = today - datetime.timedelta(days=today.weekday())      # lunes de esta semana
sunday = monday + datetime.timedelta(days=6)
BASE_MONDAY = datetime.date(2026, 8, 10)                        # Edicion #4
edition = 4 + (monday - BASE_MONDAY).days // 7
MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
if monday.month == sunday.month:
    week = f"{monday.day}-{sunday.day} {MESES[monday.month-1]} {sunday.year}"
else:
    week = f"{monday.day} {MESES[monday.month-1]}-{sunday.day} {MESES[sunday.month-1]} {sunday.year}"
timestamp = monday.isoformat()

outdir = os.path.join("data", "editions")
outpath = os.path.join(outdir, f"edicion-{edition}.json")
os.makedirs(outdir, exist_ok=True)
FORCE = os.environ.get("FORCE", "").lower() == "true"
if os.path.exists(outpath) and not FORCE:
    print(f"{outpath} ya existe; nada que generar (usa FORCE=true para regenerar).")
    sys.exit(0)

print(f"Generando Edicion #{edition} (semana {week})...")

# ---------- 2. Prompt de generacion (investigacion + esquema exacto de la app) ----------
PROMPT = f"""Eres el analista del "Cement Intelligence System", informe semanal tipo CIO del mercado del cemento del Caribe para Argos Puerto Rico y Domicem. Hoy es {today.isoformat()}. Genera la EDICION #{edition}, semana {week}.

USA la herramienta de busqueda web para investigar los datos MAS RECIENTES de esta semana, cada uno con su fecha:
- Precios/macro: Brent y WTI (nivel + delta semana/mes/ano); divisas USD/TRY, USD/COP, USD/DOP; fletes Baltic Dry (BDI), Handysize (BHSI), Supramax (BSI), Panamax (BPI) en US$/dia; combustibles petcoke FOB USGC, carbon API2, gas Henry Hub, diesel retail EE.UU. (EIA); SCM fly ash y escoria GGBFS (marca EST); clinker FOB Turquia, cemento granel FOB Turquia (S&P/Argus), clinker CIF Caribe triangulado (marca EST).
- Noticias de la semana: Cemex, Grupo Argos, Domicem, Cementos Cibao, Grupo Estrella/Panam, Caribbean Cement (Jamaica), Titan America, Heidelberg, Holcim/Amrize; regulacion/comercio (CBAM, aranceles EE.UU., antidumping, ASTM/PLC); construccion en el Caribe (PR, RD, Guyana, Barbados, Bahamas, Surinam, Trinidad, Haiti).
- MOVIMIENTOS DE MERCADO Y COMPETENCIA (prioridad alta): importadores entrando a mercados, licencias/cuotas de importacion, escasez que abre importacion, guerras arancelarias CARICOM/CET, disruptores. Busca por todo el Caribe (Rock Hard/Mark Maloney, The Buying House, Jamaica Logistics, Tank-Weld, Island Concrete, Gore, etc.). Recoge VARIOS movimientos etiquetados por mercado.
- EE.UU. importacion/exportacion (Domicem quiere exportar a EE.UU.): escasez, demanda, aranceles Seccion 232/301, antidumping/CVD sobre cemento/clinker, terminales Florida/Golfo.
- Marca EST toda estimacion triangulada o indice mensual/trimestral. En COSTOS: bajada=favorable(verde), subida=adverso(rojo), plano=neutral. NO inventes: si falta un dato usa el mas reciente con su fecha.

Devuelve UNICAMENTE un objeto JSON valido (sin ```, sin texto antes ni despues) con este esquema EXACTO (respeta los nombres AL PIE DE LA LETRA):
{{
 "meta": {{"edition": {edition}, "week": "{week}", "dates": "{week}", "timestamp": "{timestamp}"}},
 "hero": {{"eyebrow": "Informe de inteligencia - No es noticias, es interpretacion", "title": "titular del tema dominante de la semana", "lede": "2-4 frases", "stamp": "Datos al ... Las cifras marcadas EST son estimaciones trianguladas, no precios cotizados. Metodologia y fuentes al pie."}},
 "executiveSummary": [ {{"title": "...", "category": "cost|demand|competition|regulation|opportunity", "categoryLabel": "Costo|Demanda|Competencia|Regulacion|Oportunidad", "description": "por que importa (2o/3er orden)"}} ] (~10 eventos),
 "risks": {{"critical": [{{"title": "...", "description": "..."}}], "emerging": [ ... ], "opportunities": [ ... ]}},
 "priceBoard": [ {{"group": "Clinker & cemento|Combustibles|SCM (materiales cementantes suplementarios)|Fletes maritimos|Macro & divisas", "indicator": "...", "value": "US$89/bbl", "numeric": 89.0, "est": false, "week": {{"dir": "up|down|flat|nd", "sentiment": "favorable|adverse|neutral", "label": "▲ 2%|▼|≈|n/d"}}, "month": {{...}}, "year": {{...}}, "reference": "fuente + fecha"}} ] (LISTA PLANA; cada fila lleva su "group". Indicadores minimos: Clinker FOB Turquia, Cemento granel FOB Turquia, Clinker CIF Caribe(EST), Petcoke FOB USGC(EST), Carbon API2, Gas Henry Hub, Diesel EE.UU., Fly ash(EST), Escoria GGBFS(EST), BDI, Handysize, Supramax, Panamax, Brent, WTI, USD/TRY, USD/COP, USD/DOP),
 "landedCostChart": {{"origins": [ {{"origin": "Colombia", "fob": 54, "freight": 14, "total": 68}}, {{"origin": "Egipto", ...}}, {{"origin": "Argelia", ...}}, {{"origin": "Turquia", ...}}, {{"origin": "Vietnam", ...}} ]}},
 "boardBox": {{"argosPR": "...", "domicem": "...", "questions": ["...", "...", "..."]}},
 "sections": [ {{"id": "s2", "num": 2, "title": "Materias primas", "subtitle": "...", "subsections": [ {{"title": "Clinker", "content": "...", "why": "Caribe: ..."}} ]}} ] (SOLO s2..s13, num entero 2..13, 12 secciones: Materias primas, Combustibles, Fletes maritimos, Importaciones, SCM, Competencia, Caribe, Construccion, Regulacion, Finanzas, ESG, Tecnologia. Cada seccion 4-8 subsecciones {{title,content,why}}),
 "news": [ {{"category": "🏢 Empresas & competencia|📦 Materias primas, combustibles & fletes|🏝️ Caribe & construccion|⚖️ Regulacion & macro|EE.UU. — Importacion/Exportacion", "title": "...", "source": "...", "date": "...", "url": "https://...", "domicemImpact": true}} ] (~15, usa EXACTAMENTE una de esas 5 etiquetas; enlaces reales verificados; domicemImpact=true si afecta directo a RD/Domicem),
 "marketMoves": [ {{"actor": "...", "action": "import-license|market-entry|new-capacity|tariff-dispute|market-opportunity", "market": "Jamaica|Republica Dominicana|Puerto Rico|Barbados|Guyana|...", "detail": "...", "impact": "lectura para Argos PR / Domicem", "url": "https://..."}} ] (varios, por todo el Caribe)
}}
Responde SOLO con el JSON."""

# ---------- 3. Llamada a la API con busqueda web ----------
client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = os.environ.get("CLAUDE_MODEL") or "claude-sonnet-4-5"

with client.messages.stream(
    model=MODEL,
    max_tokens=32000,
    tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 8}],
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
        # el modelo dejo un desliz de formato o se corto: reparar
        return repair_json(frag, return_objects=True)

data = extract_json(text)

# Forzar meta correcta (deterministica), pase lo que pase
data["meta"] = {"edition": edition, "week": week, "dates": week, "timestamp": timestamp}

# Chequeos minimos de estructura
for key in ("hero", "executiveSummary", "priceBoard", "risks", "boardBox", "sections", "news", "marketMoves"):
    if key not in data:
        raise ValueError(f"Falta la clave requerida: {key}")

with open(outpath, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"OK: escrito {outpath} | exec={len(data['executiveSummary'])} "
      f"priceBoard={len(data['priceBoard'])} news={len(data['news'])} marketMoves={len(data['marketMoves'])}")
