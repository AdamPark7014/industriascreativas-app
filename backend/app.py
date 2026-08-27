import io
import re
import base64
import qrcode 
import sib_api_v3_sdk
import os
from dotenv import load_dotenv
from sib_api_v3_sdk.rest import ApiException
from reportlab.lib.pagesizes import portrait
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from flask import Flask, request, url_for, send_from_directory, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ARRAY
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature

WEB_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'dist')
LOGO_GABOR_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'logo-gabor.png')

LEYENDA_CANJE = (
    "Canjea tu boleto digital por tu gafete físico en taquilla "
    "el día del evento."
)

# Paleta Tech Capital 2026 (tema oscuro). Estudiantes pasó de azul a verde.
# Las tuplas son para reportlab (0-1); los hex, para el HTML de correos y páginas.
HEX_ROSA_FICTI = '#ec1e63'
HEX_VERDE_FICTI = '#35d95c'
HEX_ELISA_MAGENTA = '#e33878'  # Gala Elisa: evento aparte, identidad propia
HEX_FONDO = '#050b1c'
HEX_PANEL = '#0a1428'
HEX_BORDE = '#1b2b4d'
HEX_TEXTO = '#ffffff'
HEX_TEXTO_TENUE = '#93a6c4'

COLOR_ROSA_FICTI = (0.925, 0.118, 0.388)  # #ec1e63 — empresas
COLOR_VERDE_FICTI = (0.208, 0.851, 0.361)  # #35d95c — estudiantes (antes azul #26b0d5)
COLOR_FONDO = (0.020, 0.043, 0.110)  # #050b1c
COLOR_TEXTO_TENUE = (0.576, 0.651, 0.769)  # #93a6c4

# URL pública del sitio. Los clientes de correo no cargan imágenes en data URI
# (Gmail las descarta), así que los logos de los correos se sirven por HTTPS
# desde el propio Flask, que publica web/dist en la raíz.
PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', '').strip().rstrip('/')

app = Flask(
    __name__,
    static_folder=WEB_DIST,
    static_url_path='',
)

# Configuración de Clave Secreta y Base de Datos
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'rpxf ddbn cdbl otez')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:diego@127.0.0.1:5432/bd_pruebas',
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# ==========================================
# CONFIGURACIÓN DE BREVO (Transaccionales)
# ==========================================
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.abspath(os.path.join(_BASE_DIR, '..'))
# Carga .env sin importar desde qué carpeta se arranque Flask
load_dotenv(dotenv_path=os.path.join(_BASE_DIR, '.env'))
load_dotenv(dotenv_path=os.path.join(_ROOT_DIR, '.env'))

BREVO_API_KEY = (os.getenv('API_KEYY') or os.getenv('BREVO_API_KEY') or '').strip()
REMITENTE_EMAIL = os.getenv('REMITENTE_EMAIL', 'myticket@experiencebt.com.mx').strip()
REMITENTE_NOMBRE = os.getenv('REMITENTE_NOMBRE', 'Gabor FICTI').strip()

if not BREVO_API_KEY:
    print('⚠️ BREVO: no se encontró API_KEYY / BREVO_API_KEY en backend/.env')
else:
    print(f'✅ BREVO: API key cargada ({BREVO_API_KEY[:6]}…{BREVO_API_KEY[-4:]})')

configuration = sib_api_v3_sdk.Configuration()
configuration.api_key['api-key'] = BREVO_API_KEY
api_client = sib_api_v3_sdk.ApiClient(configuration)
brevo_mail_api = sib_api_v3_sdk.TransactionalEmailsApi(api_client)

db = SQLAlchemy(app)
serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])


# ==========================================
# MODELOS DE BASE DE DATOS
# ==========================================

class Alumno(db.Model):
    __tablename__ = 'Registro_Alumnos'
    __table_args__ = {'schema': 'public'}

    idAlumno = db.Column('idAlumno', db.Integer, primary_key=True)
    Nombre = db.Column('Nombre', db.String(100), nullable=False)
    ApellidoPaterno = db.Column('ApellidoPaterno', db.String(100), nullable=True)
    Telefono = db.Column('Telefono', db.String(20), nullable=True)
    Correo = db.Column('Correo', ARRAY(db.String(50)), nullable=False)
    InstitucionEducativa = db.Column('InstitucionEducativa', db.String(200), nullable=True)
    Grado = db.Column('Grado', db.String(100), nullable=True)
    confirmado = db.Column('confirmado', db.Boolean, default=False)
    qr_code = db.Column('qr_code', db.LargeBinary, nullable=True)
    asistencias = db.Column(db.Integer, default=0)      


class eventlisa(db.Model):
    __tablename__ = 'Registro_elisaCarrillo'
    __table_args__ = {'schema': 'public'}

    idEmpresario = db.Column('idUsuario', db.Integer, primary_key=True)
    Nombre = db.Column('Nombre', db.String(100), nullable=False)
    Telefono = db.Column('Telefono', db.String(20), nullable=False)
    CodigoPostal = db.Column('CodigoPostal', db.String(20), nullable=False)
    Correo = db.Column('Correo', db.String(150), nullable=False, unique=True)
    confirmado = db.Column('confirmado', db.Boolean, default=False)
    qr_code = db.Column('qr_code', db.LargeBinary, nullable=True)
    asistencias = db.Column(db.Integer, default=0)


class Empresario(db.Model):
    __tablename__ = 'Registro_Empresarios'
    __table_args__ = {'schema': 'public'}

    idEmpresario = db.Column('idEmpresario', db.Integer, primary_key=True)
    Nombre = db.Column('Nombre', db.String(100), nullable=False)
    ApellidoPaterno = db.Column('ApellidoPaterno', db.String(100), nullable=False)
    ApellidoMaterno = db.Column('ApellidoMaterno', db.String(100), nullable=True)
    Cargo = db.Column('Cargo', db.String(100), nullable=True)
    Empresa = db.Column('Empresa', db.String(150), nullable=False)
    LadaPais = db.Column('LadaPais', db.String(10), nullable=True)
    Telefono = db.Column('Telefono', db.String(20), nullable=False)
    Pais = db.Column('Pais', db.String(50), nullable=False)
    CodigoPostal = db.Column('CodigoPostal', db.String(20), nullable=False)
    Ciudad = db.Column('Ciudad', db.String(100), nullable=False)
    Estado = db.Column('Estado', db.String(100), nullable=True)
    CalleNumero = db.Column('CalleNumero', db.String(150), nullable=True)
    Correo = db.Column('Correo', db.String(150), nullable=False, unique=True)
    
    PosicionEmpresa = db.Column('PosicionEmpresa', db.String(150), nullable=True)
    AreaResponsabilidad = db.Column('AreaResponsabilidad', db.String(150), nullable=True)
    SectorIndustria = db.Column('SectorIndustria', ARRAY(db.String(100)), nullable=True)
    NumEmpleados = db.Column('NumEmpleados', db.String(50), nullable=True)
    DecisionesCompra = db.Column('DecisionesCompra', db.String(100), nullable=True)
    Presupuesto = db.Column('Presupuesto', db.String(100), nullable=True)
    TiempoInversion = db.Column('TiempoInversion', db.String(100), nullable=True)
    ProductosInteres = db.Column('ProductosInteres', ARRAY(db.String(100)), nullable=True)

    confirmado = db.Column('confirmado', db.Boolean, default=False)
    qr_code = db.Column('qr_code', db.LargeBinary, nullable=True)
    asistencias = db.Column(db.Integer, default=0)


# ==========================================
# FUNCIONES AUXILIARES & GENERACIÓN DE PDF
# ==========================================

def es_correo_valido(correo):
    patron = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    return re.match(patron, correo) is not None


def wants_json():
    accept = request.headers.get('Accept', '')
    return 'application/json' in accept or request.args.get('format') == 'json'


def api_message(ok, message, status=200, **extra):
    payload = {'ok': ok, 'message': message, **extra}
    if wants_json():
        return jsonify(payload), status
    color = '#155724' if ok else '#721c24'
    return f"<h1 style='color:{color};font-family:Segoe UI,sans-serif'>{message}</h1>", status


def ensure_gabor_logo():
    """Genera un logo Gabor de boceto si aún no existe el archivo real."""
    os.makedirs(os.path.dirname(LOGO_GABOR_PATH), exist_ok=True)
    if os.path.exists(LOGO_GABOR_PATH):
        return LOGO_GABOR_PATH

    img = Image.new('RGB', (560, 144), color=(11, 44, 112))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('arial.ttf', 64)
        font_small = ImageFont.truetype('arial.ttf', 36)
    except Exception:
        font = ImageFont.load_default()
        font_small = font
    draw.text((40, 40), 'GABOR', fill=(255, 255, 255), font=font)
    draw.text((340, 52), 'FICTI', fill=(51, 204, 204), font=font_small)
    img.save(LOGO_GABOR_PATH, format='PNG')
    return LOGO_GABOR_PATH


_logo_gabor_blanco_cache = None


def logo_gabor_blanco_path():
    """El logo Gabor original es rojo y negro: sobre el fondo oscuro el texto
    desaparece. Se deriva una copia blanca del canal alfa, una sola vez."""
    global _logo_gabor_blanco_cache
    if _logo_gabor_blanco_cache and os.path.isfile(_logo_gabor_blanco_cache):
        return _logo_gabor_blanco_cache

    origen = ensure_gabor_logo()
    destino = os.path.join(os.path.dirname(origen), 'logo-gabor-blanco.png')
    try:
        with Image.open(origen) as im:
            im = im.convert('RGBA')
            blanco = Image.new('RGBA', im.size, (255, 255, 255, 0))
            blanco.putalpha(im.getchannel('A'))
            blanco.save(destino, format='PNG')
        _logo_gabor_blanco_cache = destino
        return destino
    except Exception:
        return origen


def logo_gabor_data_uri():
    """Data URI del logo en blanco, para el HTML que sirve Flask al navegador.
    Para correos NO se usa: ahí van URLs https (ver imagen_correo)."""
    path = logo_gabor_blanco_path()
    with open(path, 'rb') as f:
        encoded = base64.b64encode(f.read()).decode('utf-8')
    return f'data:image/png;base64,{encoded}'


def base_publica():
    """Raíz https del sitio para las imágenes de los correos.

    La app no lleva ProxyFix, así que `request.url_root` devuelve http detrás
    de nginx; varios clientes de correo no cargan imágenes por http. Se hace
    caso a X-Forwarded-Proto, que el proxy sí envía.
    """
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL
    try:
        raiz = request.url_root.rstrip('/')
        proto = request.headers.get('X-Forwarded-Proto', '').split(',')[0].strip()
        if proto == 'https' and raiz.startswith('http://'):
            raiz = 'https://' + raiz[len('http://'):]
        return raiz
    except Exception:
        return 'https://demo.experiencebt.com.mx'


def imagen_correo(nombre):
    """URL absoluta de un asset de web/dist, que Flask publica en la raíz."""
    return f'{base_publica()}/{nombre.lstrip("/")}'


def es_tipo_empresa(tipo_usuario):
    return str(tipo_usuario or '').upper() in ('EMPRESARIO', 'EMPRESA')


def acento_hex(tipo_usuario):
    """Rosa para empresas, verde para estudiantes.

    La Gala Elisa es otro evento con su propia identidad: conserva su magenta
    y no hereda el verde de estudiantes.
    """
    tipo = str(tipo_usuario or '').upper()
    if tipo == 'ELISA_CARRILLO':
        return HEX_ELISA_MAGENTA
    return HEX_ROSA_FICTI if es_tipo_empresa(tipo) else HEX_VERDE_FICTI


def texto_sobre_acento(tipo_usuario):
    """Sobre el verde claro el texto blanco no contrasta: va oscuro, igual que
    los botones del front. Sobre rosa y magenta, blanco."""
    return HEX_FONDO if acento_hex(tipo_usuario) == HEX_VERDE_FICTI else '#ffffff'


def bloque_leyenda_html():
    return f"""
    <div style="margin-top:18px;padding:14px 16px;border-radius:10px;background:#1d1705;border:1px solid #6b5410;color:#f0d68a;font-size:14px;line-height:1.45;">
      {LEYENDA_CANJE}
    </div>
    """


def plantilla_correo(tipo_usuario, contenido_html, preheader=''):
    """Envoltura oscura para los correos transaccionales.

    Va con tablas y estilos en línea a propósito: Outlook no entiende flexbox
    ni grid, y varios clientes tiran los bloques <style>. El atributo bgcolor
    acompaña a cada background-color por los clientes que ignoran el CSS.
    """
    acento = acento_hex(tipo_usuario)
    oculto = ''
    if preheader:
        oculto = (
            f'<div style="display:none;max-height:0;overflow:hidden;'
            f'mso-hide:all;font-size:1px;line-height:1px;color:{HEX_FONDO};">'
            f'{preheader}</div>'
        )

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
</head>
<body style="margin:0;padding:0;background-color:{HEX_FONDO};">
{oculto}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{HEX_FONDO}" style="background-color:{HEX_FONDO};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:26px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="{HEX_PANEL}" style="width:560px;max-width:100%;background-color:{HEX_PANEL};border:1px solid {HEX_BORDE};border-radius:16px;overflow:hidden;">
        <tr>
          <td height="4" bgcolor="{acento}" style="height:4px;line-height:4px;font-size:0;background-color:{acento};">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 28px 4px;">
            <img src="{imagen_correo('ficti-logo.png')}" alt="FICTI" width="118" style="width:118px;height:auto;display:inline-block;vertical-align:middle;border:0;" />
            <img src="{imagen_correo('tech-capital-logo.png')}" alt="Tech Capital" width="126" style="width:126px;height:auto;display:inline-block;vertical-align:middle;border:0;margin-left:14px;" />
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px 4px;font-family:'Segoe UI',Arial,sans-serif;color:{HEX_TEXTO};font-size:15px;line-height:1.55;">
            {contenido_html}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 28px 26px;border-top:1px solid {HEX_BORDE};">
            <img src="{imagen_correo('gabor-logo-footer-white.png')}" alt="Gabor Grupo Papelero" width="130" style="width:130px;height:auto;display:block;margin:0 auto;border:0;" />
          </td>
        </tr>
      </table>
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;">
        <tr>
          <td align="center" style="padding:14px 12px 0;font-family:'Segoe UI',Arial,sans-serif;color:{HEX_TEXTO_TENUE};font-size:12px;line-height:1.5;">
            <span style="color:{HEX_TEXTO_TENUE};">Recibes este correo porque te registraste en FICTI &middot; Tech Capital Puebla 2026.</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def pagina_confirmacion(titulo, cuerpo_html='', tipo_usuario='ALUMNO'):
    """Página oscura que ve el usuario tras pulsar el enlace del correo."""
    acento = acento_hex(tipo_usuario)
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{titulo}</title>
</head>
<body style="margin:0;padding:0;background-color:{HEX_FONDO};font-family:'Segoe UI',Arial,sans-serif;color:{HEX_TEXTO};">
  <div style="max-width:540px;margin:0 auto;padding:48px 20px;text-align:center;">
    <img src="{logo_gabor_data_uri()}" alt="Gabor Grupo Papelero" style="width:150px;height:auto;margin-bottom:22px;" />
    <h2 style="margin:0 0 10px;font-size:26px;font-weight:800;color:{acento};line-height:1.25;">{titulo}</h2>
    {cuerpo_html}
    {bloque_leyenda_html()}
    <p style="margin-top:26px;">
      <a href="/" style="display:inline-block;padding:12px 24px;border-radius:11px;border:1px solid {acento};color:{acento};text-decoration:none;font-weight:700;">Volver al menú</a>
    </p>
  </div>
</body>
</html>"""


def ensure_schema():
    """Agrega columnas nuevas de estudiantes sin romper tablas existentes."""
    statements = [
        'ALTER TABLE public."Registro_Alumnos" ADD COLUMN IF NOT EXISTS "ApellidoPaterno" VARCHAR(100)',
        'ALTER TABLE public."Registro_Alumnos" ADD COLUMN IF NOT EXISTS "Telefono" VARCHAR(20)',
    ]
    try:
        with db.engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))
    except Exception as e:
        print(f'⚠️ No se pudo actualizar esquema Alumnos: {e}')


def generar_bytes_qr(contenido):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(str(contenido))
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


# ---------------------------------------------------------
# GAFETE EXCLUSIVO PARA EVENTO ELISA CARRILLO (Imagen a 7cm)
# ---------------------------------------------------------

def crear_pdf_gafete_elisa(usuario):
    """ Genera gafete para Elisa Carrillo con correo multilínea automático a la izquierda del QR """
    ANCHO = 9.0 * cm
    ALTO = 14.0 * cm

    buffer_pdf = io.BytesIO()
    c = canvas.Canvas(buffer_pdf, pagesize=(ANCHO, ALTO))

    # 1. Imagen fijada EXACTAMENTE a 7 cm de alto
    alto_imagen = 7.0 * cm
    ruta_cartel = "backend/GALA DE ESTELLAS.png"
    
    pos_y_actual = ALTO - alto_imagen - (0.3 * cm)

    if os.path.exists(ruta_cartel):
        try:
            cartel_img = ImageReader(ruta_cartel)
            img_w, img_h = cartel_img.getSize()
            ancho_proporcional = alto_imagen * (img_w / img_h)
            
            if ancho_proporcional > (ANCHO - 0.4 * cm):
                ancho_proporcional = ANCHO - 0.4 * cm

            pos_x = (ANCHO - ancho_proporcional) / 2
            c.drawImage(cartel_img, pos_x, pos_y_actual, width=ancho_proporcional, height=alto_imagen, mask='auto')
        except Exception as e:
            print(f"⚠️ Error cargando cartel Elisa: {e}")

    # =========================================================
    # SECCIÓN INFERIOR: Configuración de espacios
    # =========================================================
    c.setFillColorRGB(0, 0, 0)
    
    tamano_qr = 3.3 * cm
    pos_qr_x = ANCHO - tamano_qr - (0.4 * cm)
    pos_qr_y = pos_y_actual - tamano_qr - 0.4 * cm

    margen_izq = 0.4 * cm
    ancho_disponible_texto = pos_qr_x - margen_izq - (0.2 * cm)
    y_texto = pos_y_actual - 0.6 * cm

    styles = getSampleStyleSheet()
    
    style_nombre = ParagraphStyle(
        'NombreStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=11,
        textColor='black'
    )
    
    style_correo = ParagraphStyle(
        'CorreoStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=8.5,
        textColor='black',
        wordWrap='CJK'
    )

    style_info = ParagraphStyle(
        'InfoStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor='black'
    )

    # --- 1. NOMBRE ---
    nombre_txt = usuario.Nombre.upper()
    p_nombre = Paragraph(nombre_txt, style_nombre)
    w_n, h_n = p_nombre.wrap(ancho_disponible_texto, 3 * cm)
    p_nombre.drawOn(c, margen_izq, y_texto - h_n)
    y_texto -= (h_n + 0.15 * cm)

    # --- 2. CORREO ---
    correo_txt = f"<b>Correo:</b><br/>{usuario.Correo}"
    p_correo = Paragraph(correo_txt, style_correo)
    w_c, h_c = p_correo.wrap(ancho_disponible_texto, 3 * cm)
    p_correo.drawOn(c, margen_izq, y_texto - h_c)
    y_texto -= (h_c + 0.15 * cm)

    # --- 3. TELÉFONO Y CP ---
    info_txt = f"<b>Tel:</b> {usuario.Telefono}<br/><b>C.P.:</b> {usuario.CodigoPostal}"
    p_info = Paragraph(info_txt, style_info)
    w_i, h_i = p_info.wrap(ancho_disponible_texto, 3 * cm)
    p_info.drawOn(c, margen_izq, y_texto - h_i)

    # =========================================================
    # CÓDIGO QR Y FOLIO
    # =========================================================
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(f"ELISA_CARRILLO-{usuario.idEmpresario}")
    qr.make(fit=True)
    
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    
    qr_reader = ImageReader(qr_buffer)
    c.drawImage(qr_reader, pos_qr_x, pos_qr_y, width=tamano_qr, height=tamano_qr)

    pos_y_folio = pos_qr_y - 0.35 * cm
    c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(pos_qr_x + (tamano_qr / 2), pos_y_folio, f"Folio: {usuario.idEmpresario}")

    c.showPage()
    c.save()

    pdf_data = buffer_pdf.getvalue()
    buffer_pdf.close()

    carpeta_destino = "gafetes_guardados"
    os.makedirs(carpeta_destino, exist_ok=True)
    nombre_limpio = usuario.Nombre.replace(' ', '_')
    ruta_guardado = os.path.join(carpeta_destino, f"Gafete_ELISA_{usuario.idEmpresario}_{nombre_limpio}.pdf")

    with open(ruta_guardado, "wb") as f:
        f.write(pdf_data)

    return pdf_data


# ---------------------------------------------------------
# GAFETE ESTÁNDAR (Empresa / Estudiante)
# ---------------------------------------------------------
_imagenes_escaladas = {}


def imagen_escalada(path, alto_px):
    """ImageReader de una copia reducida del PNG, cacheada en memoria.

    Los logos de origen son enormes (tech-capital-logo.png son 13403x4354) y
    reportlab los incrusta tal cual: el boleto salía de 2.5 MB por correo. A
    la altura a la que se dibujan, 3x en píxeles sobra para imprimir.
    """
    clave = (path, alto_px)
    if clave in _imagenes_escaladas:
        return ImageReader(io.BytesIO(_imagenes_escaladas[clave]))
    with Image.open(path) as im:
        im = im.convert('RGBA')
        if im.height > alto_px:
            ancho = max(1, round(im.width * alto_px / float(im.height)))
            im = im.resize((ancho, alto_px), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format='PNG', optimize=True)
    datos = buf.getvalue()
    _imagenes_escaladas[clave] = datos
    return ImageReader(io.BytesIO(datos))


def partir_en_lineas(texto, fuente, tam, ancho_max, medir):
    """Corta por palabras, no por número de caracteres."""
    lineas = []
    actual = ''
    for palabra in texto.split():
        prueba = f'{actual} {palabra}'.strip()
        if actual and medir(prueba, fuente, tam) > ancho_max:
            lineas.append(actual)
            actual = palabra
        else:
            actual = prueba
    if actual:
        lineas.append(actual)
    return lineas


def crear_pdf_gafete(id_usuario, nombre_usuario, tipo_usuario="ALUMNO", empresa="", cargo=""):
    """Boleto digital en tema oscuro Tech Capital 2026.

    El QR va sobre una placa blanca con margen: los lectores necesitan zona de
    silencio clara alrededor del código, y sobre el fondo oscuro no leería.
    """
    nombre_usuario = str(nombre_usuario).upper() if nombre_usuario else ""
    tipo_usuario = str(tipo_usuario).upper()
    empresa = str(empresa).upper() if empresa else ""
    cargo = str(cargo).upper() if cargo else ""
    es_empresa = es_tipo_empresa(tipo_usuario)
    accent = COLOR_ROSA_FICTI if es_empresa else COLOR_VERDE_FICTI

    ANCHO = 6.0 * 72
    ALTO = 9.0 * 72
    margin = 20
    assets_dir = os.path.join(os.path.dirname(__file__), "assets")

    buffer_pdf = io.BytesIO()
    c = canvas.Canvas(buffer_pdf, pagesize=(ANCHO, ALTO))

    # Fondo oscuro a sangre + marco del color del perfil
    c.setFillColorRGB(*COLOR_FONDO)
    c.rect(0, 0, ANCHO, ALTO, fill=1, stroke=0)
    c.setStrokeColorRGB(*accent)
    c.setLineWidth(9)
    c.roundRect(margin / 2, margin / 2, ANCHO - margin, ALTO - margin, 20, fill=0, stroke=1)

    # Logos FICTI + Tech Capital (los assets ya son blancos sobre transparente)
    logo_y = ALTO - 112
    logo_h = 40
    gap = 16
    ficti_path = os.path.join(assets_dir, "ficti-logo.png")
    tech_path = os.path.join(assets_dir, "tech-capital-logo.png")
    logos_drawn = False
    try:
        from PIL import Image as PILImage

        drawn = []
        for path in (ficti_path, tech_path):
            if not os.path.isfile(path):
                continue
            with PILImage.open(path) as im:
                im = im.convert("RGBA")
                bw, bh = im.size
            aspect = bw / float(bh) if bh else 1.0
            w = logo_h * aspect
            drawn.append((path, w))
        if drawn:
            total_w = sum(w for _, w in drawn) + gap * (len(drawn) - 1)
            x = (ANCHO - total_w) / 2
            for path, w in drawn:
                c.drawImage(
                    imagen_escalada(path, int(logo_h * 3)),
                    x,
                    logo_y,
                    width=w,
                    height=logo_h,
                    mask="auto",
                    preserveAspectRatio=True,
                )
                x += w + gap
            logos_drawn = True
    except Exception:
        logos_drawn = False

    if not logos_drawn:
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(ANCHO / 2, logo_y + 12, "FICTI  ·  TECH CAPITAL")

    # Filete de acento bajo la cabecera
    c.setStrokeColorRGB(*accent)
    c.setLineWidth(1)
    c.line(78, ALTO - 130, ANCHO - 78, ALTO - 130)

    etiqueta = "EMPRESA" if es_empresa else "ESTUDIANTE"
    c.setFillColorRGB(*accent)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(ANCHO / 2, ALTO - 152, etiqueta)

    # El nombre encoge si no cabe: un nombre desbordado arruina el boleto
    nombre_txt = nombre_usuario or "NOMBRE"
    ancho_util = ANCHO - 88
    tam = 19
    while tam > 11 and c.stringWidth(nombre_txt, "Helvetica-Bold", tam) > ancho_util:
        tam -= 1
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", tam)
    c.drawCentredString(ANCHO / 2, ALTO - 182, nombre_txt)

    y = ALTO - 206
    c.setFillColorRGB(*COLOR_TEXTO_TENUE)
    c.setFont("Helvetica", 12)
    c.drawCentredString(ANCHO / 2, y, f"Folio: {id_usuario}")
    y -= 18
    if empresa:
        c.setFont("Helvetica", 10)
        c.drawCentredString(ANCHO / 2, y, empresa)
        y -= 14
    if cargo:
        c.setFont("Helvetica", 10)
        c.drawCentredString(ANCHO / 2, y, cargo)
        y -= 14

    # Mascota
    muneco = os.path.join(assets_dir, "ficti-muneco.png")
    if os.path.isfile(muneco):
        try:
            mw = 1.6 * 72
            mh = 2.55 * 72
            mascot = imagen_escalada(muneco, int(mh * 3))
            c.drawImage(mascot, (ANCHO - mw) / 2, 232, width=mw, height=mh, mask="auto")
        except Exception:
            pass

    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(f"{'EMPRESARIO' if es_empresa else 'ALUMNO'}-{id_usuario}")
    qr.make(fit=True)

    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)

    qr_reader = ImageReader(qr_buffer)
    qr_tamano = 1.55 * 72
    placa_pad = 11
    placa = qr_tamano + placa_pad * 2
    placa_x = (ANCHO - placa) / 2
    placa_y = 84

    c.setFillColorRGB(1, 1, 1)
    c.roundRect(placa_x, placa_y, placa, placa, 10, fill=1, stroke=0)
    c.drawImage(
        qr_reader,
        placa_x + placa_pad,
        placa_y + placa_pad,
        width=qr_tamano,
        height=qr_tamano,
    )

    c.setFillColorRGB(*COLOR_TEXTO_TENUE)
    c.setFont("Helvetica-Oblique", 8)
    texto = "Canjea tu boleto por un gafete físico en taquilla el día del evento."
    lineas = partir_en_lineas(texto, "Helvetica-Oblique", 8, ANCHO - 96, c.stringWidth)
    ly = 66
    for linea in lineas[:3]:
        c.drawCentredString(ANCHO / 2, ly, linea)
        ly -= 11

    c.showPage()
    c.save()

    pdf_data = buffer_pdf.getvalue()
    buffer_pdf.close()
    return pdf_data


# ==========================================
# ENVÍO DE CORREOS MEDIANTE BREVO API
# ==========================================

def enviar_correo_confirmacion(
    email_destino,
    nombre,
    url_confirmacion,
    titulo_evento="Evento",
    tipo_usuario="ALUMNO",
):
    try:
        if not BREVO_API_KEY:
            print('❌ Error enviando correo de confirmación: BREVO API key ausente (backend/.env → API_KEYY)')
            return False
        acento = acento_hex(tipo_usuario)
        texto_boton = texto_sobre_acento(tipo_usuario)
        contenido = f"""
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:{acento};">Confirma tu registro</p>
              <h1 style="margin:0 0 14px;font-size:26px;font-weight:800;color:{HEX_TEXTO};line-height:1.2;">¡Hola {nombre}!</h1>
              <p style="margin:0 0 12px;color:{HEX_TEXTO_TENUE};">Gracias por registrarte para el <b style="color:{HEX_TEXTO};">{titulo_evento}</b>.</p>
              <p style="margin:0 0 20px;color:{HEX_TEXTO_TENUE};">Pulsa el botón para confirmar tu asistencia y recibir tu <b style="color:{HEX_TEXTO};">gafete digital con código QR</b>.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">
                <tr>
                  <td bgcolor="{acento}" style="background-color:{acento};border-radius:11px;">
                    <a href="{url_confirmacion}" style="display:inline-block;padding:14px 26px;color:{texto_boton};text-decoration:none;font-weight:700;font-size:15px;font-family:'Segoe UI',Arial,sans-serif;">
                      Confirmar registro y recibir mi gafete
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:12px;color:{HEX_TEXTO_TENUE};line-height:1.5;">Si el botón no funciona, copia este enlace en tu navegador:<br />
                <span style="color:{acento};word-break:break-all;">{url_confirmacion}</span>
              </p>
              {bloque_leyenda_html()}
        """
        html = plantilla_correo(
            tipo_usuario,
            contenido,
            preheader=f'Confirma tu registro para {titulo_evento} y recibe tu gafete digital.',
        )

        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": email_destino, "name": nombre}],
            sender={"name": REMITENTE_NOMBRE, "email": REMITENTE_EMAIL},
            subject=f"Confirma tu registro - {titulo_evento}",
            html_content=html
        )

        brevo_mail_api.send_transac_email(send_smtp_email)
        return True
    except Exception as e:
        print(f"❌ Error enviando correo de confirmación: {e}")
        return False


def enviar_correo_gafete(email_destino, nombre_usuario, id_usuario, tipo_usuario="ALUMNO", objeto_usuario=None):
    try:
        if not BREVO_API_KEY:
            print('❌ Error enviando gafete: BREVO API key ausente (backend/.env → API_KEYY)')
            return False
        empresa = getattr(objeto_usuario, 'Empresa', '') if objeto_usuario is not None else ''
        cargo = getattr(objeto_usuario, 'Cargo', '') if objeto_usuario is not None else ''

        if tipo_usuario.upper() == "ELISA_CARRILLO" and objeto_usuario is not None:
            bytes_pdf = crear_pdf_gafete_elisa(objeto_usuario)
        else:
            bytes_pdf = crear_pdf_gafete(
                id_usuario,
                nombre_usuario,
                tipo_usuario,
                empresa=empresa or '',
                cargo=cargo or '',
            )

        nombre_mayus = nombre_usuario.upper()
        acento = acento_hex(tipo_usuario)

        if tipo_usuario.upper() == "EMPRESARIO":
            asunto = f"Gafete digital - Empresa - Folio {id_usuario}"
            etiqueta = "Acreditación de empresa"
            saludo = f"Estimado(a) {nombre_mayus}"
        elif tipo_usuario.upper() == "ELISA_CARRILLO":
            asunto = f"Boleto de Acceso - Gala Elisa y Amigos 2026 (Folio: {id_usuario})"
            etiqueta = "Boleto de acceso"
            saludo = f"Estimado(a) {nombre_mayus}"
        else:
            asunto = f"Gafete digital - Estudiante - Folio {id_usuario}"
            etiqueta = "Acreditación estudiantil"
            saludo = f"¡Hola {nombre_mayus}!"

        contenido = f"""
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:{acento};">{etiqueta}</p>
          <h1 style="margin:0 0 14px;font-size:26px;font-weight:800;color:{HEX_TEXTO};line-height:1.2;">{saludo}</h1>
          <p style="margin:0 0 18px;color:{HEX_TEXTO_TENUE};">Tu registro quedó confirmado. Adjunto a este correo va tu <b style="color:{HEX_TEXTO};">gafete digital en PDF</b> con tu código QR.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border:1px solid {HEX_BORDE};border-radius:12px;">
            <tr>
              <td style="padding:16px 18px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:{HEX_TEXTO_TENUE};">Folio</p>
                <p style="margin:0;font-size:22px;font-weight:800;color:{acento};letter-spacing:.02em;">{id_usuario}</p>
              </td>
            </tr>
          </table>
          {bloque_leyenda_html()}
          <p style="margin:22px 0 0;color:{HEX_TEXTO_TENUE};">Atentamente,<br />Comité Organizador</p>
        """
        cuerpo = plantilla_correo(
            tipo_usuario,
            contenido,
            preheader=f'Tu gafete digital va adjunto. Folio {id_usuario}.',
        )

        pdf_base64 = base64.b64encode(bytes_pdf).decode('utf-8')
        nombre_clean = nombre_mayus.replace(' ', '_')
        nombre_archivo = f"Gafete_{tipo_usuario.upper()}_{id_usuario}_{nombre_clean}.pdf"

        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": email_destino, "name": nombre_mayus}],
            sender={"name": REMITENTE_NOMBRE, "email": REMITENTE_EMAIL},
            subject=asunto,
            html_content=cuerpo,
            attachment=[
                {
                    "name": nombre_archivo,
                    "content": pdf_base64
                }
            ]
        )

        brevo_mail_api.send_transac_email(send_smtp_email)
        return True

    except ApiException as e:
        print(f"❌ Error API Brevo enviando PDF: {e}")
        return False
    except Exception as e:
        print(f"❌ Error enviando correo con PDF: {e}")
        return False


# ==========================================
# RUTAS DE FLASK
# ==========================================

def spa_index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/api/health')
def api_health():
    """Chequeo de conectividad para frontend/proxy (no expone secretos)."""
    return jsonify({
        'ok': True,
        'service': 'evento-elisa-backend',
        'brevo_configured': bool(BREVO_API_KEY),
        'static_dist_exists': os.path.isdir(WEB_DIST) and os.path.isfile(os.path.join(WEB_DIST, 'index.html')),
        'routes': [
            '/registro_alumno',
            '/registro_empresario',
            '/registro_eventlisa',
            '/confirmar/<token>',
            '/confirmar_generico/<token>',
            '/escanear',
        ],
    })


@app.route('/')
@app.route('/estudiantes')
@app.route('/alumnos')
@app.route('/empresarios')
@app.route('/eventoelisa')
def spa_pages():
    return spa_index()


@app.route('/registro_eventlisa', methods=['POST'])
def registro_eventlisa():
    try:
        nombre = request.form.get('nombre', '').strip().upper()
        email = request.form.get('email', '').strip().lower()
        telefono = request.form.get('telefono', '').strip()
        cp = request.form.get('cp', '').strip()

        if not email or not es_correo_valido(email) or not nombre or not telefono or not cp:
            return "<h1>Por favor llena todos los campos correctamente.</h1>", 400

        existente = eventlisa.query.filter_by(Correo=email).first()
        if existente:
            return """
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 60px auto; padding: 40px 30px; border-radius: 12px; border: 1px solid rgba(227, 56, 120, 0.3); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15); text-align: center; background-color: #1a0818;">
    <!-- Icono de advertencia -->
    <div style="font-size: 52px; margin-bottom: 20px;">⚠️</div>
    
    <!-- Título de alerta en Dorado/Amarillo de la Gala -->
    <h2 style="color: #f4d142; margin-bottom: 15px; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
        Correo ya registrado
    </h2>
    
    <!-- Texto informativo en rosa pastel suave -->
    <p style="color: #d6b2c8; font-size: 15px; line-height: 1.5; margin-bottom: 30px;">
        Este correo electrónico ya fue registrado previamente para este evento.
    </p>
    
    <!-- Botón en Magenta principal -->
    <a href="/eventoelisa" style="display: inline-block; padding: 12px 28px; background-color: #e33878; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 700; letter-spacing: 0.5px; transition: all 0.3s ease;">
        Volver al formulario
    </a>
</div>
            """, 400

        nuevo = eventlisa(
            Nombre=nombre,
            Telefono=telefono,
            CodigoPostal=cp,
            Correo=email,
            confirmado=False
        )

        db.session.add(nuevo)
        db.session.commit()

        payload = {'email': email, 'tipo': 'eventlisa'}
        token_url = serializer.dumps(payload, salt='email-confirm-salt')
        url_confirmacion = url_for('confirmar_email_generico', token=token_url, _external=True)

        enviar_correo_confirmacion(
            email,
            nombre,
            url_confirmacion,
            "Evento Gala Elisa y Amigos 2026 con orquesta en vivo",
            tipo_usuario="ELISA_CARRILLO",
        )

        return """
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 60px auto; padding: 40px 30px; border-radius: 12px; border: 1px solid rgba(227, 56, 120, 0.3); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15); text-align: center; background-color: #1a0818;">
    <!-- Icono de correo -->
    <div style="font-size: 52px; margin-bottom: 20px;">✉️</div>
    
    <!-- Título principal en Magenta -->
    <h2 style="color: #e33878; margin-bottom: 15px; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
        Te hemos enviado un correo de confirmación.
    </h2>
    
    <!-- Texto secundario en rosa pastel suave -->
    <p style="color: #d6b2c8; font-size: 15px; line-height: 1.5; margin-bottom: 30px;">
        Por favor revisa tu bandeja de entrada para activar tu registro y recibir tu Boleto en PDF.
    </p>
    
    <!-- Botón en Magenta -->
    <a href="/eventoelisa" style="display: inline-block; padding: 12px 28px; background-color: #e33878; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 700; letter-spacing: 0.5px; transition: all 0.3s ease;">
        Volver
    </a>
</div>       
        """

    except Exception as e:
        db.session.rollback()
        print(f"❌ ERROR EN REGISTRO EVENTLISA: {e}")
        return f"<h1>Ocurrió un error al procesar el registro: {e}</h1>", 500


@app.route('/registro_alumno', methods=['POST'])
def registro():
    try:
        Nombre = request.form.get('nombre', '').strip().upper()
        Apellido = request.form.get('apellido_paterno', '').strip().upper()
        lada = request.form.get('lada_pais', '+52').strip() or '+52'
        Telefono_local = request.form.get('telefono', '').strip()
        Telefono = f"{lada} {Telefono_local}".strip()
        Correo = request.form.get('email', '').strip().lower()
        Institucion = request.form.get('institucion_educativa', '').strip().upper()
        Grado = request.form.get('grado', '').strip().upper()

        if not Nombre or not Apellido or not Telefono_local or not Correo or not es_correo_valido(Correo):
            return api_message(False, 'Completa mail, nombre, apellido y teléfono correctamente.', 400)
        if not Institucion or not Grado:
            return api_message(False, 'Institución educativa y grado son obligatorios.', 400)

        alumno_existente = Alumno.query.filter(Alumno.Correo.any(Correo)).first()
        if alumno_existente:
            return api_message(False, 'Este correo electrónico ya se encuentra registrado.', 400)

        nuevo = Alumno(
            Nombre=Nombre,
            ApellidoPaterno=Apellido,
            Telefono=Telefono,
            Correo=[Correo],
            InstitucionEducativa=Institucion,
            Grado=Grado,
            confirmado=False,
        )
        db.session.add(nuevo)
        db.session.commit()

        token_url = serializer.dumps(Correo, salt='email-confirm-salt')
        url_confirmacion = url_for('confirmar_email', token=token_url, _external=True)
        nombre_completo = f'{Nombre} {Apellido}'.strip()

        enviar_correo_confirmacion(
            Correo,
            nombre_completo,
            url_confirmacion,
            'Registro Estudiante - Gabor FICTI',
            tipo_usuario='ALUMNO',
        )

        if not BREVO_API_KEY:
            return api_message(
                False,
                'Registro guardado, pero falta API_KEYY de Brevo en backend/.env. No se pudo enviar el correo.',
                500,
            )

        return api_message(
            True,
            'Te enviamos un correo de confirmación. Al confirmar recibirás tu gafete con QR.',
        )
    except Exception as e:
        db.session.rollback()
        return api_message(False, f'Ocurrió un error: {e}', 500)


@app.route('/confirmar/<token>')
def confirmar_email(token):
    try:
        correo_validado = serializer.loads(token, salt='email-confirm-salt', max_age=3600)
    except SignatureExpired:
        return api_message(False, 'El enlace de confirmación expiró.', 400)
    except BadTimeSignature:
        return api_message(False, 'El enlace de confirmación no es válido.', 400)

    alumno = Alumno.query.filter(Alumno.Correo.any(correo_validado)).first()

    if alumno:
        if alumno.confirmado:
            return pagina_confirmacion(
                f"""Tu cuenta ya había sido confirmada previamente.""",
                f'',
                tipo_usuario="ALUMNO",
            )

        alumno.confirmado = True
        alumno.qr_code = generar_bytes_qr(f"ALUMNO-{alumno.idAlumno}")
        nombre_completo = f"{alumno.Nombre} {alumno.ApellidoPaterno or ''}".strip()

        enviar_correo_gafete(
            email_destino=correo_validado,
            nombre_usuario=nombre_completo,
            id_usuario=alumno.idAlumno,
            tipo_usuario="ALUMNO",
            objeto_usuario=alumno,
        )

        db.session.commit()
        return pagina_confirmacion(
            f"""¡Registro Confirmado para {nombre_completo}!""",
            f'''<p style="margin:0 0 10px;color:{HEX_TEXTO_TENUE};line-height:1.55;">Revisa tu correo: ahí llega tu gafete digital con código QR.</p>''',
            tipo_usuario="ALUMNO",
        )

    return api_message(False, 'Estudiante no encontrado.', 404)


@app.route('/registro_empresario', methods=['POST'])
def registro_empresario():
    try:
        email = request.form.get('email', '').strip().lower()

        if not email or not es_correo_valido(email):
            return api_message(False, 'Correo electrónico no válido.', 400)

        empresario_existente = Empresario.query.filter_by(Correo=email).first()
        if empresario_existente:
            return api_message(False, 'Este correo ya está registrado.', 400)

        nombre = request.form.get('nombre', '').strip().upper()
        apellido_paterno = request.form.get('apellido_paterno', '').strip().upper()
        apellido_materno = request.form.get('apellido_materno', '').strip().upper()
        cargo = request.form.get('cargo', '').strip().upper()  # optional / legacy
        empresa = request.form.get('empresa', '').strip().upper()
        lada_pais = request.form.get('lada_pais', '+52').strip()
        telefono = request.form.get('telefono', '').strip()
        pais = request.form.get('pais', 'MEXICO').strip().upper() or 'MEXICO'
        codigo_postal = request.form.get('codigo_postal', '00000').strip() or '00000'
        ciudad = request.form.get('ciudad', '').strip().upper()
        estado = request.form.get('estado', '').strip().upper()
        calle_numero = request.form.get('calle_numero', '').strip().upper()
        posicion_empresa = request.form.get('posicion_empresa', '').strip()
        area_responsabilidad = request.form.get('area_responsabilidad', '').strip()
        productos_interes = request.form.getlist('productos_interes')

        if not all([nombre, apellido_paterno, empresa, telefono, ciudad, estado]):
            return api_message(False, 'Faltan campos obligatorios del formulario empresa.', 400)

        nuevo_empresario = Empresario(
            Nombre=nombre,
            ApellidoPaterno=apellido_paterno,
            ApellidoMaterno=apellido_materno or None,
            Cargo=cargo or None,
            Empresa=empresa,
            LadaPais=lada_pais,
            Telefono=telefono,
            Pais=pais,
            CodigoPostal=codigo_postal,
            Ciudad=ciudad,
            Estado=estado,
            CalleNumero=calle_numero or None,
            Correo=email,
            PosicionEmpresa=posicion_empresa or None,
            AreaResponsabilidad=area_responsabilidad or None,
            ProductosInteres=productos_interes or None,
            confirmado=False,
        )

        db.session.add(nuevo_empresario)
        db.session.commit()

        payload = {'email': email, 'tipo': 'empresario'}
        token_url = serializer.dumps(payload, salt='email-confirm-salt')
        url_confirmacion = url_for('confirmar_email_generico', token=token_url, _external=True)

        enviar_correo_confirmacion(
            email,
            f"{nombre} {apellido_paterno}",
            url_confirmacion,
            "Registro Empresa - Gabor FICTI",
            tipo_usuario="EMPRESARIO",
        )

        if not BREVO_API_KEY:
            return api_message(
                False,
                'Registro guardado, pero falta API_KEYY de Brevo en backend/.env. No se pudo enviar el correo.',
                500,
            )

        return api_message(
            True,
            '¡Registro recibido! Revisa tu correo para confirmar y recibir tu gafete con QR.',
        )

    except Exception as e:
        db.session.rollback()
        return api_message(False, f'Ocurrió un error: {e}', 500)


@app.route('/confirmar_generico/<token>')
def confirmar_email_generico(token):
    try:
        data = serializer.loads(token, salt='email-confirm-salt', max_age=3600)
    except (SignatureExpired, BadTimeSignature):
        return pagina_confirmacion(
            f"""El enlace no es válido o expiró.""",
            f'',
            tipo_usuario="EMPRESARIO",
        )
    if isinstance(data, dict):
        email = data.get('email')
        tipo = data.get('tipo')
    else:
        email = data
        tipo = 'alumno'

    if tipo == 'empresario':
        usuario = Empresario.query.filter_by(Correo=email).first()
        nombre_completo = f"{usuario.Nombre} {usuario.ApellidoPaterno}" if usuario else ""
        id_reg = usuario.idEmpresario if usuario else 0
        tipo_tag = "EMPRESARIO"
    elif tipo == 'eventlisa':
        usuario = eventlisa.query.filter_by(Correo=email).first()
        nombre_completo = usuario.Nombre if usuario else ""
        id_reg = usuario.idEmpresario if usuario else 0
        tipo_tag = "ELISA_CARRILLO"
    else:
        usuario = Alumno.query.filter(Alumno.Correo.any(email)).first()
        nombre_completo = (
            f"{usuario.Nombre} {getattr(usuario, 'ApellidoPaterno', '') or ''}".strip()
            if usuario else ""
        )
        id_reg = usuario.idAlumno if usuario else 0
        tipo_tag = "ALUMNO"

    if usuario:
        if usuario.confirmado:
            return pagina_confirmacion(
                f"""Tu cuenta ya había sido confirmada previamente.""",
                f'',
                tipo_usuario=tipo_tag,
            )

        usuario.confirmado = True
        usuario.qr_code = generar_bytes_qr(f"{tipo_tag}-{id_reg}")

        enviar_correo_gafete(
            email_destino=email,
            nombre_usuario=nombre_completo,
            id_usuario=id_reg,
            tipo_usuario=tipo_tag,
            objeto_usuario=usuario
        )

        db.session.commit()
        return pagina_confirmacion(
            f"""¡Registro Confirmado para {nombre_completo}!""",
            f'''<p style="margin:0 0 10px;color:{HEX_TEXTO_TENUE};line-height:1.55;">Tu gafete digital con código QR fue enviado al correo.</p>''',
            tipo_usuario=tipo_tag,
        )
    return api_message(False, 'Usuario no encontrado.', 404)


# ==========================================
# ESCÁNER Y CONTROL DE ACCESO
# ==========================================

def buscar_asistente(qr_data):
    """Resuelve el QR a (asistente, etiqueta). Todo son búsquedas por clave
    primaria, así que la base de datos no es el cuello de botella aquí."""
    qr_data = (qr_data or '').strip()

    if '-' in qr_data:
        partes = qr_data.split('-')
        if partes[-1].isdigit():
            id_num = int(partes[-1])
            tag = partes[0].upper()
            if tag == "EMPRESARIO":
                return Empresario.query.get(id_num), "Empresario"
            if tag == "ELISA_CARRILLO":
                return eventlisa.query.get(id_num), "Elisa Carrillo"
            return Alumno.query.get(id_num), "Alumno"
    elif qr_data.isdigit():
        id_num = int(qr_data)
        asistente = Empresario.query.get(id_num)
        if asistente:
            return asistente, "Empresario"
        asistente = eventlisa.query.get(id_num)
        if asistente:
            return asistente, "Elisa Carrillo"
        return Alumno.query.get(id_num), "Alumno"

    return None, ""


def procesar_escaneo(qr_data, modo):
    """Aplica el escaneo y devuelve un dict con el resultado.

    La comparten la ruta de formulario y la de JSON, para que el escáner por
    AJAX y el POST clásico no puedan divergir de comportamiento.
    """
    asistente, tipo_usuario = buscar_asistente(qr_data)

    if not asistente:
        return {
            'ok': False,
            'mensaje': '❌ ACCESO DENEGADO',
            'detalles': f'El ID "{qr_data}" no se encuentra registrado.',
            'pitido': 'error',
            'nombre': '',
            'tipo': '',
            'asistencias': 0,
        }

    nombre = f"{asistente.Nombre} {getattr(asistente, 'ApellidoPaterno', '') or ''}".strip()
    asistencias_actuales = getattr(asistente, 'asistencias', 0) or 0

    if modo == 'salida':
        if asistencias_actuales <= 0:
            return {
                'ok': False,
                'mensaje': '⚠️ SALIDA DENEGADA',
                'detalles': f'{nombre} no registra entradas activas.',
                'pitido': 'error',
                'nombre': nombre,
                'tipo': tipo_usuario,
                'asistencias': asistencias_actuales,
            }
        asistente.asistencias = asistencias_actuales - 1
        db.session.commit()
        return {
            'ok': True,
            'mensaje': '🚪 SALIDA REGISTRADA',
            'detalles': f'{nombre} ({tipo_usuario})',
            'pitido': 'exito',
            'nombre': nombre,
            'tipo': tipo_usuario,
            'asistencias': asistente.asistencias,
        }

    if asistencias_actuales >= 1:
        return {
            'ok': False,
            'mensaje': '❌ LÍMITE ALCANZADO',
            'detalles': f'{nombre} ya ingresó {asistencias_actuales}/1 veces.',
            'pitido': 'error',
            'nombre': nombre,
            'tipo': tipo_usuario,
            'asistencias': asistencias_actuales,
        }

    asistente.asistencias = asistencias_actuales + 1
    db.session.commit()
    return {
        'ok': True,
        'mensaje': '✅ ENTRADA REGISTRADA',
        'detalles': f'{nombre} ({tipo_usuario})',
        'pitido': 'exito',
        'nombre': nombre,
        'tipo': tipo_usuario,
        'asistencias': asistente.asistencias,
    }


@app.route('/api/escanear', methods=['POST'])
def api_escanear():
    """Escaneo sin recargar la página.

    La ruta de formulario obligaba a dos navegaciones completas por boleto —
    y una de ellas volvía a descargar y arrancar todo el SPA de React — más un
    toque manual en "Escanear Siguiente". Aquí solo viaja el JSON.
    """
    datos = request.get_json(silent=True) or request.form
    qr_data = (datos.get('qr_data') or '').strip()
    modo = (datos.get('modo') or 'entrada').strip()

    if not qr_data:
        return jsonify({
            'ok': False,
            'mensaje': '❌ SIN DATOS',
            'detalles': 'No se recibió ningún código.',
            'pitido': 'error',
            'nombre': '',
            'tipo': '',
            'asistencias': 0,
        }), 400

    return jsonify(procesar_escaneo(qr_data, modo))


@app.route('/escanear', methods=['GET', 'POST'])
def escanear():
    if request.method == 'POST':
        resultado = procesar_escaneo(
            request.form.get('qr_data', '').strip(),
            request.form.get('modo', 'entrada'),
        )
        detalles = resultado['detalles']
        if resultado['ok']:
            etiqueta = 'Entradas' if resultado['pitido'] == 'exito' and 'ENTRADA' in resultado['mensaje'] else 'Entradas activas'
            detalles += f"<br><br><strong style='font-size:22px;'>{etiqueta}: {resultado['asistencias']}/1</strong>"
        return responder_escaneo(
            exito=resultado['ok'],
            mensaje=resultado['mensaje'],
            detalles=detalles,
            pitido=resultado['pitido'],
        )

    return spa_index()


def responder_escaneo(exito, mensaje, detalles, pitido):
    color_bg = "#d4edda" if exito else "#f8d7da"
    color_texto = "#155724" if exito else "#721c24"
    color_borde = "#c3e6cb" if exito else "#f5c6cb"

    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resultado Escaneo</title>
    </head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f0f2f5;">
        <div style="background-color: {color_bg}; color: {color_texto}; padding: 30px 20px; border-radius: 12px; border: 3px solid {color_borde}; max-width: 400px; margin: auto;">
            <h1 style="margin: 0; font-size: 28px;">{mensaje}</h1>
            <p style="font-size: 18px; margin-top: 15px;">{detalles}</p>
        </div>
        <br>
        <a href="/escanear" id="btnSiguiente" style="display: inline-block; padding: 18px 35px; background-color: #007bff; color: white; text-decoration: none; font-size: 22px; border-radius: 10px; font-weight: bold;">Escanear Siguiente</a>

        <script>
            function reproducirPitido() {{
                try {{
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    const ctx = new AudioContext();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    if ("{pitido}" === "exito") {{
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(880, ctx.currentTime);
                        gain.gain.setValueAtTime(0.5, ctx.currentTime);
                        osc.start();
                        osc.stop(ctx.currentTime + 0.15);
                    }} else {{
                        osc.type = 'sawtooth';
                        osc.frequency.setValueAtTime(150, ctx.currentTime);
                        gain.gain.setValueAtTime(0.8, ctx.currentTime);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.25);
                    }}
                }} catch(e) {{
                    console.log("Audio bloqueado:", e);
                }}
            }}
            window.onload = function() {{ reproducirPitido(); }};
        </script>
    </body>
    </html>
    """


# ==========================================
# PUNTO DE ENTRADA
# ==========================================

if __name__ == '__main__':
    with app.app_context():
        try:
            db.create_all()
            ensure_schema()
            print('OK Base de datos: conexion OK')
        except Exception as e:
            print(f'WARN Base de datos no disponible al iniciar: {e}')
        try:
            ensure_gabor_logo()
        except Exception as e:
            print(f'WARN No se pudo generar logo Gabor: {e}')
    app.run(host='0.0.0.0', port=5000, debug=True)