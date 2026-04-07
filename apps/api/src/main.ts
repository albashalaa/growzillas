import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { join } from 'path';
import * as express from 'express';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function assertSafeProductionEnv() {
  if (!isProduction()) return;

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new Error('Missing JWT_SECRET in production environment');
  }

  const insecureJwtValues = new Set([
    'super_secret_dev_key_change_later',
    'changeme',
    'secret',
    'dev',
    'development',
    'test',
  ]);
  if (insecureJwtValues.has(jwtSecret.toLowerCase()) || jwtSecret.length < 24) {
    throw new Error('Unsafe JWT_SECRET for production. Set a strong secret.');
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL in production environment');
  }
  if (
    databaseUrl.includes('postgres:postgres@') ||
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1')
  ) {
    throw new Error('Unsafe DATABASE_URL for production. Do not use local/dev database URL.');
  }
}

function resolveCorsOrigins() {
  const raw = process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? '';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    if (isProduction()) {
      throw new Error(
        'Missing CORS_ORIGIN/FRONTEND_URL in production. Configure at least one allowed frontend origin.',
      );
    }
    return ['http://localhost:3000'];
  }

  return origins;
}

async function bootstrap() {
  assertSafeProductionEnv();
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend with explicit env-based origins.
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Serve uploaded files from /uploads
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  await app.listen(process.env.PORT ?? 3002);
}
bootstrap();
