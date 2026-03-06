import { Global, Module } from '@nestjs/common';
import { error } from 'console';
import { Conversation } from 'src/conversation/conversation';
import { Message } from 'src/message/message';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      provide: DataSource,
      inject: [],
      useFactory: async () => {
        try {
          const poolConexion = new DataSource({
            type: 'postgres',
            host: String(process.env.DB_HOST),
            port: Number(process.env.DB_PORT),
            username: String(process.env.DB_USER),
            database: String(process.env.DB_NAME),
            password: String(process.env.DB_PASSWORD),
            synchronize: true,
            logging: true,
            namingStrategy: new SnakeNamingStrategy(),
            entities: [Message, Conversation],
            // ssl: false,
          });

          await poolConexion.initialize();
          console.log('Conexión a la base de datos establecida correctamente');
          return poolConexion;
        } catch (error) {
          console.log('Error al conectar con la base de datos', error);
        }
      },
    },
  ],
  exports: [DataSource],
})
export class ConnectionModule {}
