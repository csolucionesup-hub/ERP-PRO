-- ============================================================
-- Migración 003: FK DetalleCompra + Triggers PRESTAMO
-- Auditoría V2 — Hallazgos #20 y #21
-- Fecha: 08/04/2026
-- ============================================================

-- #20: FK faltante en DetalleCompra.id_item → Inventario
ALTER TABLE DetalleCompra
  ADD CONSTRAINT fk_detalle_item
  FOREIGN KEY (id_item) REFERENCES Inventario(id_item)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- #21: Triggers PRESTAMO en Transacciones
DROP TRIGGER IF EXISTS chk_transacciones_referencia_ins;
DROP TRIGGER IF EXISTS chk_transacciones_referencia_upd;

DELIMITER //

CREATE TRIGGER chk_transacciones_referencia_ins
BEFORE INSERT ON Transacciones
FOR EACH ROW
BEGIN
    DECLARE record_exists INT;
    IF NEW.referencia_tipo = 'SERVICIO' THEN
        SELECT COUNT(*) INTO record_exists FROM Servicios WHERE id_servicio = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Servicio referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'COMPRA' THEN
        SELECT COUNT(*) INTO record_exists FROM Compras WHERE id_compra = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: La Compra referenciada no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'GASTO' THEN
        SELECT COUNT(*) INTO record_exists FROM Gastos WHERE id_gasto = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Gasto referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'PRESTAMO' THEN
        SELECT COUNT(*) INTO record_exists
          FROM PrestamosTomados WHERE id_prestamo = NEW.referencia_id;
        IF record_exists = 0 THEN
            SELECT COUNT(*) INTO record_exists
              FROM PrestamosOtorgados WHERE id_prestamo = NEW.referencia_id;
        END IF;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Prestamo referenciado no existe.';
        END IF;
    END IF;
END; //

CREATE TRIGGER chk_transacciones_referencia_upd
BEFORE UPDATE ON Transacciones
FOR EACH ROW
BEGIN
    DECLARE record_exists INT;
    IF NEW.referencia_tipo = 'SERVICIO' THEN
        SELECT COUNT(*) INTO record_exists FROM Servicios WHERE id_servicio = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Servicio referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'COMPRA' THEN
        SELECT COUNT(*) INTO record_exists FROM Compras WHERE id_compra = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: La Compra referenciada no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'GASTO' THEN
        SELECT COUNT(*) INTO record_exists FROM Gastos WHERE id_gasto = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Gasto referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'PRESTAMO' THEN
        SELECT COUNT(*) INTO record_exists
          FROM PrestamosTomados WHERE id_prestamo = NEW.referencia_id;
        IF record_exists = 0 THEN
            SELECT COUNT(*) INTO record_exists
              FROM PrestamosOtorgados WHERE id_prestamo = NEW.referencia_id;
        END IF;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Prestamo referenciado no existe.';
        END IF;
    END IF;
END; //

DELIMITER ;
