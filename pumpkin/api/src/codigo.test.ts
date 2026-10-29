import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizarCodigo } from './codigo.js'

test('lecturas válidas del lote', () => {
  assert.equal(normalizarCodigo('QR-001'), 'QR-001')
  assert.equal(normalizarCodigo(' qr-250 '), 'QR-250')
  assert.equal(normalizarCodigo('QR001'), 'QR-001')
  assert.equal(normalizarCodigo('QR-7'), 'QR-007')
  assert.equal(normalizarCodigo('7'), 'QR-007')
  assert.equal(normalizarCodigo('007'), 'QR-007')
  // Lector en teclado español: el guion llega como ' o ?
  assert.equal(normalizarCodigo("QR'045"), 'QR-045')
  assert.equal(normalizarCodigo('QR?045'), 'QR-045')
  assert.equal(normalizarCodigo('https://x.mx/p/QR-123'), 'QR-123')
})

test('fuera del lote o basura', () => {
  assert.equal(normalizarCodigo(''), null)
  assert.equal(normalizarCodigo('hola'), null)
  assert.equal(normalizarCodigo('QR-000'), null)
  assert.equal(normalizarCodigo('EMPRESARIO-12'), null)
  assert.equal(normalizarCodigo('12345'), null)
  // Fuera del lote pero bien formado: lo rechaza la base (NOT_FOUND), no el formato.
  assert.equal(normalizarCodigo('QR-251'), 'QR-251')
})
