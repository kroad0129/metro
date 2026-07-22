import { Module } from '@nestjs/common';
import { CacheService } from '../common/cache.service';
import { loadConfig } from '../config/configuration';
import { LinesModule } from '../lines/lines.module';
import { SeoulApiModule } from '../seoul-api/seoul-api.module';
import { TrainsController } from './trains.controller';
import { TrainsService } from './trains.service';

@Module({
  imports: [LinesModule, SeoulApiModule],
  controllers: [TrainsController],
  providers: [
    TrainsService,
    {
      provide: CacheService,
      useFactory: () => {
        const config = loadConfig();
        return new CacheService(config.cacheTtlMs, config.staleMaxAgeMs);
      },
    },
  ],
})
export class TrainsModule {}
