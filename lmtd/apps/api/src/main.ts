import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(){
  const app=await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.enableCors({origin:(process.env.CORS_ALLOWED_ORIGINS??'http://localhost:3001,http://localhost:3002').split(','),credentials:true});
  await app.listen(Number(process.env.API_PORT??3000));
}
bootstrap();
