import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from '@/common/errors/all-exceptions.filter';
import { validationExceptionFactory } from '@/common/errors/validation-errors';
import { requestIdMiddleware } from '@/common/request-id/request-id.middleware';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/**
 * HTTP behaviour shared by main.ts and the e2e tests,
 * so the tests run against exactly what production runs.
 */
export const configureApp = (app: INestApplication): void => {
  // First middleware, so every response (errors included) gets an X-Request-Id.
  app.use(requestIdMiddleware);

  // Every route lives under /api/v1. A future v2 can sit next to it.
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      // Drop any field that has no validation decorator on the DTO...
      whitelist: true,
      // ...and instead of dropping it silently, answer 400 (decision D23).
      forbidNonWhitelisted: true,
      // Turn the JSON body into an instance of the DTO class.
      transform: true,
      // Invalid input becomes our standard 400 with a per-field `details` list.
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Every error leaves the API in the same JSON shape.
  app.useGlobalFilters(new AllExceptionsFilter());
};

/** Swagger UI at /api/docs, raw OpenAPI JSON at /api/docs/openapi.json. */
export const setupSwagger = (app: INestApplication): void => {
  const config = new DocumentBuilder()
    .setTitle('Merchant Onboarding API')
    .setDescription('Back-office API for merchant onboarding and risk review.')
    .setVersion('1.0')
    // Adds the "Authorize" button where you paste a JWT access token.
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    DOCS_PATH,
    app,
    () => SwaggerModule.createDocument(app, config),
    {
      jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
      // Keep the pasted token after a page refresh.
      swaggerOptions: { persistAuthorization: true },
    },
  );
};
