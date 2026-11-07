-- Ejecutar una sola vez sobre la base de datos lunaria existente.
-- Asocia cada paquete con la habitación incluida en su precio.
ALTER TABLE paquetes
  ADD COLUMN idHabitacionesFK INT NULL AFTER imagen;

ALTER TABLE paquetes
  ADD INDEX idx_paquetes_habitacion (idHabitacionesFK),
  ADD CONSTRAINT fk_paquetes_habitacion
    FOREIGN KEY (idHabitacionesFK) REFERENCES habitaciones (idHabitaciones)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Después de ejecutar la migración, entra en Gestión de Paquetes y asigna
-- una habitación incluida a cada paquete existente. Las reservas con paquete
-- no se podrán confirmar hasta que este campo esté configurado.
