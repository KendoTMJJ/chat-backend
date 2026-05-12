import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const logLevels: ('error' | 'warn' | 'log' | 'debug' | 'verbose')[] = isProd
    ? ['error', 'warn', 'log']
    : ['error', 'warn', 'log', 'debug', 'verbose'];

  const app = await NestFactory.create(AppModule, { logger: logLevels });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port: number = Number(process.env.PORT) || 3225;
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(port);
  Logger.log(`Servidor escuchando en el puerto: ${port}`, 'Bootstrap');
}
bootstrap();
