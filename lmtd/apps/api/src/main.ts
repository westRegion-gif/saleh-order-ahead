import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { Server } from 'socket.io';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { RealtimeService } from './realtime/realtime.service';

function configuredOrigins() {
  const values = [
    ...(process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3001,http://localhost:3002').split(','),
    process.env.CUSTOMER_APP_URL ?? '',
    process.env.ADMIN_APP_URL ?? '',
  ];
  return [...new Set(values.map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean))];
}

async function bootstrap(){
  const app=await NestFactory.create(AppModule,{rawBody:true});
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  const origins=configuredOrigins();
  app.enableCors({origin:origins,credentials:true});
  await app.listen(Number(process.env.PORT??process.env.API_PORT??3000),'0.0.0.0');

  const prisma=app.get(PrismaService);
  const realtime=app.get(RealtimeService);
  const jwt=new JwtService();
  const io=new Server(app.getHttpServer(),{
    path:'/socket.io',
    serveClient:true,
    cors:{origin:origins,credentials:true},
  });

  io.use(async (socket,next)=>{
    const token=String(socket.handshake.auth?.token||'').trim();
    if(!token)return next(new Error('unauthorized'));

    const customerSecret=process.env.CUSTOMER_JWT_SECRET?.trim();
    if(customerSecret){
      try{
        const payload=await jwt.verifyAsync<{sub:string;typ?:string}>(token,{secret:customerSecret});
        if(payload.typ==='customer'){
          const customer=await prisma.customer.findFirst({where:{id:payload.sub,isActive:true},select:{id:true}});
          if(customer){socket.data.identity={kind:'customer',id:customer.id};return next();}
        }
      }catch{}
    }

    const adminSecret=(process.env.ADMIN_JWT_SECRET||process.env.JWT_ACCESS_SECRET||'').trim();
    if(adminSecret){
      try{
        const payload=await jwt.verifyAsync<{sub:string;role?:string}>(token,{secret:adminSecret});
        const admin=await prisma.adminUser.findFirst({where:{id:payload.sub,isActive:true,role:'OWNER'},select:{id:true}});
        if(admin){socket.data.identity={kind:'admin',id:admin.id};return next();}
      }catch{}
    }

    return next(new Error('unauthorized'));
  });

  io.on('connection',(socket)=>{
    const identity=socket.data.identity as {kind:'customer'|'admin';id:string}|undefined;
    if(!identity){socket.disconnect(true);return;}
    if(identity.kind==='customer')socket.join(`customer:${identity.id}`);
    if(identity.kind==='admin')socket.join('admin:all');
    socket.emit('realtime:ready',{role:identity.kind});
  });

  realtime.bindServer(io);
  console.log(`[realtime] Socket.IO ready for ${origins.length} configured origin(s)`);
}
bootstrap();
