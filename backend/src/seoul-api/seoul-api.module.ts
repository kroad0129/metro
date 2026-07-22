import { Module } from '@nestjs/common';
import { loadConfig } from '../config/configuration';
import { SeoulApiClient } from './seoul-api.client';

@Module({
  providers: [{ provide: SeoulApiClient, useFactory: () => new SeoulApiClient(loadConfig()) }],
  exports: [SeoulApiClient],
})
export class SeoulApiModule {}
