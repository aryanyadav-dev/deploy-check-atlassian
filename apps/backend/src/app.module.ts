import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyzersModule } from './analyzers';
import { SecurityModule } from './security';

@Module({
  imports: [AnalyzersModule, SecurityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
