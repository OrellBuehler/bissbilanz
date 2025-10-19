-- +goose Up
-- +goose NO TRANSACTION
CREATE DATABASE bissbilanz;

-- +goose Down
-- +goose NO TRANSACTION
DROP DATABASE IF EXISTS bissbilanz;
