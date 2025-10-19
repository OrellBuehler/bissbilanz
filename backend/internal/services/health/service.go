package health

import "database/sql"

type Service interface {
	Status() map[string]string
}

type service struct {
	db *sql.DB
}

func New(db *sql.DB) Service {
	return &service{db: db}
}

func (s *service) Status() map[string]string {
	status := "ok"
	if err := s.db.Ping(); err != nil {
		status = "database_unreachable"
	}

	return map[string]string{
		"status": status,
	}
}
