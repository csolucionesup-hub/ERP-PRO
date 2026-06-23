-- Migración 074: alinear el ancho de centro_costo en OrdenesCompra.
-- Fecha: 2026-06-23. Motivo: Julio reportó "value too long for type
-- character varying(60)" al crear una OC de Servicio cuyo centro de costo
-- tenía un nombre largo (el auto-generado desde la cotización:
-- proyecto/cliente puede pasar de 60 caracteres).
--
-- Causa raíz: inconsistencia de esquema. El nombre del centro de costo
-- admite hasta 120 caracteres (CentrosCosto.nombre) y propaga sin problema
-- a Gastos/Compras/Rendiciones (todas VARCHAR(100)), pero OrdenesCompra
-- quedó en VARCHAR(60) y rompía SOLO al crear la OC. ocfirmasreglas estaba
-- aún más angosto (50).
--
-- Esta migración sube ambos a VARCHAR(100) para alinearlos con el resto del
-- modelo. Aditiva y segura: solo amplía, ningún dato existente se trunca.

ALTER TABLE OrdenesCompra
  ALTER COLUMN centro_costo TYPE VARCHAR(100);

ALTER TABLE OCFirmasReglas
  ALTER COLUMN centro_costo TYPE VARCHAR(100);
