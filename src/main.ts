import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  let port: number = Number(process.env.PORT);
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(port, () => {
    console.log('Servidor escuchando en el puerto: ' + port);
  });
}
bootstrap();
