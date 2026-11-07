-- Ejecutar una sola vez en la base de datos lunaria.
-- UNIQUE sobre codigoHash evita colisiones entre códigos activos.
CREATE TABLE IF NOT EXISTS recuperacion_contrasenas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idUsuariosFK INT NOT NULL,
  codigoHash CHAR(64) NOT NULL,
  expiraEn DATETIME NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  creadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recuperacion_codigo_hash (codigoHash),
  KEY idx_recuperacion_usuario (idUsuariosFK),
  KEY idx_recuperacion_expiracion (expiraEn),
  CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (idUsuariosFK)
    REFERENCES usuarios (idUsuarios) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
