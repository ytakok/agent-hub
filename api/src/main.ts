import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IP behind Cloud Run / load balancer, used by the throttler
  app.use(helmet());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Firebase-AppCheck', 'Accept-Language'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  if (config.get('NODE_ENV') !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Agency Hub API').setVersion('0.1').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }

  await app.listen(config.get('PORT'));
}
await bootstrap();
