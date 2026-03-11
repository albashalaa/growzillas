import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipTenancy } from './auth/decorators/skip-tenancy.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @SkipTenancy() // Public health check endpoint
  getHello(): string {
    return this.appService.getHello();
  }
}
