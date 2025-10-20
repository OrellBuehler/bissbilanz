OPENAPI_SPEC := backend/docs/openapi.json
OPENAPI_GENERATOR_IMAGE := openapitools/openapi-generator-cli:v7.5.0

.PHONY: api-docs
api-docs:
	@echo "OpenAPI specification: $(OPENAPI_SPEC)"

.PHONY: api-client-web
api-client-web:
	docker run --rm -v $(PWD):/local $(OPENAPI_GENERATOR_IMAGE) generate \
		-i /local/$(OPENAPI_SPEC) \
		-g typescript-fetch \
		-o /local/web/src/api/generated \
		--additional-properties=npmName=@bissbilanz/api-client

.PHONY: api-client-ios
api-client-ios:
	docker run --rm -v $(PWD):/local $(OPENAPI_GENERATOR_IMAGE) generate \
		-i /local/$(OPENAPI_SPEC) \
		-g swift5 \
		-o /local/ios/Generated/API \
		--additional-properties=projectName=BissbilanzAPI

.PHONY: api-client-all
api-client-all: api-client-web api-client-ios
