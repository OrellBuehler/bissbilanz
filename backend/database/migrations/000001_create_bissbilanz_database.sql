-- +goose Up
CREATE DATABASE bissbilanz;

-- +goose Down
DROP DATABASE IF EXISTS bissbilanz;
