-- Ejecutar una sola vez si la columna imagen aún no existe.
ALTER TABLE servicios ADD COLUMN imagen VARCHAR(500) NULL;

-- Ejemplos de asociación de imágenes locales (ajusta los nombres según tus registros).
-- UPDATE servicios SET imagen = '/servicios/Spa.jpg' WHERE nombre LIKE '%Spa%';
-- UPDATE servicios SET imagen = '/servicios/Desayuno buffet.jpg' WHERE nombre LIKE '%Desayuno%';
-- UPDATE servicios SET imagen = '/servicios/Masaje.jpg' WHERE nombre LIKE '%Masaje%';
