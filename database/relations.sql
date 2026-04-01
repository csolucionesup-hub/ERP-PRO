-- Relaciones para CostosServicio
ALTER TABLE CostosServicio
ADD CONSTRAINT fk_costos_servicio
FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio);

-- Relaciones para Transacciones
ALTER TABLE Transacciones
ADD CONSTRAINT fk_transacciones_cuenta
FOREIGN KEY (id_cuenta) REFERENCES Cuentas(id_cuenta);

-- (Transacciones utiliza referencia_tipo y referencia_id polimórficos, por lo que no se declaran claves foráneas duras a Compras/Servicios)

-- Relaciones para MovimientosInventario
ALTER TABLE MovimientosInventario
ADD CONSTRAINT fk_movimientos_item
FOREIGN KEY (id_item) REFERENCES Inventario(id_item);

-- (MovimientosInventario utiliza referencia_tipo y referencia_id polimórficos, por lo que no depende de Transacciones ni declara claves foráneas duras)

-- Relaciones para Detracciones
ALTER TABLE Detracciones
ADD CONSTRAINT fk_detracciones_servicio
FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio);
