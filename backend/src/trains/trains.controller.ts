import { Controller, Get, Param } from '@nestjs/common';
import { TrainsService } from './trains.service';

@Controller('lines')
export class TrainsController {
  constructor(private readonly trains: TrainsService) {}

  @Get(':lineId/stations/:stationId/trains')
  getTrains(@Param('lineId') lineId: string, @Param('stationId') stationId: string) {
    return this.trains.getTrains(lineId, stationId);
  }
}
