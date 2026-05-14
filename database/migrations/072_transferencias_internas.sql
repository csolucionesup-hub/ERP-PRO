-- Migración 072: Transferencias Internas Metal ↔ Perfotools.
-- Fecha: 2026-05-14. Motivo: Julio reportó que es muy común que una marca
-- le preste plata a la otra (Metal Engineers PEN → Perfotools USD, o
-- viceversa) con conversión de moneda al TC del día. La diferencia entre
-- el TC que vos aplicás y el que aplica el banco es DIFERENCIA DE CAMBIO
-- (ganancia o pérdida cambiaria que hay que registrar y conciliar).
--
-- Reglas de negocio:
--   - Generalmente se devuelven (modelo: PRESTAMO_INTERNO con saldo vivo).
--   - El monto_destino_real puede diferir del estimado (banco aplica su
--     propio TC). Diferencia de cambio = (estimado − real) × TC referencia.
--   - 3 tipos: PRESTAMO_INTERNO (con saldo), DEVOLUCION (resta saldo de la
--     original), APORTE_CAPITAL (sin retorno).
--   - Estado evoluciona: PENDIENTE → PARCIAL → DEVUELTA / ANULADA.
--
-- Aditiva. No toca tablas existentes salvo MovimientoBancario para enlazar
-- los 2 movimientos bancarios espejo a la misma transferencia (Fase 2).

CREATE TABLE IF NOT EXISTS TransferenciasInternas (
  id_transferencia        SERIAL PRIMARY KEY,
  fecha                   DATE NOT NULL,
  empresa_origen          VARCHAR(20) NOT NULL,
  empresa_destino         VARCHAR(20) NOT NULL,
  tipo_movimiento         VARCHAR(20) NOT NULL,
  es_devolucion_de        INT REFERENCES TransferenciasInternas(id_transferencia) ON DELETE SET NULL,

  moneda_origen           VARCHAR(3) NOT NULL,
  monto_origen            NUMERIC(14,2) NOT NULL,

  moneda_destino          VARCHAR(3) NOT NULL,
  tipo_cambio_referencia  NUMERIC(10,4) NOT NULL DEFAULT 1,
  monto_destino_estimado  NUMERIC(14,2) NOT NULL,
  monto_destino_real      NUMERIC(14,2),
  tipo_cambio_real        NUMERIC(10,4),
  diferencia_cambio       NUMERIC(14,2) DEFAULT 0,

  saldo_pendiente_pen     NUMERIC(14,2) DEFAULT 0,
  estado                  VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',

  id_mov_bancario_origen  INT REFERENCES MovimientoBancario(id_movimiento) ON DELETE SET NULL,
  id_mov_bancario_destino INT REFERENCES MovimientoBancario(id_movimiento) ON DELETE SET NULL,

  comentario              TEXT,
  id_usuario_registra     INT REFERENCES Usuarios(id_usuario) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transferencias_empresa_origen_check') THEN
    ALTER TABLE TransferenciasInternas
      ADD CONSTRAINT transferencias_empresa_origen_check
      CHECK (empresa_origen IN ('METAL','PERFOTOOLS'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transferencias_empresa_destino_check') THEN
    ALTER TABLE TransferenciasInternas
      ADD CONSTRAINT transferencias_empresa_destino_check
      CHECK (empresa_destino IN ('METAL','PERFOTOOLS'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transferencias_distintas_empresas_check') THEN
    ALTER TABLE TransferenciasInternas
      ADD CONSTRAINT transferencias_distintas_empresas_check
      CHECK (empresa_origen <> empresa_destino);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transferencias_tipo_check') THEN
    ALTER TABLE TransferenciasInternas
      ADD CONSTRAINT transferencias_tipo_check
      CHECK (tipo_movimiento IN ('PRESTAMO_INTERNO','DEVOLUCION','APORTE_CAPITAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transferencias_estado_check') THEN
    ALTER TABLE TransferenciasInternas
      ADD CONSTRAINT transferencias_estado_check
      CHECK (estado IN ('PENDIENTE','PARCIAL','DEVUELTA','ANULADA','APORTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transferencias_moneda_origen_check') THEN
    ALTER TABLE TransferenciasInternas
      ADD CONSTRAINT transferencias_moneda_origen_check
      CHECK (moneda_origen IN ('PEN','USD'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transferencias_moneda_destino_check') THEN
    ALTER TABLE TransferenciasInternas
      ADD CONSTRAINT transferencias_moneda_destino_check
      CHECK (moneda_destino IN ('PEN','USD'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transferencias_fecha       ON TransferenciasInternas(fecha);
CREATE INDEX IF NOT EXISTS idx_transferencias_origen      ON TransferenciasInternas(empresa_origen);
CREATE INDEX IF NOT EXISTS idx_transferencias_destino     ON TransferenciasInternas(empresa_destino);
CREATE INDEX IF NOT EXISTS idx_transferencias_estado      ON TransferenciasInternas(estado);
CREATE INDEX IF NOT EXISTS idx_transferencias_devolde     ON TransferenciasInternas(es_devolucion_de);

ALTER TABLE MovimientoBancario
  ADD COLUMN IF NOT EXISTS id_transferencia_interna INT
    REFERENCES TransferenciasInternas(id_transferencia) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_movbancario_transferencia
  ON MovimientoBancario(id_transferencia_interna);
