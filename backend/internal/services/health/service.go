package health

type Service interface {
	Status() map[string]string
}

type service struct{}

func New() Service {
	return &service{}
}

func (s *service) Status() map[string]string {
	return map[string]string{
		"status": "ok",
	}
}
