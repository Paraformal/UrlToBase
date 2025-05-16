import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

const PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // ✅ FULL CORS config for credentials + custom origin + headers
  app.enableCors({
    origin: [
      'https://zip-it-to-api.lovable.app',
      'https://preview--zip-it-to-api.lovable.app',
      'https://00fe85cc-1538-4abc-bb84-82de0b14dee0.lovableproject.com',
      'https://northstar.aidemo.world',
    ],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  });

  // Increase payload size
  app.use(bodyParser.json({ limit: '100mb' }));

  await app.listen(PORT, () => {
    Logger.log(`Server is running on http://localhost:${PORT}`, 'Bootstrap');
    const server = app.getHttpServer();
    const router = server._events.request._router;
    router.stack.forEach((layer) => {
      if (layer.route) {
        const { path, methods } = layer.route;
        const method = Object.keys(methods).pop().toUpperCase();
        Logger.log(`${method} /${path}`, 'Router');
      }
    });
  });
}

bootstrap();
