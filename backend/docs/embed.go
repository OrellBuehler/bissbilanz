package docs

import _ "embed"

// OpenAPI holds the generated OpenAPI specification in JSON format.
//
//go:embed openapi.json
var OpenAPI []byte

// swaggerUI is a minimal HTML page that loads Swagger UI assets from a CDN.
//
//go:embed swagger.html
var swaggerUI string

// SwaggerUI returns the Swagger UI HTML page.
func SwaggerUI() string {
	return swaggerUI
}
