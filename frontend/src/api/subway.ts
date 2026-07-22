import { StationsResponse, TrainsResponse } from '../types/subway';
import { requestJson } from './client';

const LINE_ID = '9';

export function getStations(): Promise<StationsResponse> {
  return requestJson<StationsResponse>(`/api/lines/${LINE_ID}/stations`);
}

export function getTrains(stationId: string): Promise<TrainsResponse> {
  return requestJson<TrainsResponse>(
    `/api/lines/${LINE_ID}/stations/${encodeURIComponent(stationId)}/trains`,
  );
}
