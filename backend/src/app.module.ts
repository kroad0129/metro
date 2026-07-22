import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LinesModule } from './lines/lines.module';
import { SeoulApiModule } from './seoul-api/seoul-api.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LinesModule, SeoulApiModule],
})
export class AppModule {}
