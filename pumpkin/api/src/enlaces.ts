/**
 * Imprime (JSON) el enlace de acceso directo de cada cuenta activa. Se corre dentro del
 * contenedor y la salida va directo a la carpeta de secretos: nunca al chat ni a git.
 *   docker exec pumpkin_accesos_web node dist/enlaces.js
 */
import { ROLES, tokenDirecto, type Usuario } from './auth.js'
import { BASE_URL } from './config.js'
import { pool, query } from './db.js'

const filas = await query<Usuario>(
  `SELECT id, usuario, nombre, rol, clave_hash, activo FROM usuarios
   WHERE activo ORDER BY rol DESC, usuario`,
)
console.log(
  JSON.stringify(
    filas.map((u) => ({
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol,
      rolNombre: ROLES[u.rol]?.nombre ?? u.rol,
      enlace: `${BASE_URL}/directo#${u.usuario}.${tokenDirecto(u)}`,
    })),
    null,
    2,
  ),
)
await pool.end()
