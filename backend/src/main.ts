import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { loadConfig } from './config/configuration';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors();
  await app.listen(config.port);
}
bootstrap();
