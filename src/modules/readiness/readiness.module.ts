import { Global, Module } from '@nestjs/common';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';

// Глобальный: ReadinessService нужен движку плана и рекомендациям.
@Global()
@Module({
  controllers: [ReadinessController],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessModule {}
