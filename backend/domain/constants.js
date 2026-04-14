const EAD_UNIT = 'Educación a Distancia';

const ALLOWED_DISCIPLINAS = [
  'Ciencias Sociales',
  'Ciencias Aplicadas',
  'Artes',
];

const UNIDAD_REGIONAL_MAP = {
  'Facultad de Arte y Diseño': 'Oberá',
  'Facultad de Ciencias Económicas': 'Posadas',
  'Facultad de Ciencias Exactas, Químicas y Naturales': 'Posadas',
  'Facultad de Ciencias Forestales': 'Eldorado',
  'Facultad de Humanidades y Ciencias Sociales': 'Posadas',
  'Facultad de Ingeniería': 'Oberá',
  'Educación a Distancia': '',
  'Escuela Agrotécnica Eldorado': 'Eldorado',
  'Escuela de Enfermería': 'Posadas',
};

module.exports = {
  EAD_UNIT,
  ALLOWED_DISCIPLINAS,
  UNIDAD_REGIONAL_MAP,
};
