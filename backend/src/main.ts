import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global route prefix — all routes served under /v1
  app.setGlobalPrefix('v1');

  // Global exception filter — normalizes all error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global validation pipe — strips unknown fields and transforms DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — origins read from CORS_ORIGINS env var, comma-separated 
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : '*';

  app.enableCors({
    origin: corsOrigins,
  });

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port);

  // Startup log (Requirement 1.6)
  console.log(`Application running on port ${port}`);
}
bootstrap();
