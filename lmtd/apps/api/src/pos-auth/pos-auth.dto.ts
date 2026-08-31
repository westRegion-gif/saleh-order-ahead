import { IsBoolean, IsString, Length } from 'class-validator';

export class PosLoginDto {
  @IsString()
  @Length(3, 80)
  username!: string;

  @IsString()
  @Length(6, 160)
  password!: string;
}

export class PosMachineCredentialsDto {
  @IsString()
  @Length(3, 80)
  username!: string;

  @IsString()
  @Length(6, 160)
  password!: string;
}

export class PosMachineStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
