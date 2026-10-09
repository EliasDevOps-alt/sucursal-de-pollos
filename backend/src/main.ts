import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Las entregas del chofer llevan la firma como imagen: se amplía el límite del cuerpo JSON (por defecto 100 kB).
  app.useBodyParser('json', { limit: '5mb' });
  // Detrás de Caddy: la IP real del cliente llega en X-Forwarded-For (la usa el freno de intentos de ingreso).
  app.set('trust proxy', 'loopback, uniquelocal');

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // La documentación de la API solo se publica fuera de producción (o si se pide explícitamente).
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ERP Pollos — API')
      .setDescription('API central del ERP de distribución de pollo')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api (docs en /api/docs)`);
}

bootstrap();
