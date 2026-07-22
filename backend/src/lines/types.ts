export type DirectionId = 'UP' | 'DOWN';

export type Station = {
  stationId: string;
  name: string;
  order: number;
  isExpressStop: boolean;
};

export type Line = {
  lineId: string;
  lineName: string;
  stations: Station[];
};
