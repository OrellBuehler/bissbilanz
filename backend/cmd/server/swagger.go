package main

import (
	"github.com/gofiber/fiber/v2"

	"github.com/bissbilanz/backend/docs"
)

func registerSwagger(app *fiber.App) {
	app.Get("/swagger", func(c *fiber.Ctx) error {
		c.Type("html", "utf-8")
		return c.SendString(docs.SwaggerUI())
	})

	app.Get("/swagger/", func(c *fiber.Ctx) error {
		c.Type("html", "utf-8")
		return c.SendString(docs.SwaggerUI())
	})

	app.Get("/swagger/swagger.json", func(c *fiber.Ctx) error {
		c.Type("json", "utf-8")
		return c.Send(docs.OpenAPI)
	})
}
