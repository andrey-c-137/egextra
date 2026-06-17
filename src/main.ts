import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const prefix = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(prefix);

  // Рефлексия origin: работает локально, в LAN и через публичный туннель без правок.
  app.enableCors({ origin: true, credentials: true });

  // Раздаём SPA (test-ui) тем же origin, что и API → один публичный URL, без CORS.
  const uiDir = [join(__dirname, '..', 'test-ui'), join(process.cwd(), 'test-ui')].find(existsSync);
  if (uiDir) app.useStaticAssets(uiDir);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ЕГЭ AI API')
    .setDescription('Backend подготовки к ЕГЭ на основе ИИ')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0'); // слушаем все интерфейсы (LAN + туннель)
  // eslint-disable-next-line no-console
  console.log(`🚀 BallLab на http://localhost:${port} (API: /${prefix})`);
}
void bootstrap();
