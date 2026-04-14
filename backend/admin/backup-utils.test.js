const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBackupPayload } = require('./backup-utils');

test('buildBackupPayload enmascara correo root en export funcional', () => {
  const payload = buildBackupPayload({
    carreras: [
      {
        id: 1,
        nombre: 'Curso Demo',
        creadoPor: 'joel_barrera@outlook.com',
        modificadoPor: 'joel_barrera@outlook.com',
      },
    ],
    usuarios: [
      {
        id: 2,
        login: 'admin-fhycs',
        email: 'admin@unam.edu.ar',
        creadoPor: 'joel_barrera@outlook.com',
      },
    ],
    config: {
      root_password_changed_by: 'joel_barrera@outlook.com',
      sitio_en_construccion_modificado_por: 'joel_barrera@outlook.com',
    },
    auditLog: [
      {
        action: 'LOGIN',
        detail: 'Acceso del root joel_barrera@outlook.com',
        user: 'joel_barrera@outlook.com',
        rol: 'root',
      },
    ],
  });

  assert.equal(payload.carreras[0].creadoPor, 'root-unam');
  assert.equal(payload.carreras[0].modificadoPor, 'root-unam');
  assert.equal(payload.usuarios[0].creadoPor, 'root-unam');
  assert.equal(payload.config.root_password_changed_by, 'root-unam');
  assert.equal(payload.config.sitio_en_construccion_modificado_por, 'root-unam');
  assert.equal(payload.auditLog[0].user, 'root-unam');
  assert.match(payload.auditLog[0].detail, /root-unam/);
  assert.doesNotMatch(JSON.stringify(payload), /joel_barrera@outlook\.com/);
});
