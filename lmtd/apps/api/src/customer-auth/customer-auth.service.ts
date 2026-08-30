import { BadRequestException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerAuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  normalizePhone(input: string) {
    const digits = input.replace(/\D/g, '');
    if (/^05\d{8}$/.test(digits)) return `+971${digits.slice(1)}`;
    if (/^9715\d{8}$/.test(digits)) return `+${digits}`;
    if (/^5\d{8}$/.test(digits)) return `+971${digits}`;
    throw new BadRequestException('أدخل رقم هاتف إماراتي صحيح');
  }

  private pepper() {
    const value = process.env.CUSTOMER_OTP_PEPPER;
    if (!value || value.length < 24) throw new ServiceUnavailableException('Customer OTP is not configured');
    return value;
  }

  private tokenSecret() {
    const value = process.env.CUSTOMER_JWT_SECRET;
    if (!value || value.length < 32) throw new ServiceUnavailableException('Customer authentication is not configured');
    return value;
  }

  private hash(phone: string, code: string) {
    return createHmac('sha256', this.pepper()).update(`${phone}:${code}`).digest('hex');
  }

  private async deliver(phone: string, code: string) {
    const testCode = process.env.CUSTOMER_OTP_TEST_CODE?.trim();
    if (testCode) return;
    const url = process.env.SMS_PROVIDER_URL?.trim();
    const token = process.env.SMS_PROVIDER_TOKEN?.trim();
    if (!url || !token) throw new ServiceUnavailableException('SMS provider is not configured');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: phone, message: `LMTD verification code: ${code}` }),
    });
    if (!response.ok) throw new ServiceUnavailableException('تعذر إرسال رمز التحقق حالياً');
  }

  async requestOtp(rawPhone: string) {
    const phone = this.normalizePhone(rawPhone);
    const latest = await this.prisma.customerOtpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
    if (latest && Date.now() - latest.createdAt.getTime() < 60_000) throw new HttpException('انتظر دقيقة قبل طلب رمز جديد', HttpStatus.TOO_MANY_REQUESTS);

    const configuredTest = process.env.CUSTOMER_OTP_TEST_CODE?.trim();
    const code = configuredTest && /^\d{6}$/.test(configuredTest) ? configuredTest : String(randomInt(100000, 1000000));
    const challenge = await this.prisma.customerOtpChallenge.create({
      data: { phone, codeHash: this.hash(phone, code), expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    try {
      await this.deliver(phone, code);
    } catch (error) {
      await this.prisma.customerOtpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw error;
    }
    return { ok: true, expiresInSeconds: 300 };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = this.normalizePhone(rawPhone);
    const challenge = await this.prisma.customerOtpChallenge.findFirst({
      where: { phone, verifiedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw new UnauthorizedException('رمز التحقق غير صالح أو منتهي');
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      await this.prisma.customerOtpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('رمز التحقق غير صحيح');
    }

    const customer = await this.prisma.$transaction(async (tx) => {
      await tx.customerOtpChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date() } });
      return tx.customer.upsert({ where: { phone }, update: { isActive: true }, create: { phone, preferredLanguage: 'ar' } });
    });
    const accessToken = await this.jwt.signAsync({ sub: customer.id, phone, typ: 'customer' }, { secret: this.tokenSecret(), expiresIn: '30d' });
    return { accessToken, customer };
  }

  async customerFromAuthorization(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('تسجيل الدخول مطلوب');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(token, { secret: this.tokenSecret() });
      if (payload.typ !== 'customer') throw new Error('type');
      const customer = await this.prisma.customer.findFirst({ where: { id: payload.sub, isActive: true } });
      if (!customer) throw new Error('customer');
      return customer;
    } catch {
      throw new UnauthorizedException('جلسة العميل غير صالحة');
    }
  }

  updateProfile(customerId: string, data: { fullName?: string; email?: string; preferredLanguage?: 'ar' | 'en' }) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName.trim() || null } : {}),
        ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() || null } : {}),
        ...(data.preferredLanguage ? { preferredLanguage: data.preferredLanguage } : {}),
      },
    });
  }
}
