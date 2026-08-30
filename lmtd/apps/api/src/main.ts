import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(){
  const app=await NestFactory.create(AppModule,{rawBody:true});
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  const origins=(process.env.CORS_ALLOWED_ORIGINS??'http://localhost:3001,http://localhost:3002')
    .split(',')
    .map((origin)=>origin.trim().replace(/\/$/,''))
    .filter(Boolean);
  app.enableCors({origin:origins,credentials:true});
  await app.listen(Number(process.env.PORT??process.env.API_PORT??3000),'0.0.0.0');
}
bootstrap();
