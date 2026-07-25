import os
import io
import re
import qrcode 
from reportlab.lib.pagesizes import portrait
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import ARRAY
from flask_mail import Mail, Message
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature

app = Flask(__name__, template_folder='../frontend', static_folder='../css')

# Configuración de Clave Secreta y Base de Datos
app.config['SECRET_KEY'] = 'rpxf ddbn cdbl otez'
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:diego@127.0.0.1:5432/bd_pruebas'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Configuración de Flask-Mail para Gmail
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = 'rjdjs2715@gmail.com'
app.config['MAIL_PASSWORD'] = 'rpxf ddbn cdbl otez'
app.config['MAIL_DEFAULT_SENDER'] = 'rjdjs2715@gmail.com'

mail = Mail(app)
db = SQLAlchemy(app)
serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])


# ==========================================
# MODELOS DE BASE DE DATOS
# ==========================================

class Alumno(db.Model):
    __tablename__ = 'Registro_Alumnos'
    __table_args__ = {'schema': 'public'}

    idAlumno = db.Column('idAlumno', db.Integer, primary_key=True)
    Nombre = db.Column('Nombre', db.String(50), nullable=False)
    Correo = db.Column('Correo', ARRAY(db.String(50)), nullable=False)
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
    """ Genera gafete para Elisa Carrillo: Imagen a 7cm, texto grande a la izquierda y QR a la derecha """
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
    # SECCIÓN INFERIOR: Texto a la izquierda | QR a la derecha
    # =========================================================
    c.setFillColorRGB(0, 0, 0)
    
    # Coordenadas base
    margen_izq = 0.5 * cm
    y_texto = pos_y_actual - 0.7 * cm

    # 2. Datos del usuario ALINEADOS A LA IZQUIERDA (Fuentes más grandes)
    nombre = usuario.Nombre.upper()
    c.setFont("Helvetica-Bold", 11)
    
    # Dividir el nombre si es muy largo para que no invada el QR
    if len(nombre) > 18:
        partes = nombre.split(' ')
        mitad = len(partes) // 2
        c.drawString(margen_izq, y_texto, " ".join(partes[:mitad]))
        y_texto -= 0.45 * cm
        c.drawString(margen_izq, y_texto, " ".join(partes[mitad:]))
    else:
        c.drawString(margen_izq, y_texto, nombre)

    y_texto -= 0.5 * cm
    c.setFont("Helvetica", 9)
    c.drawString(margen_izq, y_texto, f"Correo: {usuario.Correo}")

    y_texto -= 0.45 * cm
    c.drawString(margen_izq, y_texto, f"Tel: {usuario.Telefono}")

    y_texto -= 0.45 * cm
    c.drawString(margen_izq, y_texto, f"C.P.: {usuario.CodigoPostal}")

    # 3. Código QR ALINEADO A LA DERECHA
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(f"ELISA_CARRILLO-{usuario.idEmpresario}")
    qr.make(fit=True)
    
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    
    qr_reader = ImageReader(qr_buffer)
    
    tamano_qr = 3.3 * cm
    pos_qr_x = ANCHO - tamano_qr - (0.5 * cm)  # Ubicado en la esquina derecha
    pos_qr_y = pos_y_actual - tamano_qr - 0.4 * cm
    
    c.drawImage(qr_reader, pos_qr_x, pos_qr_y, width=tamano_qr, height=tamano_qr)

    # 4. Folio DEBAJO del código QR (Centrado con respecto al QR)
    pos_y_folio = pos_qr_y - 0.4 * cm
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(pos_qr_x + (tamano_qr / 2), pos_y_folio, f"Folio: {usuario.idEmpresario}")

    c.showPage()
    c.save()

    pdf_data = buffer_pdf.getvalue()
    buffer_pdf.close()

    # Guardar copia local
    carpeta_destino = "gafetes_guardados"
    os.makedirs(carpeta_destino, exist_ok=True)
    nombre_limpio = usuario.Nombre.replace(' ', '_')
    ruta_guardado = os.path.join(carpeta_destino, f"Gafete_ELISA_{usuario.idEmpresario}_{nombre_limpio}.pdf")

    with open(ruta_guardado, "wb") as f:
        f.write(pdf_data)

    return pdf_data
    """ Genera gafete para Elisa Carrillo con la imagen fijada a 9 cm de alto """
    ANCHO = 9.0 * cm
    ALTO = 14.0 * cm

    buffer_pdf = io.BytesIO()
    c = canvas.Canvas(buffer_pdf, pagesize=(ANCHO, ALTO))

    # 1. Imagen fijada EXACTAMENTE a 9 cm de alto
    alto_imagen = 6.0 * cm
    ruta_cartel = "backend/GALA DE ESTELLAS.png"
    
    pos_y_actual = ALTO - alto_imagen - (0.2 * cm)

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

    # 2. Datos del usuario (Nombre, Correo, Teléfono, CP)
    c.setFillColorRGB(0, 0, 0)
    pos_y_actual -= 0.4 * cm

    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(ANCHO / 2, pos_y_actual, f"{usuario.Nombre.upper()}")
    pos_y_actual -= 0.35 * cm

    c.setFont("Helvetica", 7)
    c.drawCentredString(ANCHO / 2, pos_y_actual, f"{usuario.Correo}")
    pos_y_actual -= 0.3 * cm
    c.drawCentredString(ANCHO / 2, pos_y_actual, f"Tel: {usuario.Telefono} | CP: {usuario.CodigoPostal}")
    pos_y_actual -= 0.3 * cm

    # 3. Código QR
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(f"ELISA_CARRILLO-{usuario.idEmpresario}")
    qr.make(fit=True)
    
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    
    qr_reader = ImageReader(qr_buffer)
    tamano_qr = 1.8 * cm
    pos_qr_x = (ANCHO - tamano_qr) / 2
    pos_qr_y = pos_y_actual - tamano_qr
    
    c.drawImage(qr_reader, pos_qr_x, pos_qr_y, width=tamano_qr, height=tamano_qr)

    # 4. Folio DEBAJO del código QR
    pos_y_folio = pos_qr_y - (0.3 * cm)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(ANCHO / 2, pos_y_folio, f"Folio: {usuario.idEmpresario}")

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
# GAFETE ESTÁNDAR (Para Alumnos y Empresarios)
# ---------------------------------------------------------
def crear_pdf_gafete(id_usuario, nombre_usuario, tipo_usuario="ALUMNO"):
    nombre_usuario = str(nombre_usuario).upper() if nombre_usuario else ""
    tipo_usuario = str(tipo_usuario).upper()

    ANCHO = 6.0 * 72
    ALTO = 9.0 * 72

    buffer_pdf = io.BytesIO()
    c = canvas.Canvas(buffer_pdf, pagesize=(ANCHO, ALTO))
    pos_y_disponible = ALTO - 15

    ruta_cartel = "backend/GALA DE ESTELLAS.png"
    if os.path.exists(ruta_cartel):
        try:
            cartel_img = ImageReader(ruta_cartel)
            img_w, img_h = cartel_img.getSize()
            cartel_ancho = 5.6 * 72
            cartel_alto = cartel_ancho * (img_h / img_w)
            
            pos_x = (ANCHO - cartel_ancho) / 2
            pos_y = ALTO - cartel_alto - 15
            
            c.drawImage(cartel_img, pos_x, pos_y, width=cartel_ancho, height=cartel_alto, mask='auto')
            pos_y_disponible = pos_y - 25
        except Exception as e:
            pos_y_disponible = ALTO - 100

    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(ANCHO / 2, pos_y_disponible, f"TIPO: {tipo_usuario}")
    
    c.setFont("Helvetica", 15)
    c.drawCentredString(ANCHO / 2, pos_y_disponible - 25, f"Folio: {id_usuario}")

    c.setFont("Helvetica-Bold", 15)
    if len(nombre_usuario) > 22:
        partes = nombre_usuario.split(' ')
        mitad = len(partes) // 2
        linea1 = " ".join(partes[:mitad])
        linea2 = " ".join(partes[mitad:])
        c.drawCentredString(ANCHO / 2, pos_y_disponible - 55, f"Nombre: {linea1}")
        c.drawCentredString(ANCHO / 2, pos_y_disponible - 75, linea2)
        ultimo_y_texto = pos_y_disponible - 75
    else:
        c.drawCentredString(ANCHO / 2, pos_y_disponible - 55, f"Nombre: {nombre_usuario}")
        ultimo_y_texto = pos_y_disponible - 55

    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(f"{tipo_usuario}-{id_usuario}")
    qr.make(fit=True)
    
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    
    qr_reader = ImageReader(qr_buffer)
    qr_tamano = 1.4 * 72
    pos_qr_x = (ANCHO - qr_tamano) / 2
    pos_qr_y = max(15, ultimo_y_texto - qr_tamano - 15)
    
    c.drawImage(qr_reader, pos_qr_x, pos_qr_y, width=qr_tamano, height=qr_tamano)

    c.showPage()
    c.save()

    pdf_data = buffer_pdf.getvalue()
    buffer_pdf.close()
    return pdf_data


def enviar_correo_gafete(email_destino, nombre_usuario, id_usuario, tipo_usuario="ALUMNO", objeto_usuario=None):
    try:
        if tipo_usuario.upper() == "ELISA_CARRILLO" and objeto_usuario is not None:
            bytes_pdf = crear_pdf_gafete_elisa(objeto_usuario)
        else:
            bytes_pdf = crear_pdf_gafete(id_usuario, nombre_usuario, tipo_usuario)

        nombre_mayus = nombre_usuario.upper()
        
        if tipo_usuario.upper() == "EMPRESARIO":
            asunto = f"Gafete Empresarial - Ballet Elisa Carrillo (Folio: {id_usuario})"
            cuerpo = f"Estimado(a) {nombre_mayus},\n\nAdjunto a este correo encontrará su Gafete de Acceso en PDF.\nFolio: {id_usuario}\n\nAtentamente,\nComité Organizador"
        elif tipo_usuario.upper() == "ELISA_CARRILLO":
            asunto = f"Gafete de Acceso - Evento Elisa Carrillo (Folio: {id_usuario})"
            cuerpo = f"Estimado(a) {nombre_mayus},\n\nTu registro para el Evento Elisa Carrillo ha sido exitoso.\nAdjunto encontrarás tu Gafete PDF.\nFolio: {id_usuario}\n\n¡Te esperamos!"
        else:
            asunto = f"Gafete de Alumno - Ballet Elisa Carrillo (Folio: {id_usuario})"
            cuerpo = f"¡Hola {nombre_mayus}!\n\nAdjunto encontrarás tu Gafete de Alumno en PDF.\nFolio: {id_usuario}\n\n¡Nos vemos pronto!"

        msg = Message(subject=asunto, recipients=[email_destino])
        msg.body = cuerpo
        nombre_clean = nombre_mayus.replace(' ', '_')
        msg.attach(
            filename=f"Gafete_{tipo_usuario.upper()}_{id_usuario}_{nombre_clean}.pdf",
            content_type="application/pdf",
            data=bytes_pdf
        )

        mail.send(msg)
        return True

    except Exception as e:
        print(f"❌ Error enviando correo: {e}")
        return False


# ==========================================
# RUTAS DE FLASK
# ==========================================

@app.route('/')
def alumnos():
    alumnos = Alumno.query.all()
    return render_template('alumnos.html', user_db=alumnos)


@app.route('/empresarios')
def empresarios():
    return render_template('empresarios.html')


@app.route('/eventoelisa')
def eventoelisa():
    return render_template("eventoelisa.html")


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
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; background-color: #ffffff;">
                <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                <h2 style="color: #e74c3c; margin-bottom: 15px; font-size: 22px;">Correo ya registrado</h2>
                <p style="color: #666; font-size: 15px; margin-bottom: 25px;">Este correo electrónico ya fue registrado previamente para este evento.</p>
                <a href="/eventoelisa" style="display: inline-block; padding: 12px 24px; background-color: #3498db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Volver al formulario</a>
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

        msg = Message(
            subject="Confirma tu registro - Evento Elisa Carrillo",
            recipients=[email]
        )
        msg.html = f"""
            <h3>¡Hola {nombre}!</h3>
            <p>Gracias por registrarte para el Evento Elisa Carrillo.</p>
            <p>Haz clic en el siguiente enlace para confirmar tu asistencia y recibir tu Gafete PDF:</p>
            <p>
                <a href="{url_confirmacion}" style="background-color: #28a745; color: white; padding: 12px 22px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Confirmar Registro y Recibir Gafete
                </a>
            </p>
        """
        mail.send(msg)

        return """
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; background-color: #ffffff;">
            <div style="font-size: 48px; margin-bottom: 15px;">✉️</div>
            <h2 style="color: #2c3e50; margin-bottom: 15px; font-size: 22px;">Te hemos enviado un correo de confirmación.</h2>
            <p style="color: #666; font-size: 15px; margin-bottom: 25px;">Por favor revisa tu bandeja de entrada para activar tu registro y recibir tu Gafete PDF.</p>
            <a href="/eventoelisa" style="display: inline-block; padding: 12px 24px; background-color: #3498db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Volver</a>
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
        Correo = request.form.get('email', '').strip().lower()

        alumno_existente = Alumno.query.filter(Alumno.Correo.any(Correo)).first()
        if alumno_existente:
            return """
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; background-color: #ffffff;">
                <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                <h2 style="color: #e74c3c; margin-bottom: 15px; font-size: 22px;">Correo ya registrado</h2>
                <p style="color: #666; font-size: 15px; margin-bottom: 25px;">Este correo electrónico ya se encuentra registrado.</p>
                <a href="/" style="display: inline-block; padding: 12px 24px; background-color: #3498db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Volver al inicio</a>
            </div>
            """, 400

        nuevo = Alumno(Nombre=Nombre, Correo=[Correo], confirmado=False)
        db.session.add(nuevo)
        db.session.commit()

        token_url = serializer.dumps(Correo, salt='email-confirm-salt')
        url_confirmacion = url_for('confirmar_email', token=token_url, _external=True)

        msg = Message(
            subject="Confirma tu registro de alumno",
            recipients=[Correo]
        )
        msg.html = f"""
            <h3>¡Hola {Nombre}!</h3>
            <p>Haz clic en el enlace para activar tu cuenta y recibir tu Gafete PDF:</p>
            <p><a href="{url_confirmacion}">Confirmar Registro</a></p>
        """
        
        mail.send(msg)
        return "<h2>Correo enviado correctamente. Revisa tu bandeja de entrada.</h2>"

    except Exception as e:
        db.session.rollback()
        return f"<h1>Ocurrió un error: {e}</h1>", 500


@app.route('/confirmar/<token>')
def confirmar_email(token):
    try:
        correo_validado = serializer.loads(token, salt='email-confirm-salt', max_age=3600)
    except SignatureExpired:
        return '<h1>El enlace ha expirado. Realiza el registro de nuevo.</h1>'
    except BadTimeSignature:
        return '<h1>El enlace de confirmación no es válido.</h1>'

    alumno = Alumno.query.filter(Alumno.Correo.any(correo_validado)).first()

    if alumno:
        if alumno.confirmado:
            return "<h2>Tu cuenta ya había sido confirmada previamente.</h2>"
        
        alumno.confirmado = True
        alumno.qr_code = generar_bytes_qr(alumno.idAlumno)

        enviar_correo_gafete(
            email_destino=correo_validado,
            nombre_usuario=alumno.Nombre,
            id_usuario=alumno.idAlumno,
            tipo_usuario="ALUMNO"
        )

        db.session.commit()
        return f"<h1>¡Registro Confirmado para {alumno.Nombre}! Revisa tu correo para ver tu gafete.</h1>"

    return "<h1>Alumno no encontrado.</h1>"


@app.route('/registro_empresario', methods=['POST'])
def registro_empresario():
    try:
        email = request.form.get('email', '').strip().lower()

        if not email or not es_correo_valido(email):
            return "<h1>Correo electrónico no válido.</h1>", 400

        empresario_existente = Empresario.query.filter_by(Correo=email).first()
        if empresario_existente:
            return "<h1>Este correo ya está registrado.</h1>", 400

        nombre = request.form.get('nombre', '').strip().upper()
        apellido_paterno = request.form.get('apellido_paterno', '').strip().upper()
        apellido_materno = request.form.get('apellido_materno', '').strip().upper()
        cargo = request.form.get('cargo', '').strip().upper()
        empresa = request.form.get('empresa', '').strip().upper()
        lada_pais = request.form.get('lada_pais', '').strip()
        telefono = request.form.get('telefono', '').strip()
        pais = request.form.get('pais', '').strip().upper()
        codigo_postal = request.form.get('codigo_postal', '').strip()
        ciudad = request.form.get('ciudad', '').strip().upper()
        calle_numero = request.form.get('calle_numero', '').strip().upper()

        nuevo_empresario = Empresario(
            Nombre=nombre,
            ApellidoPaterno=apellido_paterno,
            ApellidoMaterno=apellido_materno,
            Cargo=cargo,
            Empresa=empresa,
            LadaPais=lada_pais,
            Telefono=telefono,
            Pais=pais,
            CodigoPostal=codigo_postal,
            Ciudad=ciudad,
            CalleNumero=calle_numero,
            Correo=email,
            confirmado=False
        )

        db.session.add(nuevo_empresario)
        db.session.commit()

        payload = {'email': email, 'tipo': 'empresario'}
        token_url = serializer.dumps(payload, salt='email-confirm-salt')
        url_confirmacion = url_for('confirmar_email_generico', token=token_url, _external=True)

        msg = Message(
            subject="Confirmación de Registro - Ballet Elisa Carrillo",
            recipients=[email]
        )
        msg.html = f"""
            <h3>¡Hola {nombre} {apellido_paterno}!</h3>
            <p>Haz clic para confirmar tu asistencia y recibir tu Gafete PDF Empresarial:</p>
            <p><a href="{url_confirmacion}">Confirmar Registro</a></p>
        """
        mail.send(msg)

        return "<h2>¡Registro recibido con éxito! Revisa tu correo.</h2>"

    except Exception as e:
        db.session.rollback()
        return f"<h1>Ocurrió un error: {e}</h1>", 500


@app.route('/confirmar_generico/<token>')
def confirmar_email_generico(token):
    try:
        data = serializer.loads(token, salt='email-confirm-salt', max_age=3600)
    except (SignatureExpired, BadTimeSignature):
        return '<h1>El enlace ha expirado o no es válido.</h1>'

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
        nombre_completo = usuario.Nombre if usuario else ""
        id_reg = usuario.idAlumno if usuario else 0
        tipo_tag = "ALUMNO"

    if usuario:
        if usuario.confirmado:
            return "<h2>Tu cuenta ya había sido confirmada previamente.</h2>"
        
        usuario.confirmado = True
        usuario.qr_code = generar_bytes_qr(id_reg)

        enviar_correo_gafete(
            email_destino=email,
            nombre_usuario=nombre_completo,
            id_usuario=id_reg,
            tipo_usuario=tipo_tag,
            objeto_usuario=usuario
        )

        db.session.commit()
        return f"<h1>¡Registro Confirmado para {nombre_completo}! Tu gafete ha sido enviado al correo.</h1>"

    return "<h1>Usuario no encontrado.</h1>"


# ==========================================
# ESCÁNER Y CONTROL DE ACCESO
# ==========================================

@app.route('/escanear', methods=['GET', 'POST'])
def escanear():
    if request.method == 'POST':
        qr_data = request.form.get('qr_data', '').strip()
        modo = request.form.get('modo', 'entrada')
        
        asistente = None
        tipo_usuario = ""
        
        if '-' in qr_data:
            partes = qr_data.split('-')
            if partes[-1].isdigit():
                id_num = int(partes[-1])
                tag = partes[0].upper()
                
                if tag == "EMPRESARIO":
                    asistente = Empresario.query.get(id_num)
                    tipo_usuario = "Empresario"
                elif tag == "ELISA_CARRILLO":
                    asistente = eventlisa.query.get(id_num)
                    tipo_usuario = "Elisa Carrillo"
                else:
                    asistente = Alumno.query.get(id_num)
                    tipo_usuario = "Alumno"
        elif qr_data.isdigit():
            id_num = int(qr_data)
            asistente = Empresario.query.get(id_num)
            tipo_usuario = "Empresario"
            if not asistente:
                asistente = eventlisa.query.get(id_num)
                tipo_usuario = "Elisa Carrillo"
            if not asistente:
                asistente = Alumno.query.get(id_num)
                tipo_usuario = "Alumno"

        if not asistente:
            return responder_escaneo(
                exito=False, 
                mensaje="❌ ACCESO DENEGADO", 
                detalles=f'El ID "{qr_data}" no se encuentra registrado.', 
                pitido="error"
            )

        nombre = f"{asistente.Nombre} {getattr(asistente, 'ApellidoPaterno', '')}".strip()
        asistencias_actuales = getattr(asistente, 'asistencias', 0) or 0

        if modo == 'entrada':
            if asistencias_actuales >= 1:
                return responder_escaneo(
                    exito=False, 
                    mensaje="❌ LÍMITE ALCANZADO", 
                    detalles=f"{nombre} ya ingresó {asistencias_actuales}/1 veces.", 
                    pitido="error"
                )
            
            asistente.asistencias = asistencias_actuales + 1
            db.session.commit()
            
            return responder_escaneo(
                exito=True, 
                mensaje="✅ ENTRADA REGISTRADA", 
                detalles=f"{nombre} ({tipo_usuario})<br><br><strong style='font-size:22px;'>Entradas: {asistente.asistencias}/1</strong>", 
                pitido="exito"
            )

        elif modo == 'salida':
            if asistencias_actuales <= 0:
                return responder_escaneo(
                    exito=False, 
                    mensaje="⚠️ SALIDA DENEGADA", 
                    detalles=f"{nombre} no registra entradas activas.", 
                    pitido="error"
                )
            
            asistente.asistencias = asistencias_actuales - 1
            db.session.commit()
            
            return responder_escaneo(
                exito=True, 
                mensaje="🚪 SALIDA REGISTRADA", 
                detalles=f"{nombre} ({tipo_usuario})<br><br><strong style='font-size:22px;'>Entradas activas: {asistente.asistencias}/1</strong>", 
                pitido="exito"
            )

    return """
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Control de Acceso Zebra</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 15px; background: #f0f2f5; margin: 0; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 400px; margin: auto; }
            .btn-modo { padding: 15px; font-size: 18px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; margin: 5px; width: 45%; }
            .modo-entrada { background-color: #28a745; color: white; }
            .modo-salida { background-color: #dc3545; color: white; }
            .inactivo { opacity: 0.3; }
            input[type="text"] { font-size: 22px; padding: 12px; width: 85%; border-radius: 8px; border: 2px solid #007bff; text-align: center; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2 style="color:#0b2c70;">📷 Control de Acceso</h2>
            
            <div>
                <button id="btnEntrada" type="button" class="btn-modo modo-entrada" onclick="setModo('entrada')">🟢 ENTRADA</button>
                <button id="btnSalida" type="button" class="btn-modo modo-salida inactivo" onclick="setModo('salida')">🔴 SALIDA</button>
            </div>

            <form action="/escanear" method="POST" style="margin-top: 15px;">
                <input type="hidden" name="modo" id="input_modo" value="entrada">
                <input type="text" name="qr_data" id="qr_input" placeholder="Escanea el QR..." autofocus autocomplete="off">
            </form>
        </div>

        <script>
            function setModo(modo) {
                document.getElementById('input_modo').value = modo;
                if (modo === 'entrada') {
                    document.getElementById('btnEntrada').classList.remove('inactivo');
                    document.getElementById('btnSalida').classList.add('inactivo');
                } else {
                    document.getElementById('btnSalida').classList.remove('inactivo');
                    document.getElementById('btnEntrada').classList.add('inactivo');
                }
                document.getElementById('qr_input').focus();
            }

            const input = document.getElementById('qr_input');
            input.focus();
            document.addEventListener('click', () => input.focus());
        </script>
    </body>
    </html>
    """


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
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)