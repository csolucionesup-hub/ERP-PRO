-- Migración 002: Sistema de Autenticación y Roles
-- Ejecutar después de schema.sql y relations.sql

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS Usuarios (
    id_usuario INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('GERENTE', 'USUARIO') DEFAULT 'USUARIO',
    activo BOOLEAN DEFAULT TRUE,
    ultimo_acceso DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de módulos asignados por usuario
CREATE TABLE IF NOT EXISTS UsuarioModulos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_usuario INT NOT NULL,
    modulo ENUM('GERENCIA', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ALMACEN', 'ADMINISTRACION') NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_usuario_modulo (id_usuario, modulo),
    FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario) ON DELETE CASCADE
);

-- Índices
CREATE INDEX idx_usuarios_email ON Usuarios(email);
CREATE INDEX idx_usuario_modulos ON UsuarioModulos(id_usuario);
