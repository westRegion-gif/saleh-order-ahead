import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController{@Get() health(){return {service:'lmtd-api',status:'ok',country:'AE',currency:'AED'};}}
