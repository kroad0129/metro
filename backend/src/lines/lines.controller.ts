import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { LinesService } from './lines.service';

@Controller('lines')
export class LinesController {
  constructor(private readonly lines: LinesService) {}

  @Get(':lineId/stations')
  getStations(@Param('lineId') lineId: string) {
    const line = this.lines.getLine(lineId);
    if (!line) {
      throw new NotFoundException({
        error: { code: 'LINE_NOT_FOUND', message: `지원하지 않는 노선입니다: ${lineId}` },
      });
    }
    return { lineId: line.lineId, lineName: line.lineName, stations: line.stations };
  }
}
