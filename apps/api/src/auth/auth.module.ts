import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_SECRET');
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '7d';
        const isProduction = process.env.NODE_ENV === 'production';

        if (!secret) {
          throw new Error('JWT_SECRET is not defined');
        }
        if (isProduction) {
          const normalized = secret.trim().toLowerCase();
          const insecure = new Set([
            'super_secret_dev_key_change_later',
            'changeme',
            'secret',
            'dev',
            'development',
            'test',
          ]);
          if (insecure.has(normalized) || secret.trim().length < 24) {
            throw new Error(
              'Unsafe JWT_SECRET in production. Configure a strong secret.',
            );
          }
        }

        return {
          secret,
          signOptions: { expiresIn: expiresIn as any },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
