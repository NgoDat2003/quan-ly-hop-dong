import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('Training App API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  writeFileSync(
    join(__dirname, '..', 'openapi.json'),
    JSON.stringify(SwaggerModule.createDocument(app, config), null, 2),
  );
  await app.close();
}

generate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
