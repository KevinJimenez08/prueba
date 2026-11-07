-- Ejecutar una sola vez en la base de datos lunaria.
-- Permite guardar varias unidades de cada tipo asociadas a una reserva.
-- Conserva reservas.idHabitacionesFK como habitación principal por compatibilidad con pantallas antiguas.

ALTER TABLE habitaciones ADD COLUMN cantidad INT NOT NULL DEFAULT 1 AFTER capacidad;

CREATE TABLE IF NOT EXISTS reservas_has_habitaciones (
  idReservasFK INT NOT NULL,
  idHabitacionesFK INT NOT NULL,
  personasAsignadas INT NOT NULL DEFAULT 1,
  cantidadHabitaciones INT NOT NULL DEFAULT 1,
  esHabitacionIncluida TINYINT(1) NOT NULL DEFAULT 0,
  cargoPorNoche DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (idReservasFK, idHabitacionesFK),
  KEY idx_rhh_habitacion (idHabitacionesFK),
  CONSTRAINT fk_rhh_reserva FOREIGN KEY (idReservasFK)
    REFERENCES reservas (idReservas) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rhh_habitacion FOREIGN KEY (idHabitacionesFK)
    REFERENCES habitaciones (idHabitaciones) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Importa las reservas existentes en la nueva relación para que esas habitaciones
-- sigan contando como ocupadas después de activar el sistema de varias habitaciones.
INSERT IGNORE INTO reservas_has_habitaciones
  (idReservasFK, idHabitacionesFK, personasAsignadas, cantidadHabitaciones, esHabitacionIncluida, cargoPorNoche)
SELECT r.idReservas, r.idHabitacionesFK, 1, 1, IF(r.idPaquetesFK IS NULL, 0, 1), 0
FROM reservas r
WHERE r.idHabitacionesFK IS NOT NULL;
