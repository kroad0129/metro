import { Injectable } from '@nestjs/common';
import { Line, Station } from './types';
import line9 from './data/line9.json';

const LINES: Line[] = [line9 as Line];

function normalizeName(name: string): string {
  return name.trim().replace(/역$/, '');
}

@Injectable()
export class LinesService {
  private readonly byId = new Map<string, Line>();

  constructor() {
    for (const line of LINES) {
      this.byId.set(line.lineId, line);
    }
  }

  getLine(lineId: string): Line | null {
    return this.byId.get(lineId) ?? null;
  }

  getStations(lineId: string): Station[] {
    return this.getLine(lineId)?.stations ?? [];
  }

  findStationById(lineId: string, stationId: string): Station | null {
    return this.getStations(lineId).find((s) => s.stationId === stationId) ?? null;
  }

  findStationByName(lineId: string, name: string): Station | null {
    const target = normalizeName(name);
    return this.getStations(lineId).find((s) => normalizeName(s.name) === target) ?? null;
  }

  getStationByOrder(lineId: string, order: number): Station | null {
    return this.getStations(lineId).find((s) => s.order === order) ?? null;
  }
}
