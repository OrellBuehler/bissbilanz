package health

type Service interface {
	Status() map[string]string
}

type Pinger interface {
	Ping() error
}

type service struct {
	db Pinger
}

func New(db Pinger) Service {
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
