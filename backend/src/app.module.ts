import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LinesModule } from './lines/lines.module';
import { TrainsModule } from './trains/trains.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LinesModule, TrainsModule],
})
export class AppModule {}
