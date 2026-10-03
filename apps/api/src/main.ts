import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // FR-01: only `tailscale serve` reaches the app, so it binds to loopback.
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3000);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // NFR-07: no request allocates more than 32 MB.
    new FastifyAdapter({ bodyLimit: 32 * 1024 * 1024 }),
    { bufferLogs: true },
  );
  app.enableShutdownHooks();

  await app.listen({ port, host });
  Logger.log(`Atelion listening on http://${host}:${port}`, 'Bootstrap');
}

void bootstrap();
