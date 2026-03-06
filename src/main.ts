import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
