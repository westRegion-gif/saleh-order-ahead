import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto } from './customer-auth.dto';

export type CustomerClaims = { sub: string; phone: string; type: 'customer' };

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  normalizePhone(input: string) {
    const cleaned = input.replace(/[^\d+]/g, '');
    let digits = cleaned.replace(/^\+/, '');
    if (digits.startsWith('00971')) digits = digits.slice(2);
    if (digits.startsWith('05') && digits.length === 10) digits = `971${digits.slice(1)}`;
    if (digits.startsWith('5') && digits.length === 9) digits = `971${digits}`;
    if (!/^9715\d{8}$/.test(digits)) throw new UnauthorizedException('Invalid UAE mobile number');
    return `+${digits}`;
  }

  private hashCode(phone: string, code: string) {
    const pepper = this.config.get<string>('CUSTOMER_OTP_PEPPER');
    if (!pepper) throw new ServiceUnavailableException('OTP service is not configured');
    return createHash('sha256').update(`${pepper}:${phone}:${code}`).digest('hex');
  }

  private async sendSms(phone: string, code: string) {
    const provider = (this.config.get<string>('SMS_PROVIDER') || 'disabled').toLowerCase();
    if (provider === 'mock') return { devCode: code };
    if (provider !== 'twilio') throw new ServiceUnavailableException('SMS provider is not configured');

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM_NUMBER');
    if (!accountSid || !authToken || !from) throw new ServiceUnavailableException('SMS provider is not configured');

    const body = new URLSearchParams({ To: phone, From: from, Body: `LMTD verification code: ${code}` });
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new ServiceUnavailableException('Unable to send verification code');
    return {};
  }

  async requestOtp(rawPhone: string) {
    const phone = this.normalizePhone(rawPhone);
    const since = new Date(Date.now() - 10 * 60_000);
    const recent = await this.prisma.customerOtpChallenge.count({ where: { phone, createdAt: { gte: since } } });
    if (recent >= 5) throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);

    const code = randomInt(100000, 1000000).toString();
    const challenge = await this.prisma.customerOtpChallenge.create({
      data: { phone, codeHash: this.hashCode(phone, code), expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    try {
      const delivery = await this.sendSms(phone, code);
      return { ok: true, phone, expiresInSeconds: 300, ...delivery };
    } catch (error) {
      await this.prisma.customerOtpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw error;
    }
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = this.normalizePhone(rawPhone);
    const challenge = await this.prisma.customerOtpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt.getTime() < Date.now() || challenge.attempts >= 5) {
      throw new UnauthorizedException('Verification code expired or invalid');
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hashCode(phone, code), 'hex');
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!valid) {
      await this.prisma.customerOtpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Invalid verification code');
    }

    const customer = await this.prisma.$transaction(async (tx) => {
      await tx.customerOtpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      const existing = await tx.customer.findUnique({ where: { phone } });
      if (existing) {
        if (!existing.isActive) throw new UnauthorizedException('Customer account is inactive');
        return existing;
      }
      return tx.customer.create({ data: { phone, preferredLanguage: 'ar', isActive: true } });
    });

    const claims: CustomerClaims = { sub: customer.id, phone, type: 'customer' };
    const token = await this.jwt.signAsync(claims, { expiresIn: '30d' });
    return { token, customer };
  }

  async verifyToken(token: string): Promise<CustomerClaims> {
    try {
      const claims = await this.jwt.verifyAsync<CustomerClaims>(token);
      if (!claims?.sub || claims.type !== 'customer') throw new Error('invalid');
      return claims;
    } catch {
      throw new UnauthorizedException('Invalid customer session');
    }
  }

  async resolveOptionalAuthorization(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) return null;
    try {
      return await this.verifyToken(authorization.slice(7));
    } catch {
      return null;
    }
  }

  async getMe(customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, isActive: true } });
    if (!customer) throw new UnauthorizedException('Customer account is inactive');
    return customer;
  }

  async updateMe(customerId: string, dto: UpdateCustomerDto) {
    await this.getMe(customerId);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() || null } : {}),
        ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage.trim() || 'ar' } : {}),
      },
    });
  }

  async listOrders(customerId: string) {
    await this.getMe(customerId);
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { branch: true, items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }
}
