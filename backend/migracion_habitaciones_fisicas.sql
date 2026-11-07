-- Hotel Lunaria: inventario físico y asignación exclusiva por fechas.
-- Ejecutar una sola vez en la base lunaria. No elimina ni modifica reservas históricas.
CREATE TABLE IF NOT EXISTS habitaciones_unidades (
  idUnidad INT NOT NULL AUTO_INCREMENT,
  idHabitacionesFK INT NOT NULL,
  numeroHabitacion VARCHAR(20) NOT NULL,
  estado ENUM('Disponible','Mantenimiento') NOT NULL DEFAULT 'Disponible',
  PRIMARY KEY (idUnidad),
  UNIQUE KEY unique_numero_tipo (idHabitacionesFK, numeroHabitacion),
  KEY idx_unidades_estado (estado, idHabitacionesFK),
  CONSTRAINT fk_unidad_habitacion FOREIGN KEY (idHabitacionesFK)
    REFERENCES habitaciones (idHabitaciones) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservas_has_unidades (
  idReservasFK INT NOT NULL,
  idUnidadFK INT NOT NULL,
  PRIMARY KEY (idReservasFK, idUnidadFK),
  KEY idx_reserva_unidad_unidad (idUnidadFK),
  CONSTRAINT fk_asignacion_reserva FOREIGN KEY (idReservasFK)
    REFERENCES reservas (idReservas) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_asignacion_unidad FOREIGN KEY (idUnidadFK)
    REFERENCES habitaciones_unidades (idUnidad) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Completa inventario si faltan unidades. No duplica números ya existentes.
DROP PROCEDURE IF EXISTS lunaria_completar_unidades;
DELIMITER $$
CREATE PROCEDURE lunaria_completar_unidades()
BEGIN
  DECLARE terminado INT DEFAULT 0;
  DECLARE hab_id INT;
  DECLARE cant INT;
  DECLARE ya INT;
  DECLARE n INT;
  DECLARE cur CURSOR FOR SELECT idHabitaciones, GREATEST(0, cantidad) FROM habitaciones;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET terminado = 1;
  OPEN cur;
  bucle: LOOP
    FETCH cur INTO hab_id, cant;
    IF terminado = 1 THEN LEAVE bucle; END IF;
    SELECT COUNT(*) INTO ya FROM habitaciones_unidades WHERE idHabitacionesFK = hab_id;
    SET n = ya + 1;
    WHILE n <= cant DO
      INSERT IGNORE INTO habitaciones_unidades (idHabitacionesFK, numeroHabitacion, estado)
      VALUES (hab_id, CONCAT(hab_id, LPAD(n, 2, '0')), 'Disponible');
      SET n = n + 1;
    END WHILE;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;
CALL lunaria_completar_unidades();
DROP PROCEDURE lunaria_completar_unidades;

-- Las reservas históricas se mantienen en reservas / reservas_has_habitaciones.
-- El backend las seguirá considerando al consultar las fechas; las nuevas reservas
-- guardan además el id físico en reservas_has_unidades.

-- Conserva la ocupación de las reservas anteriores asignándoles, cuando es posible,
-- números físicos del tipo que ya tenían asociado. Las fechas históricas no se pierden.
DROP PROCEDURE IF EXISTS lunaria_migrar_reservas_fisicas;
DELIMITER $$
CREATE PROCEDURE lunaria_migrar_reservas_fisicas()
BEGIN
  DECLARE fin_cursor INT DEFAULT 0;
  DECLARE reserva_id INT;
  DECLARE f_inicio DATE;
  DECLARE f_fin DATE;
  DECLARE grupo_idx INT;
  DECLARE grupo_total INT;
  DECLARE tipo_id INT;
  DECLARE unidades_necesarias INT;
  DECLARE unidad_id INT;
  DECLARE unidad_idx INT;
  DECLARE cur_reservas CURSOR FOR
    SELECT r.idReservas, r.fechaInicio, r.fechaFin
    FROM reservas r
    WHERE r.fechaInicio IS NOT NULL AND r.fechaFin IS NOT NULL
      AND r.fechaFin > r.fechaInicio
      AND LOWER(COALESCE(r.estado,'pendiente')) NOT IN ('cancelada','cancelado','rechazada','anulada')
      AND NOT EXISTS (SELECT 1 FROM reservas_has_unidades ru WHERE ru.idReservasFK=r.idReservas)
    ORDER BY r.fechaInicio, r.idReservas;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET fin_cursor = 1;

  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_lunaria_grupos (
    pos INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    idHabitaciones INT NOT NULL,
    cantidad INT NOT NULL
  );

  OPEN cur_reservas;
  reservas_loop: LOOP
    FETCH cur_reservas INTO reserva_id, f_inicio, f_fin;
    IF fin_cursor = 1 THEN LEAVE reservas_loop; END IF;

    DELETE FROM tmp_lunaria_grupos;
    INSERT INTO tmp_lunaria_grupos (idHabitaciones, cantidad)
      SELECT rh.idHabitacionesFK, GREATEST(1, rh.cantidadHabitaciones)
      FROM reservas_has_habitaciones rh
      WHERE rh.idReservasFK = reserva_id;
    IF ROW_COUNT() = 0 THEN
      INSERT INTO tmp_lunaria_grupos (idHabitaciones, cantidad)
        SELECT COALESCE(r.idHabitacionesFK, p.idHabitacionesFK), 1
        FROM reservas r LEFT JOIN paquetes p ON p.idPaquetes=r.idPaquetesFK
        WHERE r.idReservas=reserva_id
          AND COALESCE(r.idHabitacionesFK,p.idHabitacionesFK) IS NOT NULL;
    END IF;

    SELECT COUNT(*) INTO grupo_total FROM tmp_lunaria_grupos;
    SET grupo_idx = 1;
    WHILE grupo_idx <= grupo_total DO
      SELECT idHabitaciones, cantidad INTO tipo_id, unidades_necesarias
      FROM tmp_lunaria_grupos WHERE pos=grupo_idx;
      SET unidad_idx = 1;
      WHILE unidad_idx <= unidades_necesarias DO
        SET unidad_id = COALESCE((
          SELECT u.idUnidad FROM habitaciones_unidades u
          WHERE u.idHabitacionesFK=tipo_id AND u.estado='Disponible'
            AND NOT EXISTS (
              SELECT 1 FROM reservas_has_unidades ru
              JOIN reservas r2 ON r2.idReservas=ru.idReservasFK
              WHERE ru.idUnidadFK=u.idUnidad
                AND r2.fechaInicio < f_fin AND r2.fechaFin > f_inicio
                AND LOWER(COALESCE(r2.estado,'pendiente')) NOT IN ('cancelada','cancelado','rechazada','anulada')
            )
          ORDER BY CAST(u.numeroHabitacion AS UNSIGNED), u.numeroHabitacion
          LIMIT 1
        ), 0);
        IF unidad_id > 0 THEN
          INSERT IGNORE INTO reservas_has_unidades (idReservasFK,idUnidadFK)
          VALUES (reserva_id,unidad_id);
        END IF;
        SET unidad_idx = unidad_idx + 1;
      END WHILE;
      SET grupo_idx = grupo_idx + 1;
    END WHILE;
  END LOOP;
  CLOSE cur_reservas;
  DROP TEMPORARY TABLE IF EXISTS tmp_lunaria_grupos;
END$$
DELIMITER ;
CALL lunaria_migrar_reservas_fisicas();
DROP PROCEDURE lunaria_migrar_reservas_fisicas;
