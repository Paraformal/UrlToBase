import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
const PORT = 3000;
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors();
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
