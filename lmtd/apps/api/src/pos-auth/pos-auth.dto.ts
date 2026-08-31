import { IsBoolean, IsString, Length } from 'class-validator';

export class PosLoginDto {
  @IsString()
  @Length(3, 80)
  username!: string;

  @IsString()
  @Length(8, 160)
  password!: string;
}

export class PosMachineStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
