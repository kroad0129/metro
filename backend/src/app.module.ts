import { Module } from '@nestjs/common';
import { LinesModule } from './lines/lines.module';

@Module({ imports: [LinesModule] })
export class AppModule {}
